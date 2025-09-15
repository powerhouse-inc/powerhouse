import type { AppModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: AppModuleBaseOperationsOperations = {
  setAppNameOperation(state, action, dispatch) {
    state.name = action.input.name;
  },
  setAppStatusOperation(state, action, dispatch) {
    state.status = action.input.status;
  },
  addDocumentTypeOperation(state, action, dispatch) {
    const documentTypes = state.documentTypes ?? [];
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
