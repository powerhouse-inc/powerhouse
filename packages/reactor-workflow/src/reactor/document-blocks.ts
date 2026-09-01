// Host-side core#document-* blocks: create documents and dispatch actions
// through the reactor client. Pieces never get reactor access; these do.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import type {
  BlockExecution,
  BlockExecutor,
  BlockResult,
} from "@powerhousedao/reactor-connectors";
import { createAction, type Action, type PHDocument } from "document-model";

export const DOCUMENT_CREATE_BLOCK = "core#document-create";
export const DOCUMENT_DISPATCH_BLOCK = "core#document-dispatch";

interface ActionInputConfig {
  type: string;
  input?: unknown;
  scope?: string;
}

function parseActions(value: unknown, blockType: string): ActionInputConfig[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry, index) => {
    const record = entry as Record<string, unknown> | null;
    if (!record || typeof record.type !== "string") {
      throw new Error(`${blockType}: actions[${index}] needs a string "type"`);
    }
    return {
      type: record.type,
      input: record.input,
      scope: typeof record.scope === "string" ? record.scope : undefined,
    };
  });
}

// Reducer failures don't reject execute(); they land on the operations. Fail
// the step when any of the freshly appended operations carries an error.
function assertOperationsApplied(document: PHDocument, count: number): void {
  const operations = Object.values(document.operations).flat();
  const recent = operations
    .sort((a, b) => a.index - b.index)
    .slice(-Math.max(count, 1));
  const failed = recent.find((operation) => operation.error !== undefined);
  if (failed) {
    throw new Error(
      `Action ${failed.action.type} failed: ${failed.error ?? "unknown error"}`,
    );
  }
}

export class DocumentBlockExecutor implements BlockExecutor {
  constructor(private readonly subgraph: BaseSubgraph) {}

  async execute(execution: BlockExecution): Promise<BlockResult> {
    const config = (execution.config ?? {}) as Record<string, unknown>;
    if (execution.blockType === DOCUMENT_CREATE_BLOCK) {
      return this.createDocument(config);
    }
    if (execution.blockType === DOCUMENT_DISPATCH_BLOCK) {
      return this.dispatchActions(config);
    }
    throw new Error(`Unsupported document block "${execution.blockType}"`);
  }

  private buildActions(configs: ActionInputConfig[]): Action[] {
    return configs.map((entry) =>
      createAction(
        entry.type,
        entry.input,
        undefined,
        undefined,
        entry.scope ?? "global",
      ),
    );
  }

  // config: { documentType!, name?, parentId?, actions? }
  private async createDocument(
    config: Record<string, unknown>,
  ): Promise<BlockResult> {
    const documentType = config.documentType;
    if (typeof documentType !== "string" || !documentType) {
      throw new Error(`${DOCUMENT_CREATE_BLOCK}: "documentType" is required`);
    }
    const client = this.subgraph.reactorClient;
    let document = await client.createEmpty<PHDocument>(documentType, {
      parentIdentifier:
        typeof config.parentId === "string" ? config.parentId : undefined,
    });

    const followUps = this.buildActions(
      parseActions(config.actions, DOCUMENT_CREATE_BLOCK),
    );
    if (typeof config.name === "string" && config.name) {
      followUps.unshift(createAction("SET_NAME", { name: config.name }));
    }
    if (followUps.length > 0) {
      document = await client.execute<PHDocument>(
        document.header.id,
        "main",
        followUps,
      );
      assertOperationsApplied(document, followUps.length);
    }

    return {
      output: {
        documentId: document.header.id,
        documentType: document.header.documentType,
        name: document.header.name,
        state: (document.state as Record<string, unknown>).global,
      },
    };
  }

  // config: { documentId!, actions!, branch? }
  private async dispatchActions(
    config: Record<string, unknown>,
  ): Promise<BlockResult> {
    const documentId = config.documentId;
    if (typeof documentId !== "string" || !documentId) {
      throw new Error(`${DOCUMENT_DISPATCH_BLOCK}: "documentId" is required`);
    }
    const actions = this.buildActions(
      parseActions(config.actions, DOCUMENT_DISPATCH_BLOCK),
    );
    if (actions.length === 0) {
      throw new Error(
        `${DOCUMENT_DISPATCH_BLOCK}: "actions" must be a non-empty list`,
      );
    }
    const branch = typeof config.branch === "string" ? config.branch : "main";
    const document = await this.subgraph.reactorClient.execute<PHDocument>(
      documentId,
      branch,
      actions,
    );
    assertOperationsApplied(document, actions.length);

    return {
      output: {
        documentId: document.header.id,
        documentType: document.header.documentType,
        name: document.header.name,
        state: (document.state as Record<string, unknown>).global,
      },
    };
  }
}
