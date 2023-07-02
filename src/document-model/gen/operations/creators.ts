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

import { createAction } from '../../../document/utils'; 

export const addOperation = (name: string) => 
    createAction<AddOperationAction>(
        'ADD_OPERATION',
        { name }
    );

export const setOperationName = (id: string, name: string) => 
    createAction<SetOperationNameAction>(
        'SET_OPERATION_NAME',
        { id, name }
    );

export const setOperationSchema = (id: string, schema: string) => 
    createAction<SetOperationSchemaAction>(
        'SET_OPERATION_SCHEMA',
        { id, schema }
    );

export const setOperationDescription = (id: string, description: string) => 
    createAction<SetOperationDescriptionAction>(
        'SET_OPERATION_DESCRIPTION',
        { id, description }
    );

export const setOperationTemplate = (id: string, template: string) => 
    createAction<SetOperationTemplateAction>(
        'SET_OPERATION_TEMPLATE',
        { id, template }
    );

export const setOperationReducer = (id: string, reducer: string) => 
    createAction<SetOperationReducerAction>(
        'SET_OPERATION_REDUCER',
        { id, reducer }
    );

export const moveOperation = (operationId: string, newModuleId: string) => 
    createAction<MoveOperationAction>(
        'MOVE_OPERATION',
        { operationId, newModuleId }
    );

export const deleteOperation = (id: string) => 
    createAction<DeleteOperationAction>(
        'DELETE_OPERATION',
        { id }
    );

export const reorderModuleOperations = (moduleId: string, order: string[]) => 
    createAction<ReorderModuleOperationsAction>(
        'REORDER_MODULE_OPERATIONS',
        { moduleId, order }
    );
