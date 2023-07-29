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
} from '@acaldas/document-model-graphql/document-model';

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
} from './actions';

export const addOperation = (input: AddOperationInput) =>
    createAction<AddOperationAction>(
        'ADD_OPERATION',
        {...input}
    );

export const setOperationName = (input: SetOperationNameInput) =>
    createAction<SetOperationNameAction>(
        'SET_OPERATION_NAME',
        {...input}
    );

export const setOperationSchema = (input: SetOperationSchemaInput) =>
    createAction<SetOperationSchemaAction>(
        'SET_OPERATION_SCHEMA',
        {...input}
    );

export const setOperationDescription = (input: SetOperationDescriptionInput) =>
    createAction<SetOperationDescriptionAction>(
        'SET_OPERATION_DESCRIPTION',
        {...input}
    );

export const setOperationTemplate = (input: SetOperationTemplateInput) =>
    createAction<SetOperationTemplateAction>(
        'SET_OPERATION_TEMPLATE',
        {...input}
    );

export const setOperationReducer = (input: SetOperationReducerInput) =>
    createAction<SetOperationReducerAction>(
        'SET_OPERATION_REDUCER',
        {...input}
    );

export const moveOperation = (input: MoveOperationInput) =>
    createAction<MoveOperationAction>(
        'MOVE_OPERATION',
        {...input}
    );

export const deleteOperation = (input: DeleteOperationInput) =>
    createAction<DeleteOperationAction>(
        'DELETE_OPERATION',
        {...input}
    );

export const reorderModuleOperations = (input: ReorderModuleOperationsInput) =>
    createAction<ReorderModuleOperationsAction>(
        'REORDER_MODULE_OPERATIONS',
        {...input}
    );


