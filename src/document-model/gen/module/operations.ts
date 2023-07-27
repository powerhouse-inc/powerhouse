import {
    AddModuleAction,
    SetModuleNameAction,
    SetModuleDescriptionAction,
    DeleteModuleAction,
    ReorderModulesAction,
} from './actions';

import { DocumentModelState } from '../types';

export interface DocumentModelModuleOperations {
    addModuleOperation: (state: DocumentModelState, action: AddModuleAction) => void,
    setModuleNameOperation: (state: DocumentModelState, action: SetModuleNameAction) => void,
    setModuleDescriptionOperation: (state: DocumentModelState, action: SetModuleDescriptionAction) => void,
    deleteModuleOperation: (state: DocumentModelState, action: DeleteModuleAction) => void,
    reorderModulesOperation: (state: DocumentModelState, action: ReorderModulesAction) => void,
}