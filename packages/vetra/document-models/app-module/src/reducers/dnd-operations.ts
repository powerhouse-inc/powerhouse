import type { AppModuleDndOperationsOperations } from "../../gen/dnd-operations/operations.js";

const defaultDragAndDrop = { enabled: false, documentTypes: [] };

export const reducer: AppModuleDndOperationsOperations = {
  setDragAndDropEnabledOperation(state, action, dispatch) {
    const dragAndDrop = state.dragAndDrop ?? defaultDragAndDrop;
    dragAndDrop.enabled = action.input.enabled;
    state.dragAndDrop = dragAndDrop;
  },
};
