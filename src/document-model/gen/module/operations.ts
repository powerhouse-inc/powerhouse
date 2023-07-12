import {
    AddModuleAction,
    SetModuleNameAction,
    SetModuleDescriptionAction,
    DeleteModuleAction,
    ReorderModulesAction,
} from './actions';

import { ExtendedDocumentModelState } from '../types';

export interface DocumentModelModuleOperations {
    addModuleOperation: (state: ExtendedDocumentModelState, action: AddModuleAction) => void,
    setModuleNameOperation: (state: ExtendedDocumentModelState, action: SetModuleNameAction) => void,
    setModuleDescriptionOperation: (state: ExtendedDocumentModelState, action: SetModuleDescriptionAction) => void,
    deleteModuleOperation: (state: ExtendedDocumentModelState, action: DeleteModuleAction) => void,
    reorderModulesOperation: (state: ExtendedDocumentModelState, action: ReorderModulesAction) => void,
}