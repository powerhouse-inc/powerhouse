import type { ProcessorModuleBaseOperationsOperations } from "../../gen/base-operations/operations.js";

export const reducer: ProcessorModuleBaseOperationsOperations = {
    setProcessorNameOperation(state, action, dispatch) {
        state.name = action.input.name;
    },
    setProcessorTypeOperation(state, action, dispatch) {
        state.type = action.input.type;
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
