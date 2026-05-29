import type { DocumentEditorBaseOperationsOperations } from "document-models/document-editor/v1";

export const documentEditorBaseOperationsOperations: DocumentEditorBaseOperationsOperations =
  {
    setEditorNameOperation(state, action, _dispatch) {
      const trimmedName = action.input.name.trim();
      if (trimmedName === "") {
        throw new Error("Editor name cannot be empty");
      }
      state.name = trimmedName;
    },
    addDocumentTypeOperation(state, action, _dispatch) {
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
    removeDocumentTypeOperation(state, action, _dispatch) {
      state.documentTypes = state.documentTypes.filter(
        (documentType) => documentType.id !== action.input.id,
      );
    },
    setEditorStatusOperation(state, action, _dispatch) {
      state.status = action.input.status;
    },
  };
