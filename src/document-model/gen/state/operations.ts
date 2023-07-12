import {
    SetStateSchemaAction,
    AddStateExampleAction,
    UpdateStateExampleAction,
    DeleteStateExampleAction,
    ReorderStateExamplesAction,
} from './actions';

import { ExtendedDocumentModelState } from '../types';

export interface DocumentModelStateOperations {
    setStateSchemaOperation: (state: ExtendedDocumentModelState, action: SetStateSchemaAction) => void,
    addStateExampleOperation: (state: ExtendedDocumentModelState, action: AddStateExampleAction) => void,
    updateStateExampleOperation: (state: ExtendedDocumentModelState, action: UpdateStateExampleAction) => void,
    deleteStateExampleOperation: (state: ExtendedDocumentModelState, action: DeleteStateExampleAction) => void,
    reorderStateExamplesOperation: (state: ExtendedDocumentModelState, action: ReorderStateExamplesAction) => void,
}