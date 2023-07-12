import { Action } from '../../../document';

import {
    AddOperationErrorInput,
    SetOperationErrorCodeInput,
    SetOperationErrorNameInput,
    SetOperationErrorDescriptionInput,
    SetOperationErrorTemplateInput,
    DeleteOperationErrorInput,
    ReorderOperationErrorsInput,
} from '@acaldas/document-model-graphql/document-model';

export type AddOperationErrorAction = Action<'ADD_OPERATION_ERROR', AddOperationErrorInput>;
export type SetOperationErrorCodeAction = Action<'SET_OPERATION_ERROR_CODE', SetOperationErrorCodeInput>;
export type SetOperationErrorNameAction = Action<'SET_OPERATION_ERROR_NAME', SetOperationErrorNameInput>;
export type SetOperationErrorDescriptionAction = Action<'SET_OPERATION_ERROR_DESCRIPTION', SetOperationErrorDescriptionInput>;
export type SetOperationErrorTemplateAction = Action<'SET_OPERATION_ERROR_TEMPLATE', SetOperationErrorTemplateInput>;
export type DeleteOperationErrorAction = Action<'DELETE_OPERATION_ERROR', DeleteOperationErrorInput>;
export type ReorderOperationErrorsAction = Action<'REORDER_OPERATION_ERRORS', ReorderOperationErrorsInput>;

export type DocumentModelOperationErrorAction = 
    | AddOperationErrorAction
    | SetOperationErrorCodeAction
    | SetOperationErrorNameAction
    | SetOperationErrorDescriptionAction
    | SetOperationErrorTemplateAction
    | DeleteOperationErrorAction
    | ReorderOperationErrorsAction
;