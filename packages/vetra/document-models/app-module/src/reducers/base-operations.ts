import type { AppModuleBaseOperationsOperations } from "@powerhousedao/vetra/document-models/app-module";

export const reducer: AppModuleBaseOperationsOperations = {
  setAppNameOperation(state, action, dispatch) {
    const trimmedName = action.input.name.trim();
    if (trimmedName === "") {
      throw new Error("App name cannot be empty");
    }
    state.name = trimmedName;
  },
  setAppStatusOperation(state, action, dispatch) {
    state.status = action.input.status;
  },
  addDocumentTypeOperation(state, action, dispatch) {
    const existingAllowedDocumentTypes = state.allowedDocumentTypes ?? [];
    const newDocumentType = action.input.documentType;
    const newAllowedDocumentTypesSet = new Set(
      existingAllowedDocumentTypes,
    ).add(newDocumentType);
    const newAllowedDocumentTypes = [...newAllowedDocumentTypesSet];
    state.allowedDocumentTypes = newAllowedDocumentTypes;
  },
  removeDocumentTypeOperation(state, action, dispatch) {
    const existingAllowedDocumentTypes = state.allowedDocumentTypes;
    const documentTypeToRemove = action.input.documentType;
    const newAllowedDocumentTypes = existingAllowedDocumentTypes?.filter(
      (dt) => dt !== documentTypeToRemove,
    );
    state.allowedDocumentTypes = newAllowedDocumentTypes ?? [];
  },
  setDocumentTypesOperation(state, action, dispatch) {
    state.allowedDocumentTypes = action.input.documentTypes;
  },
};
export const appModuleBaseOperationsOperations: AppModuleBaseOperationsOperations =
  {
    setAppNameOperation(state, action) {
      // TODO: Implement "setAppNameOperation" reducer
      throw new Error('Reducer "setAppNameOperation" not yet implemented');
    },
    setAppStatusOperation(state, action) {
      // TODO: Implement "setAppStatusOperation" reducer
      throw new Error('Reducer "setAppStatusOperation" not yet implemented');
    },
    addDocumentTypeOperation(state, action) {
      // TODO: Implement "addDocumentTypeOperation" reducer
      throw new Error('Reducer "addDocumentTypeOperation" not yet implemented');
    },
    removeDocumentTypeOperation(state, action) {
      // TODO: Implement "removeDocumentTypeOperation" reducer
      throw new Error(
        'Reducer "removeDocumentTypeOperation" not yet implemented',
      );
    },
    setDocumentTypesOperation(state, action) {
      // TODO: Implement "setDocumentTypesOperation" reducer
      throw new Error(
        'Reducer "setDocumentTypesOperation" not yet implemented',
      );
    },
  };
