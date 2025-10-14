import type { DocumentEditorBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: DocumentEditorBaseOperationsOperations = {
  setEditorNameOperation(state, action, dispatch) {
    if (action.input.name.trim() === "") {
      throw new Error("Editor name cannot be empty");
    }
    state.name = action.input.name;
  },
  addDocumentTypeOperation(state, action, dispatch) {
    // Check for duplicate ID
    const existingId = state.documentTypes.find(
      (dt) => dt.id === action.input.id,
    );
    if (existingId) {
      throw new Error(
        `Document type with id "${action.input.id}" already exists`,
      );
    }

    state.documentTypes.push({
      id: action.input.id,
      documentType: action.input.documentType,
    });
  },
  removeDocumentTypeOperation(state, action, dispatch) {
    state.documentTypes = state.documentTypes.filter(
      (documentType) => documentType.id !== action.input.id,
    );
  },
  setEditorStatusOperation(state, action, dispatch) {
    state.status = action.input.status;
  },
};
