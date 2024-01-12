import { createAction } from '../../../document/utils';

import {
    AddOperationExampleInput,
    UpdateOperationExampleInput,
    DeleteOperationExampleInput,
    ReorderOperationExamplesInput,
} from '../types';
import {
    AddOperationExampleAction,
    UpdateOperationExampleAction,
    DeleteOperationExampleAction,
    ReorderOperationExamplesAction,
} from './actions';

export const addOperationExample = (input: AddOperationExampleInput, skip = 0) =>
    createAction<AddOperationExampleAction>(
        'ADD_OPERATION_EXAMPLE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const updateOperationExample = (input: UpdateOperationExampleInput, skip = 0) =>
    createAction<UpdateOperationExampleAction>(
        'UPDATE_OPERATION_EXAMPLE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const deleteOperationExample = (input: DeleteOperationExampleInput, skip = 0) =>
    createAction<DeleteOperationExampleAction>(
        'DELETE_OPERATION_EXAMPLE',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const reorderOperationExamples = (input: ReorderOperationExamplesInput, skip = 0) =>
    createAction<ReorderOperationExamplesAction>(
        'REORDER_OPERATION_EXAMPLES',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );


