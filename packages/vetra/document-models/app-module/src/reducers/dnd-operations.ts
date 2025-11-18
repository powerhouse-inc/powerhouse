import type { AppModuleDndOperationsOperations } from "@powerhousedao/vetra/document-models/app-module";

export const appModuleDndOperationsOperations: AppModuleDndOperationsOperations =
  {
    setDragAndDropEnabledOperation(state, action, dispatch) {
      state.isDragAndDropEnabled = action.input.enabled;
    },
  };
