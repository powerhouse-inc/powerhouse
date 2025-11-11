import type { AppModuleBaseOperationsOperations } from "@powerhousedao/vetra/document-models/app-module";

export const appModuleBaseOperationsOperations: AppModuleBaseOperationsOperations =
  {
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
