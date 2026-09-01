import { type BaseSubgraph } from "@powerhousedao/reactor-api";
import { workflowRuntime } from "./service.js";

interface FireArgs {
  workflowId: string;
  payload?: unknown;
}

export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => {
  workflowRuntime.configure(subgraph);

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
      fire: (_parent: unknown, args: FireArgs) =>
        workflowRuntime.fire(args.workflowId, args.payload),
    },
  };
};
