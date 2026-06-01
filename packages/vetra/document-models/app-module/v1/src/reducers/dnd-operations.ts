import type { AppModuleDndOperationsOperations } from "document-models/app-module/v1";

export const appModuleDndOperationsOperations: AppModuleDndOperationsOperations =
  {
    setDragAndDropEnabledOperation(state, action, _dispatch) {
      state.isDragAndDropEnabled = action.input.enabled;
    },
  };
