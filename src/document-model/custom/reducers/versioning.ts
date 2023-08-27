/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the reducer functions
* - delete the file and run the code generator again to have it reset
*/

import { DocumentModelVersioningOperations } from '../../gen/versioning/operations';

export const reducer: DocumentModelVersioningOperations = {
    addChangeLogItemOperation(state, action) {
        throw new Error('Reducer "addChangeLogItemOperation" not yet implemented');
    },
    
    updateChangeLogItemOperation(state, action) {
        throw new Error('Reducer "updateChangeLogItemOperation" not yet implemented');
    },

    deleteChangeLogItemOperation(state, action) {
        throw new Error('Reducer "deleteChangeLogItemOperation" not yet implemented');
    },

    reorderChangeLogItemsOperation(state, action) {
        throw new Error('Reducer "reorderChangeLogItemsOperation" not yet implemented');
    },

    releaseNewVersionOperation(state, action) {
        throw new Error('Reducer "releaseNewVersionOperation" not yet implemented');
    },
}