import { Action } from '../../../document';

import {
    AddOperationExampleInput,
    UpdateOperationExampleInput,
    DeleteOperationExampleInput,
    ReorderOperationExamplesInput,
} from '@acaldas/document-model-graphql/document-model';

export type AddOperationExampleAction = Action<'ADD_OPERATION_EXAMPLE', AddOperationExampleInput>;
export type UpdateOperationExampleAction = Action<'UPDATE_OPERATION_EXAMPLE', UpdateOperationExampleInput>;
export type DeleteOperationExampleAction = Action<'DELETE_OPERATION_EXAMPLE', DeleteOperationExampleInput>;
export type ReorderOperationExamplesAction = Action<'REORDER_OPERATION_EXAMPLES', ReorderOperationExamplesInput>;

export type DocumentModelOperationExampleAction = 
    | AddOperationExampleAction
    | UpdateOperationExampleAction
    | DeleteOperationExampleAction
    | ReorderOperationExamplesAction
;