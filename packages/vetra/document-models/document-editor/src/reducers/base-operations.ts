import type { DocumentEditorBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: DocumentEditorBaseOperationsOperations = {
  setEditorNameOperation(state, action, dispatch) {
    state.name = action.input.name;
  },
  setEditorIdOperation(state, action, dispatch) {
    state.id = action.input.id;
  },
  addDocumentTypeOperation(state, action, dispatch) {
    state.documentTypes.push({ id: action.input.id, documentType: action.input.documentType });
  },
  removeDocumentTypeOperation(state, action, dispatch) {
    state.documentTypes = state.documentTypes.filter(
      (documentType) => documentType.id !== action.input.id,
    );
  }
};
