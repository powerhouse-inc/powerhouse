import { ActionType } from '../../../document/utils';

import {
    AddOperationErrorInput,
    SetOperationErrorCodeInput,
    SetOperationErrorNameInput,
    SetOperationErrorDescriptionInput,
    SetOperationErrorTemplateInput,
    DeleteOperationErrorInput,
    ReorderOperationErrorsInput,
} from '@acaldas/document-model-graphql/document-model';

export type AddOperationErrorAction = ActionType<'ADD_OPERATION_ERROR', AddOperationErrorInput>;
export type SetOperationErrorCodeAction = ActionType<'SET_OPERATION_ERROR_CODE', SetOperationErrorCodeInput>;
export type SetOperationErrorNameAction = ActionType<'SET_OPERATION_ERROR_NAME', SetOperationErrorNameInput>;
export type SetOperationErrorDescriptionAction = ActionType<'SET_OPERATION_ERROR_DESCRIPTION', SetOperationErrorDescriptionInput>;
export type SetOperationErrorTemplateAction = ActionType<'SET_OPERATION_ERROR_TEMPLATE', SetOperationErrorTemplateInput>;
export type DeleteOperationErrorAction = ActionType<'DELETE_OPERATION_ERROR', DeleteOperationErrorInput>;
export type ReorderOperationErrorsAction = ActionType<'REORDER_OPERATION_ERRORS', ReorderOperationErrorsInput>;

export type DocumentModelOperationErrorAction = 
    | AddOperationErrorAction
    | SetOperationErrorCodeAction
    | SetOperationErrorNameAction
    | SetOperationErrorDescriptionAction
    | SetOperationErrorTemplateAction
    | DeleteOperationErrorAction
    | ReorderOperationErrorsAction;