import type { AppModuleDndOperationsOperations } from "../../gen/dnd-operations/operations.js";

export const reducer: AppModuleDndOperationsOperations = {
  setDragAndDropEnabledOperation(state, action, dispatch) {
    state.isDragAndDropEnabled = action.input.enabled;
  },
};
