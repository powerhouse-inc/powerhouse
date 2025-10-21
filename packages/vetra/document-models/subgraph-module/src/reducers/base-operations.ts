import type { SubgraphModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: SubgraphModuleBaseOperationsOperations = {
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
