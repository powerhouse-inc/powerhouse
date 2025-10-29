import type { AppModuleDndOperationsOperations } from "../../gen/dnd-operations/operations.js";
import type { AppModuleDndOperationsOperations } from "@powerhousedao/vetra/document-models/app-module";

export const reducer: AppModuleDndOperationsOperations = {
  setDragAndDropEnabledOperation(state, action, dispatch) {
    state.isDragAndDropEnabled = action.input.enabled;
  },
};
export const appModuleDndOperationsOperations: AppModuleDndOperationsOperations = {
    setDragAndDropEnabledOperation(state, action) {
        // TODO: Implement "setDragAndDropEnabledOperation" reducer
        throw new Error('Reducer "setDragAndDropEnabledOperation" not yet implemented');
    }
};
