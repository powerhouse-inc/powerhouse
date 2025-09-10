import type { SubgraphModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: SubgraphModuleBaseOperationsOperations = {
  setSubgraphNameOperation(state, action, dispatch) {
    state.name = action.input.name;
  },
  setSubgraphStatusOperation(state, action, dispatch) {
    state.status = action.input.status;
  },
};
