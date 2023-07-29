import { createAction } from '../../../document/utils'; 

import {
    AddOperationExampleInput,
    UpdateOperationExampleInput,
    DeleteOperationExampleInput,
    ReorderOperationExamplesInput,
} from '@acaldas/document-model-graphql/document-model';

import {
    AddOperationExampleAction,
    UpdateOperationExampleAction,
    DeleteOperationExampleAction,
    ReorderOperationExamplesAction,
} from './actions';

export const addOperationExample = (input: AddOperationExampleInput) =>
    createAction<AddOperationExampleAction>(
        'ADD_OPERATION_EXAMPLE',
        {...input}
    );

export const updateOperationExample = (input: UpdateOperationExampleInput) =>
    createAction<UpdateOperationExampleAction>(
        'UPDATE_OPERATION_EXAMPLE',
        {...input}
    );

export const deleteOperationExample = (input: DeleteOperationExampleInput) =>
    createAction<DeleteOperationExampleAction>(
        'DELETE_OPERATION_EXAMPLE',
        {...input}
    );

export const reorderOperationExamples = (input: ReorderOperationExamplesInput) =>
    createAction<ReorderOperationExamplesAction>(
        'REORDER_OPERATION_EXAMPLES',
        {...input}
    );


