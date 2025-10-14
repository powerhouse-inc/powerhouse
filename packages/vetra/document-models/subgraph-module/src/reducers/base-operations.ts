import type { SubgraphModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: SubgraphModuleBaseOperationsOperations = {
  setSubgraphNameOperation(state, action, dispatch) {
    if (action.input.name.trim() === "") {
      throw new Error("Subgraph name cannot be empty");
    }
    state.name = action.input.name;
  },
  setSubgraphStatusOperation(state, action, dispatch) {
    state.status = action.input.status;
  },
};
