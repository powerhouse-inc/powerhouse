import type { SubgraphModuleBaseOperationsOperations } from "@powerhousedao/vetra/document-models/subgraph-module";

export const subgraphModuleBaseOperationsOperations: SubgraphModuleBaseOperationsOperations =
  {
    setSubgraphNameOperation(state, action, dispatch) {
      const trimmedName = action.input.name.trim();
      if (trimmedName === "") {
        throw new Error("Subgraph name cannot be empty");
      }
      state.name = trimmedName;
    },
    setSubgraphStatusOperation(state, action, dispatch) {
      state.status = action.input.status;
    },
  };
