import { createAction } from '../../../document/utils';

import {
    AddOperationErrorInput,
    SetOperationErrorCodeInput,
    SetOperationErrorNameInput,
    SetOperationErrorDescriptionInput,
    SetOperationErrorTemplateInput,
    DeleteOperationErrorInput,
    ReorderOperationErrorsInput,
} from '../types';
import {
    AddOperationErrorAction,
    SetOperationErrorCodeAction,
    SetOperationErrorNameAction,
    SetOperationErrorDescriptionAction,
    SetOperationErrorTemplateAction,
    DeleteOperationErrorAction,
    ReorderOperationErrorsAction,
} from './actions';

export const addOperationError = (input: AddOperationErrorInput, skip = 0) =>
    createAction<AddOperationErrorAction>(
        'ADD_OPERATION_ERROR',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setOperationErrorCode = (input: SetOperationErrorCodeInput, skip = 0) =>
    createAction<SetOperationErrorCodeAction>(
        'SET_OPERATION_ERROR_CODE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setOperationErrorName = (input: SetOperationErrorNameInput, skip = 0) =>
    createAction<SetOperationErrorNameAction>(
        'SET_OPERATION_ERROR_NAME',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setOperationErrorDescription = (input: SetOperationErrorDescriptionInput, skip = 0) =>
    createAction<SetOperationErrorDescriptionAction>(
        'SET_OPERATION_ERROR_DESCRIPTION',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setOperationErrorTemplate = (input: SetOperationErrorTemplateInput, skip = 0) =>
    createAction<SetOperationErrorTemplateAction>(
        'SET_OPERATION_ERROR_TEMPLATE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const deleteOperationError = (input: DeleteOperationErrorInput, skip = 0) =>
    createAction<DeleteOperationErrorAction>(
        'DELETE_OPERATION_ERROR',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const reorderOperationErrors = (input: ReorderOperationErrorsInput, skip = 0) =>
    createAction<ReorderOperationErrorsAction>(
        'REORDER_OPERATION_ERRORS',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );


