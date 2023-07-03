/**
* This is a scaffold file meant for customization: 
* - modify it by implementing the reducer functions
* - delete the file and run the code generator again to have it reset
*/

import { DocumentModelModuleOperations } from '../../gen/module/operations';

export const reducer: DocumentModelModuleOperations = {
    addModuleOperation(state, action) {
        throw new Error('Reducer "addModuleOperation" not yet implemented');
    },
    setModuleNameOperation(state, action) {
        throw new Error('Reducer "setModuleNameOperation" not yet implemented');
    },
    setModuleDescriptionOperation(state, action) {
        throw new Error('Reducer "setModuleDescriptionOperation" not yet implemented');
    },
    deleteModuleOperation(state, action) {
        throw new Error('Reducer "deleteModuleOperation" not yet implemented');
    },
    reorderModulesOperation(state, action) {
        throw new Error('Reducer "reorderModulesOperation" not yet implemented');
    },
}