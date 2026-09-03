// Scaffold file meant for customization; delete and re-run codegen to reset.
import type { BaseSubgraph } from "@powerhousedao/reactor-api";
import {
  ActivepiecesBlockExecutor,
  CompositeBlockExecutor,
  shapeAuthValue,
  type BlockExecutor,
  type ConnectionAuthType,
  type EngineConnectionResolver,
  type SecretProvider,
  type WorkflowDefinition,
} from "@powerhousedao/reactor-connectors";
import type {
  ConnectionDocument,
  ConnectionState,
} from "document-models/connection/v1";
import {
  DOCUMENT_CREATE_BLOCK,
  DOCUMENT_DISPATCH_BLOCK,
  DOCUMENT_FIND_BLOCK,
  DOCUMENT_GET_BLOCK,
  DOCUMENT_SCHEMA_BLOCK,
  DocumentBlockExecutor,
} from "./document-blocks.js";
import type { WorkflowState } from "document-models/workflow/v1";
import { join } from "node:path";

// Resolves a step's connectionId to a powerhouse/connection document and
// shapes its auth value; secret refs resolve through the managed store.
export class DocumentConnectionResolver implements EngineConnectionResolver {
  constructor(
    private readonly subgraph: BaseSubgraph,
    private readonly secrets: SecretProvider,
  ) {}

  async resolve(connectionId: string): Promise<unknown> {
    const document =
      await this.subgraph.reactorClient.get<ConnectionDocument>(connectionId);
    if (document.header.documentType !== "powerhouse/connection") {
      throw new Error(
        `Document "${connectionId}" is not a powerhouse/connection`,
      );
    }
    const state: ConnectionState = document.state.global;
    if (state.status === "REVOKED") {
      throw new Error(`Connection "${state.name || connectionId}" is revoked`);
    }
    return shapeAuthValue(
      {
        authType: state.authType as ConnectionAuthType,
        config: (state.config ?? {}) as Record<string, unknown>,
        secretRefs: state.secretRefs,
      },
      this.secrets,
    );
  }
}

export const BUNDLE_CACHE_DIR = join(process.cwd(), ".ph", "ap-bundles");

export function createBlockExecutor(
  subgraph: BaseSubgraph,
  secrets: SecretProvider,
): BlockExecutor {
  const documents = new DocumentBlockExecutor(subgraph);
  return new CompositeBlockExecutor(
    new ActivepiecesBlockExecutor({
      cacheDir: BUNDLE_CACHE_DIR,
      connections: new DocumentConnectionResolver(subgraph, secrets),
    }),
    {
      [DOCUMENT_CREATE_BLOCK]: documents,
      [DOCUMENT_DISPATCH_BLOCK]: documents,
      [DOCUMENT_GET_BLOCK]: documents,
      [DOCUMENT_FIND_BLOCK]: documents,
      [DOCUMENT_SCHEMA_BLOCK]: documents,
    },
  );
}

// The document state is the definition; strip nulls into engine shape.
export function toWorkflowDefinition(state: WorkflowState): WorkflowDefinition {
  if (!state.trigger) {
    throw new Error("Workflow has no trigger binding");
  }
  return {
    name: state.name,
    trigger: {
      id: state.trigger.id,
      blockType: state.trigger.blockType,
      connectionId: state.trigger.connectionId,
      config: state.trigger.config,
      filter: state.trigger.filter,
    },
    steps: state.steps.map((step) => ({
      id: step.id,
      key: step.key,
      name: step.name,
      blockType: step.blockType,
      connectionId: step.connectionId,
      config: step.config,
      timeoutSeconds: step.timeoutSeconds,
    })),
    edges: state.edges.map((edge) => ({
      id: edge.id,
      from: edge.from,
      to: edge.to,
      port: edge.port,
      condition: edge.condition,
    })),
    variables: state.variables.map((variable) => ({
      key: variable.key,
      value: variable.value,
    })),
  };
}
