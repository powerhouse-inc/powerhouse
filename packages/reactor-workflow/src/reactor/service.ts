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
  DOCUMENT_OPTION_PROPS,
  resolveDocumentOptions,
} from "./document-options.js";
import {
  BUNDLE_CACHE_DIR,
  createBlockExecutor,
  DocumentConnectionResolver,
  toWorkflowDefinition,
} from "./lib.js";
import { WorkflowRunStore, type TriggerStateRow } from "./store.js";
import {
  TriggerSupervisor,
  type PieceTriggerBinding,
} from "./trigger-supervisor.js";
import {
  matchesEventFilter,
  matchesLifecycleFilter,
  parseEventFilter,
  parseLifecycleFilter,
  TRIGGER_KIND_BY_BLOCK,
  type DocumentEventFilter,
  type LifecycleFilter,
  type TriggerKind,
} from "./trigger-filters.js";

export type PersistedRunResult = WorkflowRunResult & { runId: string | null };

const logger = childLogger(["workflow", "runtime"]);

const DRIVE_DOCUMENT_TYPE = "powerhouse/document-drive";

type TriggerRegistration = {
  workflowId: string;
} & (
  | { kind: "document-event"; filter: DocumentEventFilter }
  | { kind: "document-created" | "document-deleted"; filter: LifecycleFilter }
  | { kind: "piece" }
);

function configRecord(config: unknown): Record<string, unknown> {
  if (config && typeof config === "object" && !Array.isArray(config)) {
    return config as Record<string, unknown>;
  }
  if (typeof config === "string") {
    try {
      const parsed = JSON.parse(config) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // fall through
    }
  }
  return {};
}

export class WorkflowRuntimeService {
  private subgraph?: BaseSubgraph;
  private executor?: BlockExecutor;
  private storePromise?: Promise<WorkflowRunStore>;
  private readonly registry = new Map<string, TriggerRegistration>();

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
    logger.info(`Trigger registry seeded: ${this.registry.size} workflow(s)`);
  }

  private updateRegistration(workflowId: string, state: WorkflowState): void {
    const trigger = state.status === "ENABLED" ? state.trigger : undefined;
    const kind: TriggerKind | undefined = trigger
      ? TRIGGER_KIND_BY_BLOCK[trigger.blockType]
      : undefined;
    const pieceBinding =
      trigger && !kind ? this.pieceBinding(workflowId, trigger) : undefined;

    if (!kind && !pieceBinding) {
      const had = this.registry.get(workflowId);
      this.registry.delete(workflowId);
      if (had?.kind === "piece") this.dropPieceTrigger(workflowId);
      return;
    }
    if (pieceBinding) {
      this.registry.set(workflowId, { workflowId, kind: "piece" });
      this.supervisor()
        .upsert(pieceBinding)
        .catch((error: unknown) => {
          logger.error(`Piece trigger enable failed for ${workflowId}`, error);
        });
      return;
    }
    const had = this.registry.get(workflowId);
    if (had?.kind === "piece") this.dropPieceTrigger(workflowId);
    const config = trigger?.config;
    this.registry.set(
      workflowId,
      kind === "document-event"
        ? { workflowId, kind, filter: parseEventFilter(config) }
        : { workflowId, kind: kind!, filter: parseLifecycleFilter(config) },
    );
  }

  private pieceBinding(
    workflowId: string,
    trigger: NonNullable<WorkflowState["trigger"]>,
  ): PieceTriggerBinding | undefined {
    const parsed = parseBlockType(trigger.blockType);
    if (!parsed || parsed.kind !== "trigger") return undefined;
    return {
      workflowId,
      blockType: trigger.blockType,
      packageName: parsed.packageName,
      version: parsed.version,
      triggerName: parsed.name,
      config: configRecord(trigger.config),
      connectionId: trigger.connectionId,
    };
  }

  private dropPieceTrigger(workflowId: string): void {
    this.supervisor()
      .remove(workflowId)
      .catch((error: unknown) => {
        logger.error(`Piece trigger disable failed for ${workflowId}`, error);
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

  // The manager routes by filter only, so every per-drive processor instance
  // delivers every matching operation; dedup keeps fires once-per-operation.
  private readonly seenOps = new Set<string>();
  private readonly seenOpsQueue: string[] = [];

  private alreadySeen(op: OperationWithContext): boolean {
    const key =
      op.context.ordinal > 0
        ? `o:${op.context.ordinal}`
        : `${op.context.documentId}:${op.context.scope}:${op.context.branch}:${op.operation.index}`;
    if (this.seenOps.has(key)) return true;
    this.seenOps.add(key);
    this.seenOpsQueue.push(key);
    if (this.seenOpsQueue.length > 8192) {
      const evicted = this.seenOpsQueue.shift();
      if (evicted) this.seenOps.delete(evicted);
    }
    return false;
  }

  // Called by the document-event processor. Registry updates are awaited;
  // fires are not, so runs never block operation ingestion.
  async onOperations(operations: OperationWithContext[]): Promise<void> {
    for (const { operation, context } of operations) {
      if (context.scope !== "global") continue;
      if (this.alreadySeen({ operation, context })) continue;
      if (context.documentType === "powerhouse/workflow") {
        await this.refreshRegistration(
          context.documentId,
          operation.resultingState,
        );
        continue;
      }
      if (operation.error !== undefined) continue;
      for (const registration of this.registry.values()) {
        if (registration.kind !== "document-event") continue;
        const matched = matchesEventFilter(
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
        this.fireFromTrigger(
          registration.workflowId,
          payload,
          registration.kind,
        );
      }
      if (context.documentType === DRIVE_DOCUMENT_TYPE) {
        await this.matchLifecycle(
          context.documentId,
          operation.action.type,
          operation.action.input,
          { index: operation.index, timestampUtcMs: operation.timestampUtcMs },
        );
      }
    }
  }

  private fireFromTrigger(
    workflowId: string,
    payload: unknown,
    kind: string,
  ): void {
    this.fire(workflowId, payload, kind).then(
      (run) => {
        logger.info(`${kind} fired workflow ${workflowId}: ${run.status}`);
      },
      (error: unknown) => {
        logger.error(`${kind} run failed for workflow ${workflowId}`, error);
      },
    );
  }

  // ADD_FILE / DELETE_NODE on a drive back the document lifecycle triggers.
  private async matchLifecycle(
    driveId: string,
    actionType: string,
    input: unknown,
    operation: { index: number; timestampUtcMs: string },
  ): Promise<void> {
    const kind: TriggerKind | undefined =
      actionType === "ADD_FILE"
        ? "document-created"
        : actionType === "DELETE_NODE"
          ? "document-deleted"
          : undefined;
    if (!kind) return;
    const targets = [...this.registry.values()].filter(
      (registration) => registration.kind === kind,
    );
    if (targets.length === 0) return;

    const record = (input ?? {}) as Record<string, unknown>;
    const documentId = typeof record.id === "string" ? record.id : undefined;
    if (!documentId) return;
    let documentType =
      typeof record.documentType === "string" ? record.documentType : undefined;
    let name = typeof record.name === "string" ? record.name : null;
    if (kind === "document-deleted") {
      // Best-effort: the document usually outlives its drive node. Folder
      // nodes never resolve, so a type filter also skips them.
      try {
        const document = await this.subgraph?.reactorClient.get(documentId);
        documentType = document?.header.documentType;
        name ??= document?.header.name ?? null;
      } catch {
        documentType = undefined;
      }
    }

    const payload = {
      documentId,
      documentType: documentType ?? null,
      name,
      driveId,
      parentId:
        typeof record.parentFolder === "string" ? record.parentFolder : null,
      operation,
    };
    for (const registration of targets) {
      if (registration.kind !== kind) continue;
      if (!matchesLifecycleFilter(registration.filter, documentType, driveId))
        continue;
      this.fireFromTrigger(registration.workflowId, payload, kind);
    }
  }

  private triggerSupervisor?: TriggerSupervisor;

  // Lazily built; started/stopped by the trigger processor's lifecycle.
  supervisor(): TriggerSupervisor {
    this.triggerSupervisor ??= new TriggerSupervisor({
      store: () => this.store(),
      resolveAuth: async (connectionId) => {
        if (!connectionId || !this.subgraph) return undefined;
        return new DocumentConnectionResolver(this.subgraph).resolve(
          connectionId,
        );
      },
      fire: (workflowId, payload, kind) => {
        this.fireFromTrigger(workflowId, payload, kind);
      },
      cacheDir: BUNDLE_CACHE_DIR,
      // Dev override; the 60s floor still applies.
      defaultIntervalMs:
        Number(process.env.WORKFLOW_POLL_INTERVAL_MS) || undefined,
    });
    return this.triggerSupervisor;
  }

  startTriggerSupervisor(): void {
    this.supervisor().start();
    if (!sigtermHooked) {
      sigtermHooked = true;
      process.once("SIGTERM", () => this.stopTriggerSupervisor());
    }
  }

  stopTriggerSupervisor(): void {
    this.triggerSupervisor?.stop();
  }

  async triggerStates(): Promise<TriggerStateRow[]> {
    const store = await this.store();
    return store ? store.listTriggerStates() : [];
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

  // Design-time: the action/trigger descriptor (props, auth) driving the
  // editor form; triggers come back under a "trigger" key.
  async blockDescriptor(blockType: string): Promise<unknown> {
    const parsed = parseBlockType(blockType);
    if (!parsed) return null;
    const descriptor = await this.pieceDescriptor(
      parsed.packageName,
      parsed.version,
    );
    const common = {
      displayName: descriptor.displayName,
      logoUrl: descriptor.logoUrl,
      auth: descriptor.auth ?? null,
    };
    if (parsed.kind === "trigger") {
      const trigger = descriptor.triggers.find(
        (entry) => entry.name === parsed.name,
      );
      return trigger ? { ...common, trigger } : null;
    }
    const action = descriptor.actions.find(
      (entry) => entry.name === parsed.name,
    );
    return action ? { ...common, action } : null;
  }

  // Design-time DROPDOWN options() / DYNAMIC props(), run in the piece worker.
  async blockOptions(
    blockType: string,
    propName: string,
    input?: unknown,
    connectionId?: string,
  ): Promise<unknown> {
    const parsed = parseBlockType(blockType);
    if (!parsed) {
      // Core blocks: document-aware props resolve against the reactor.
      if (this.subgraph && DOCUMENT_OPTION_PROPS.has(propName)) {
        return resolveDocumentOptions(
          this.subgraph.reactorClient,
          propName,
          (input ?? {}) as Record<string, unknown>,
        );
      }
      throw new Error(`Not a piece block type: "${blockType}"`);
    }
    // Auth-dependent options() resolvers need the step's connection.
    let auth: unknown;
    if (connectionId && this.subgraph) {
      auth = await new DocumentConnectionResolver(this.subgraph).resolve(
        connectionId,
      );
    }
    const bundle = await ensurePieceBundle({
      name: parsed.packageName,
      version: parsed.version,
      cacheDir: BUNDLE_CACHE_DIR,
    });
    this.designWorker ??= new PieceWorker();
    const result = await this.designWorker.resolveOptions({
      bundleDir: bundle.dir,
      actionName: parsed.name,
      kind: parsed.kind,
      propName,
      refresherValues: (input ?? {}) as Record<string, unknown>,
      auth,
    });
    return result.output;
  }

  // Runs the trigger's test hook; the test store prefix keeps cursors intact.
  async testTrigger(workflowId: string): Promise<unknown> {
    if (!this.subgraph) {
      throw new Error("Workflow runtime is not configured yet");
    }
    const document =
      await this.subgraph.reactorClient.get<WorkflowDocument>(workflowId);
    const trigger = document.state.global.trigger;
    if (!trigger) throw new Error("Workflow has no trigger");
    const binding = this.pieceBinding(workflowId, trigger);
    if (!binding) {
      throw new Error(`"${trigger.blockType}" is not a piece trigger`);
    }
    return this.supervisor().test(binding);
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

let sigtermHooked = false;

export const workflowRuntime = new WorkflowRuntimeService();
