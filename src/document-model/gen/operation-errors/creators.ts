import {
    AddOperationErrorAction,
    SetOperationErrorCodeAction,
    SetOperationErrorNameAction,
    SetOperationErrorDescriptionAction,
    SetOperationErrorTemplateAction,
    DeleteOperationErrorAction,
    ReorderOperationErrorsAction,
} from './actions';

import { createAction } from '../../../document/utils'; 

export const addOperationError = (operationId: string, errorCode?: string, errorName?: string, errorDescription?: string, errorTemplate?: string) => 
    createAction<AddOperationErrorAction>(
        'ADD_OPERATION_ERROR',
        { operationId, errorCode, errorName, errorDescription, errorTemplate }
    );

export const setOperationErrorCode = (id: string, errorCode: string) => 
    createAction<SetOperationErrorCodeAction>(
        'SET_OPERATION_ERROR_CODE',
        { id, errorCode }
    );

export const setOperationErrorName = (id: string, errorName: string) => 
    createAction<SetOperationErrorNameAction>(
        'SET_OPERATION_ERROR_NAME',
        { id, errorName }
    );

export const setOperationErrorDescription = (id: string, errorDescription: string) => 
    createAction<SetOperationErrorDescriptionAction>(
        'SET_OPERATION_ERROR_DESCRIPTION',
        { id, errorDescription }
    );

export const setOperationErrorTemplate = (id: string, errorTemplate: string) => 
    createAction<SetOperationErrorTemplateAction>(
        'SET_OPERATION_ERROR_TEMPLATE',
        { id, errorTemplate }
    );

export const deleteOperationError = (id: string) => 
    createAction<DeleteOperationErrorAction>(
        'DELETE_OPERATION_ERROR',
        { id }
    );

export const reorderOperationErrors = (operationId: string, order: string[]) => 
    createAction<ReorderOperationErrorsAction>(
        'REORDER_OPERATION_ERRORS',
        { operationId, order }
    );
