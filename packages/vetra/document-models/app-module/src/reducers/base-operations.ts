import type { AppModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: AppModuleBaseOperationsOperations = {
  setAppNameOperation(state, action, dispatch) {
    state.name = action.input.name;
  },
  setAppStatusOperation(state, action, dispatch) {
    state.status = action.input.status;
  },
};
