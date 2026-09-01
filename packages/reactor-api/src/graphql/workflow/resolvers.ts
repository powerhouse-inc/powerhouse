import { type BaseSubgraph } from "@powerhousedao/reactor-api";
import {
  runWorkflow,
  type BlockExecutor,
} from "@powerhousedao/reactor-connectors";
import type {
  WorkflowDocument,
  WorkflowState,
} from "document-models/workflow/v1";
import { createBlockExecutor, toWorkflowDefinition } from "./lib.js";

interface FireArgs {
  workflowId: string;
  payload?: unknown;
}

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  const reactor = subgraph.reactorClient;
  // Lazy so loading the subgraph never forks a worker until the first run.
  let executor: BlockExecutor | undefined;

  return {
    Query: {
      workflowRuntime: () => ({}),
    },
    WorkflowRuntimeQueries: {
      health: () => "ok",
    },
    Mutation: {
      workflowRuntime: () => ({}),
    },
    WorkflowRuntimeMutations: {
      fire: async (_parent: unknown, args: FireArgs) => {
        const document = await reactor.get<WorkflowDocument>(args.workflowId);
        if (document.header.documentType !== "powerhouse/workflow") {
          throw new Error(
            `Document "${args.workflowId}" is not a powerhouse/workflow`,
          );
        }
        const state: WorkflowState = document.state.global;
        if (state.status !== "ENABLED") {
          throw new Error(
            `Workflow is ${state.status}; only ENABLED workflows can fire`,
          );
        }
        const definition = toWorkflowDefinition(state);
        executor ??= createBlockExecutor(subgraph);
        return runWorkflow({
          definition,
          executor,
          triggerPayload: args.payload,
        });
      },
    },
  };
};
