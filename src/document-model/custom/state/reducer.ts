/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the reducer functions
* - delete the file and run the code generator again to have it reset
*/

import { DocumentModelStateOperations } from '../../gen/state/operations';

export const reducer: DocumentModelStateOperations = {
    setStateSchemaOperation(state, action) {
        throw new Error('Reducer "setStateSchemaOperation" not yet implemented');
    },
    addStateExampleOperation(state, action) {
        throw new Error('Reducer "addStateExampleOperation" not yet implemented');
    },
    updateStateExampleOperation(state, action) {
        throw new Error('Reducer "updateStateExampleOperation" not yet implemented');
    },
    deleteStateExampleOperation(state, action) {
        throw new Error('Reducer "deleteStateExampleOperation" not yet implemented');
    },
    reorderStateExamplesOperation(state, action) {
        throw new Error('Reducer "reorderStateExamplesOperation" not yet implemented');
    },
}