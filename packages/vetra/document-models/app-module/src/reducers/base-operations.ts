import type { AppModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

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
    const documentTypes = state.documentTypes ?? [];

    // Check for duplicate ID
    const existingId = documentTypes.find((dt) => dt.id === action.input.id);
    if (existingId) {
      throw new Error(
        `Document type with id "${action.input.id}" already exists`,
      );
    }

    documentTypes.push({
      id: action.input.id,
      documentType: action.input.documentType,
    });
    state.documentTypes = documentTypes;
  },
  removeDocumentTypeOperation(state, action, dispatch) {
    let documentTypes = state.documentTypes ?? [];
    documentTypes = documentTypes.filter(
      (documentType) => documentType.id !== action.input.id,
    );
    state.documentTypes = documentTypes;
  },
};
