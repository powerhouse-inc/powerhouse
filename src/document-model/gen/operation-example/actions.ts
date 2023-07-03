import { ActionType } from '../../../document/utils';

import {
    AddOperationExampleInput,
    UpdateOperationExampleInput,
    DeleteOperationExampleInput,
    ReorderOperationExamplesInput,
} from '@acaldas/document-model-graphql/document-model';

export type AddOperationExampleAction = ActionType<'ADD_OPERATION_EXAMPLE', AddOperationExampleInput>;
export type UpdateOperationExampleAction = ActionType<'UPDATE_OPERATION_EXAMPLE', UpdateOperationExampleInput>;
export type DeleteOperationExampleAction = ActionType<'DELETE_OPERATION_EXAMPLE', DeleteOperationExampleInput>;
export type ReorderOperationExamplesAction = ActionType<'REORDER_OPERATION_EXAMPLES', ReorderOperationExamplesInput>;

export type DocumentModelOperationExampleAction = 
    | AddOperationExampleAction
    | UpdateOperationExampleAction
    | DeleteOperationExampleAction
    | ReorderOperationExamplesAction
;