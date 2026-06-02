import type { SubgraphModuleBaseOperationsOperations } from "document-models/subgraph-module/v1";

export const subgraphModuleBaseOperationsOperations: SubgraphModuleBaseOperationsOperations =
  {
    setSubgraphNameOperation(state, action, _dispatch) {
      const trimmedName = action.input.name.trim();
      if (trimmedName === "") {
        throw new Error("Subgraph name cannot be empty");
      }
      state.name = trimmedName;
    },
    setSubgraphStatusOperation(state, action, _dispatch) {
      state.status = action.input.status;
    },
  };
