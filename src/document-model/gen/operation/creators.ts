import { createAction } from '../../../document/utils';

import {
    AddOperationInput,
    SetOperationNameInput,
    SetOperationSchemaInput,
    SetOperationDescriptionInput,
    SetOperationTemplateInput,
    SetOperationReducerInput,
    MoveOperationInput,
    DeleteOperationInput,
    ReorderModuleOperationsInput,
    SetOperationScopeInput,
} from '../types';
import {
    AddOperationAction,
    SetOperationNameAction,
    SetOperationSchemaAction,
    SetOperationDescriptionAction,
    SetOperationTemplateAction,
    SetOperationReducerAction,
    MoveOperationAction,
    DeleteOperationAction,
    ReorderModuleOperationsAction,
    SetOperationScopeAction,
} from './actions';

export const addOperation = (input: AddOperationInput, skip = 0) =>
    createAction<AddOperationAction>(
        'ADD_OPERATION',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

    export const setOperationName = (input: SetOperationNameInput, skip = 0) =>
    createAction<SetOperationNameAction>(
        'SET_OPERATION_NAME',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

    export const setOperationScope = (input: SetOperationScopeInput, skip = 0) =>
    createAction<SetOperationScopeAction>(
        'SET_OPERATION_SCOPE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setOperationSchema = (input: SetOperationSchemaInput, skip = 0) =>
    createAction<SetOperationSchemaAction>(
        'SET_OPERATION_SCHEMA',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setOperationDescription = (input: SetOperationDescriptionInput, skip = 0) =>
    createAction<SetOperationDescriptionAction>(
        'SET_OPERATION_DESCRIPTION',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setOperationTemplate = (input: SetOperationTemplateInput, skip = 0) =>
    createAction<SetOperationTemplateAction>(
        'SET_OPERATION_TEMPLATE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const setOperationReducer = (input: SetOperationReducerInput, skip = 0) =>
    createAction<SetOperationReducerAction>(
        'SET_OPERATION_REDUCER',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const moveOperation = (input: MoveOperationInput, skip = 0) =>
    createAction<MoveOperationAction>(
        'MOVE_OPERATION',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const deleteOperation = (input: DeleteOperationInput, skip = 0) =>
    createAction<DeleteOperationAction>(
        'DELETE_OPERATION',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const reorderModuleOperations = (input: ReorderModuleOperationsInput, skip = 0) =>
    createAction<ReorderModuleOperationsAction>(
        'REORDER_MODULE_OPERATIONS',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );


