import {
    AddOperationErrorAction,
    SetOperationErrorCodeAction,
    SetOperationErrorNameAction,
    SetOperationErrorDescriptionAction,
    SetOperationErrorTemplateAction,
    DeleteOperationErrorAction,
    ReorderOperationErrorsAction,
} from './actions';

import { ExtendedDocumentModelState } from '../object';

export interface DocumentModelOperationErrorOperations {
    addOperationErrorOperation: (state: ExtendedDocumentModelState, action: AddOperationErrorAction) => void,
    setOperationErrorCodeOperation: (state: ExtendedDocumentModelState, action: SetOperationErrorCodeAction) => void,
    setOperationErrorNameOperation: (state: ExtendedDocumentModelState, action: SetOperationErrorNameAction) => void,
    setOperationErrorDescriptionOperation: (state: ExtendedDocumentModelState, action: SetOperationErrorDescriptionAction) => void,
    setOperationErrorTemplateOperation: (state: ExtendedDocumentModelState, action: SetOperationErrorTemplateAction) => void,
    deleteOperationErrorOperation: (state: ExtendedDocumentModelState, action: DeleteOperationErrorAction) => void,
    reorderOperationErrorsOperation: (state: ExtendedDocumentModelState, action: ReorderOperationErrorsAction) => void,
}