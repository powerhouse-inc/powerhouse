import {
    AddOperationErrorAction,
    SetOperationErrorCodeAction,
    SetOperationErrorNameAction,
    SetOperationErrorDescriptionAction,
    SetOperationErrorTemplateAction,
    DeleteOperationErrorAction,
    ReorderOperationErrorsAction,
} from './actions';

import { DocumentModelState } from '../types';

export interface DocumentModelOperationErrorOperations {
    addOperationErrorOperation: (state: DocumentModelState, action: AddOperationErrorAction) => void,
    setOperationErrorCodeOperation: (state: DocumentModelState, action: SetOperationErrorCodeAction) => void,
    setOperationErrorNameOperation: (state: DocumentModelState, action: SetOperationErrorNameAction) => void,
    setOperationErrorDescriptionOperation: (state: DocumentModelState, action: SetOperationErrorDescriptionAction) => void,
    setOperationErrorTemplateOperation: (state: DocumentModelState, action: SetOperationErrorTemplateAction) => void,
    deleteOperationErrorOperation: (state: DocumentModelState, action: DeleteOperationErrorAction) => void,
    reorderOperationErrorsOperation: (state: DocumentModelState, action: ReorderOperationErrorsAction) => void,
}