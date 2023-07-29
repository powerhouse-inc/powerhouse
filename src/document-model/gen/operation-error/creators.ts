import { createAction } from '../../../document/utils'; 

import {
    AddOperationErrorInput,
    SetOperationErrorCodeInput,
    SetOperationErrorNameInput,
    SetOperationErrorDescriptionInput,
    SetOperationErrorTemplateInput,
    DeleteOperationErrorInput,
    ReorderOperationErrorsInput,
} from '@acaldas/document-model-graphql/document-model';

import {
    AddOperationErrorAction,
    SetOperationErrorCodeAction,
    SetOperationErrorNameAction,
    SetOperationErrorDescriptionAction,
    SetOperationErrorTemplateAction,
    DeleteOperationErrorAction,
    ReorderOperationErrorsAction,
} from './actions';

export const addOperationError = (input: AddOperationErrorInput) =>
    createAction<AddOperationErrorAction>(
        'ADD_OPERATION_ERROR',
        {...input}
    );

export const setOperationErrorCode = (input: SetOperationErrorCodeInput) =>
    createAction<SetOperationErrorCodeAction>(
        'SET_OPERATION_ERROR_CODE',
        {...input}
    );

export const setOperationErrorName = (input: SetOperationErrorNameInput) =>
    createAction<SetOperationErrorNameAction>(
        'SET_OPERATION_ERROR_NAME',
        {...input}
    );

export const setOperationErrorDescription = (input: SetOperationErrorDescriptionInput) =>
    createAction<SetOperationErrorDescriptionAction>(
        'SET_OPERATION_ERROR_DESCRIPTION',
        {...input}
    );

export const setOperationErrorTemplate = (input: SetOperationErrorTemplateInput) =>
    createAction<SetOperationErrorTemplateAction>(
        'SET_OPERATION_ERROR_TEMPLATE',
        {...input}
    );

export const deleteOperationError = (input: DeleteOperationErrorInput) =>
    createAction<DeleteOperationErrorAction>(
        'DELETE_OPERATION_ERROR',
        {...input}
    );

export const reorderOperationErrors = (input: ReorderOperationErrorsInput) =>
    createAction<ReorderOperationErrorsAction>(
        'REORDER_OPERATION_ERRORS',
        {...input}
    );


