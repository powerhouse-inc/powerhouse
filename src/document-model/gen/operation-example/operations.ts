import {
    AddOperationExampleAction,
    UpdateOperationExampleAction,
    DeleteOperationExampleAction,
    ReorderOperationExamplesAction,
} from './actions';

import { ExtendedDocumentModelState } from '../object';

export interface DocumentModelOperationExampleOperations {
    addOperationExampleOperation: (state: ExtendedDocumentModelState, action: AddOperationExampleAction) => void,
    updateOperationExampleOperation: (state: ExtendedDocumentModelState, action: UpdateOperationExampleAction) => void,
    deleteOperationExampleOperation: (state: ExtendedDocumentModelState, action: DeleteOperationExampleAction) => void,
    reorderOperationExamplesOperation: (state: ExtendedDocumentModelState, action: ReorderOperationExamplesAction) => void,
}