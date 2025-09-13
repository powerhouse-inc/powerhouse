import type { AppModuleDndOperationsOperations } from "../../gen/dnd-operations/operations.js";

const defaultDragAndDrop = { enabled: false, documentTypes: [] };

export const reducer: AppModuleDndOperationsOperations = {
    setDragAndDropEnabledOperation(state, action, dispatch) {
        const dragAndDrop = state.dragAndDrop ?? defaultDragAndDrop;
        dragAndDrop.enabled = action.input.enabled;
        state.dragAndDrop = dragAndDrop;
    },
    addDocumentTypeOperation(state, action, dispatch) {
        const dragAndDrop = state.dragAndDrop ?? defaultDragAndDrop;
        dragAndDrop.documentTypes.push({
            id: action.input.id,
            documentType: action.input.documentType,
        });
        state.dragAndDrop = dragAndDrop;
    },
    removeDocumentTypeOperation(state, action, dispatch) {
        const dragAndDrop = state.dragAndDrop ?? defaultDragAndDrop;
        dragAndDrop.documentTypes = dragAndDrop.documentTypes.filter(
            (documentType) => documentType.id !== action.input.id,
        );
        state.dragAndDrop = dragAndDrop;
    }
};
