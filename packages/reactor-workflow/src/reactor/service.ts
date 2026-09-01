// Package-level runtime shared by the subgraph (config + manual fire) and the
// document-event processor; moves to a dedicated runtime package later.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import {
  runWorkflow,
  type BlockExecutor,
  type WorkflowRunResult,
} from "@powerhousedao/reactor-connectors";
import { childLogger, type OperationWithContext } from "document-model";
import type {
  WorkflowDocument,
  WorkflowState,
} from "document-models/workflow/v1";
import { createBlockExecutor, toWorkflowDefinition } from "./lib.js";

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
  private readonly registry = new Map<string, DocumentEventRegistration>();

  // Called by the subgraph on construction; seeds the trigger registry.
  configure(subgraph: BaseSubgraph): void {
    if (this.subgraph) return;
    this.subgraph = subgraph;
    this.seedRegistry().catch((error: unknown) => {
      logger.error("Failed to seed document-event registry", error);
    });
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
        this.fire(registration.workflowId, payload).then(
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

  async fire(
    workflowId: string,
    triggerPayload?: unknown,
  ): Promise<WorkflowRunResult> {
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
    return runWorkflow({ definition, executor: this.executor, triggerPayload });
  }
}

export const workflowRuntime = new WorkflowRuntimeService();
