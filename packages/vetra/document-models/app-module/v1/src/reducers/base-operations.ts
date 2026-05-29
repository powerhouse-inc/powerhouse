import type { AppModuleBaseOperationsOperations } from "document-models/app-module/v1";

export const appModuleBaseOperationsOperations: AppModuleBaseOperationsOperations =
  {
    setAppNameOperation(state, action, _dispatch) {
      const trimmedName = action.input.name.trim();
      if (trimmedName === "") {
        throw new Error("App name cannot be empty");
      }
      state.name = trimmedName;
    },
    setAppStatusOperation(state, action, _dispatch) {
      state.status = action.input.status;
    },
    addDocumentTypeOperation(state, action, _dispatch) {
      const existingAllowedDocumentTypes = state.allowedDocumentTypes ?? [];
      const newDocumentType = action.input.documentType;
      const newAllowedDocumentTypesSet = new Set(
        existingAllowedDocumentTypes,
      ).add(newDocumentType);
      const newAllowedDocumentTypes = [...newAllowedDocumentTypesSet];
      state.allowedDocumentTypes = newAllowedDocumentTypes;
    },
    removeDocumentTypeOperation(state, action, _dispatch) {
      const existingAllowedDocumentTypes = state.allowedDocumentTypes;
      const documentTypeToRemove = action.input.documentType;
      const newAllowedDocumentTypes = existingAllowedDocumentTypes?.filter(
        (dt) => dt !== documentTypeToRemove,
      );
      state.allowedDocumentTypes = newAllowedDocumentTypes ?? [];
    },
    setDocumentTypesOperation(state, action, _dispatch) {
      state.allowedDocumentTypes = action.input.documentTypes;
    },
  };
