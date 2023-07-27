import {
    AddOperationExampleAction,
    UpdateOperationExampleAction,
    DeleteOperationExampleAction,
    ReorderOperationExamplesAction,
} from './actions';

import { DocumentModelState } from '../types';

export interface DocumentModelOperationExampleOperations {
    addOperationExampleOperation: (state: DocumentModelState, action: AddOperationExampleAction) => void,
    updateOperationExampleOperation: (state: DocumentModelState, action: UpdateOperationExampleAction) => void,
    deleteOperationExampleOperation: (state: DocumentModelState, action: DeleteOperationExampleAction) => void,
    reorderOperationExamplesOperation: (state: DocumentModelState, action: ReorderOperationExamplesAction) => void,
}