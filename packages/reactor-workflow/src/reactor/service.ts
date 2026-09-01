// Package-level runtime shared by the subgraph (config + manual fire) and the
// document-event processor; moves to a dedicated runtime package later.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import {
  buildDescriptor,
  ensurePieceBundle,
  loadPieceFromDir,
  parseBlockType,
  PieceWorker,
  runWorkflow,
  type BlockExecutor,
  type ConnectorDescriptor,
  type WorkflowRunResult,
} from "@powerhousedao/reactor-connectors";
import { childLogger, type OperationWithContext } from "document-model";
import type {
  WorkflowDocument,
  WorkflowState,
} from "document-models/workflow/v1";
import {
  BUNDLE_CACHE_DIR,
  createBlockExecutor,
  toWorkflowDefinition,
} from "./lib.js";
import { WorkflowRunStore } from "./store.js";

export type PersistedRunResult = WorkflowRunResult & { runId: string | null };

const DOCUMENT_EVENT_BLOCK = "core#document-event";

const logger = childLogger(["workflow", "runtime"]);

// core#document-event trigger config: each field a string or list; omitted
// fields match everything. Scope/branch are fixed by the processor filter.
interface DocumentEventFilter {
  documentType?: string[];
  documentId?: string[];
  actionType?: string[];
}

interface DocumentEventRegistration {
  workflowId: string;
  filter: DocumentEventFilter;
}

function toList(value: unknown): string[] | undefined {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) {
    const strings = value.filter((item) => typeof item === "string");
    return strings.length > 0 ? strings : undefined;
  }
  return undefined;
}

function parseEventFilter(config: unknown): DocumentEventFilter {
  if (config === null || typeof config !== "object") return {};
  const record = config as Record<string, unknown>;
  return {
    documentType: toList(record.documentType),
    documentId: toList(record.documentId),
    actionType: toList(record.actionType),
  };
}

function matchesFilter(
  filter: DocumentEventFilter,
  documentType: string,
  documentId: string,
  actionType: string,
): boolean {
  const ok = (list: string[] | undefined, value: string) =>
    !list || list.includes(value);
  return (
    ok(filter.documentType, documentType) &&
    ok(filter.documentId, documentId) &&
    ok(filter.actionType, actionType)
  );
}

export class WorkflowRuntimeService {
  private subgraph?: BaseSubgraph;
  private executor?: BlockExecutor;
  private storePromise?: Promise<WorkflowRunStore>;
  private readonly registry = new Map<string, DocumentEventRegistration>();

  // Called by the subgraph on construction; seeds the trigger registry and
  // opens the run journal.
  configure(subgraph: BaseSubgraph): void {
    if (this.subgraph) return;
    this.subgraph = subgraph;
    this.storePromise = WorkflowRunStore.create(subgraph.relationalDb);
    this.storePromise.catch((error: unknown) => {
      logger.error("Failed to open the workflow run store", error);
    });
    this.seedRegistry().catch((error: unknown) => {
      logger.error("Failed to seed document-event registry", error);
    });
  }

  // The journal is best-effort: a broken store never blocks runs.
  async store(): Promise<WorkflowRunStore | undefined> {
    if (!this.storePromise) return undefined;
    try {
      return await this.storePromise;
    } catch {
      return undefined;
    }
  }

  private async seedRegistry(): Promise<void> {
    if (!this.subgraph) return;
    const page = await this.subgraph.reactorClient.find({
      type: "powerhouse/workflow",
    });
    for (const document of page.results as WorkflowDocument[]) {
      this.updateRegistration(document.header.id, document.state.global);
    }
    logger.info(
      `Document-event registry seeded: ${this.registry.size} workflow(s)`,
    );
  }

  private updateRegistration(workflowId: string, state: WorkflowState): void {
    const eligible =
      state.status === "ENABLED" &&
      state.trigger?.blockType === DOCUMENT_EVENT_BLOCK;
    if (!eligible) {
      this.registry.delete(workflowId);
      return;
    }
    this.registry.set(workflowId, {
      workflowId,
      filter: parseEventFilter(state.trigger?.config),
    });
  }

  private async refreshRegistration(
    workflowId: string,
    resultingState?: string,
  ): Promise<void> {
    if (resultingState) {
      try {
        this.updateRegistration(
          workflowId,
          JSON.parse(resultingState) as WorkflowState,
        );
        return;
      } catch {
        // fall through to a fresh read
      }
    }
    if (!this.subgraph) return;
    const document =
      await this.subgraph.reactorClient.get<WorkflowDocument>(workflowId);
    this.updateRegistration(workflowId, document.state.global);
  }

  // Called by the document-event processor. Registry updates are awaited;
  // fires are not, so runs never block operation ingestion.
  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      if (context.scope !== "global") continue;
      if (context.documentType === "powerhouse/workflow") {
        await this.refreshRegistration(
          context.documentId,
          operation.resultingState,
        );
        continue;
      }
      if (operation.error !== undefined) continue;
      for (const registration of this.registry.values()) {
        const matched = matchesFilter(
          registration.filter,
          context.documentType,
          context.documentId,
          operation.action.type,
        );
        if (!matched) continue;
        const payload = {
          documentId: context.documentId,
          documentType: context.documentType,
          branch: context.branch,
          scope: context.scope,
          action: {
            type: operation.action.type,
            input: operation.action.input,
          },
          operation: {
            index: operation.index,
            timestampUtcMs: operation.timestampUtcMs,
          },
        };
        this.fire(registration.workflowId, payload, "document-event").then(
          (run) => {
            logger.info(
              `document-event fired workflow ${registration.workflowId}: ${run.status}`,
            );
          },
          (error: unknown) => {
            logger.error(
              `document-event run failed for workflow ${registration.workflowId}`,
              error,
            );
          },
        );
      }
    }
  }

  private readonly descriptors = new Map<string, ConnectorDescriptor>();
  private designWorker?: PieceWorker;

  private async pieceDescriptor(
    packageName: string,
    version: string,
  ): Promise<ConnectorDescriptor> {
    const cacheKey = `${packageName}@${version}`;
    let descriptor = this.descriptors.get(cacheKey);
    if (!descriptor) {
      const bundle = await ensurePieceBundle({
        name: packageName,
        version,
        cacheDir: BUNDLE_CACHE_DIR,
      });
      const { piece } = await loadPieceFromDir(bundle.dir);
      descriptor = buildDescriptor(piece, { packageName, version });
      this.descriptors.set(cacheKey, descriptor);
    }
    return descriptor;
  }

  // Design-time: the action descriptor (props, auth) driving the editor form.
  async blockDescriptor(blockType: string): Promise<unknown> {
    const parsed = parseBlockType(blockType);
    if (!parsed) return null;
    const descriptor = await this.pieceDescriptor(
      parsed.packageName,
      parsed.version,
    );
    const action = descriptor.actions.find(
      (entry) => entry.name === parsed.actionName,
    );
    if (!action) return null;
    return {
      displayName: descriptor.displayName,
      logoUrl: descriptor.logoUrl,
      auth: descriptor.auth ?? null,
      action,
    };
  }

  // Design-time DROPDOWN options() / DYNAMIC props(), run in the piece worker.
  async blockOptions(
    blockType: string,
    propName: string,
    input?: unknown,
  ): Promise<unknown> {
    const parsed = parseBlockType(blockType);
    if (!parsed) {
      throw new Error(`Not a piece block type: "${blockType}"`);
    }
    const bundle = await ensurePieceBundle({
      name: parsed.packageName,
      version: parsed.version,
      cacheDir: BUNDLE_CACHE_DIR,
    });
    this.designWorker ??= new PieceWorker();
    const result = await this.designWorker.resolveOptions({
      bundleDir: bundle.dir,
      actionName: parsed.actionName,
      propName,
      refresherValues: (input ?? {}) as Record<string, unknown>,
    });
    return result.output;
  }

  async fire(
    workflowId: string,
    triggerPayload?: unknown,
    triggerKind = "manual",
  ): Promise<PersistedRunResult> {
    if (!this.subgraph) {
      throw new Error("Workflow runtime is not configured yet");
    }
    const document =
      await this.subgraph.reactorClient.get<WorkflowDocument>(workflowId);
    if (document.header.documentType !== "powerhouse/workflow") {
      throw new Error(`Document "${workflowId}" is not a powerhouse/workflow`);
    }
    const state = document.state.global;
    if (state.status !== "ENABLED") {
      throw new Error(
        `Workflow is ${state.status}; only ENABLED workflows can fire`,
      );
    }
    const definition = toWorkflowDefinition(state);
    this.executor ??= createBlockExecutor(this.subgraph);

    const store = await this.store();
    const runId =
      (await store?.startRun({
        workflowId,
        workflowName: state.name,
        workflowVersion: state.version,
        triggerKind,
        triggerPayload,
      })) ?? null;
    try {
      const result = await runWorkflow({
        definition,
        executor: this.executor,
        triggerPayload,
      });
      if (store && runId) await store.finishRun(runId, result);
      return { ...result, runId };
    } catch (error) {
      if (store && runId) {
        await store.failRun(
          runId,
          error instanceof Error ? error.message : String(error),
        );
      }
      throw error;
    }
  }
}

export const workflowRuntime = new WorkflowRuntimeService();
