import {
    AddOperationExampleAction,
    UpdateOperationExampleAction,
    DeleteOperationExampleAction,
    ReorderOperationExamplesAction,
} from './actions';

import { createAction } from '../../../document/utils'; 

export const addOperationExample = (operationId: string, example: string) => 
    createAction<AddOperationExampleAction>(
        'ADD_OPERATION_EXAMPLE',
        { operationId, example }
    );

export const updateOperationExample = (id: string, example: string) => 
    createAction<UpdateOperationExampleAction>(
        'UPDATE_OPERATION_EXAMPLE',
        { id, example }
    );

export const deleteOperationExample = (id: string) => 
    createAction<DeleteOperationExampleAction>(
        'DELETE_OPERATION_EXAMPLE',
        { id }
    );

export const reorderOperationExamples = (operationId: string, order: string[]) => 
    createAction<ReorderOperationExamplesAction>(
        'REORDER_OPERATION_EXAMPLES',
        { operationId, order }
    );
