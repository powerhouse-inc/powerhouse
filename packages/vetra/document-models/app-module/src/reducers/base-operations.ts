import type { AppModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: AppModuleBaseOperationsOperations = {
  setAppNameOperation(state, action, dispatch) {
    state.name = action.input.name;
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
    if (!newAllowedDocumentTypes?.length) {
      state.allowedDocumentTypes = null;
    } else {
      state.allowedDocumentTypes = newAllowedDocumentTypes;
    }
  },
};
