import { Action } from '../../../document';

import {
    SetStateSchemaInput,
    AddStateExampleInput,
    UpdateStateExampleInput,
    DeleteStateExampleInput,
    ReorderStateExamplesInput,
} from '@acaldas/document-model-graphql/document-model';

export type SetStateSchemaAction = Action<'SET_STATE_SCHEMA', SetStateSchemaInput>;
export type AddStateExampleAction = Action<'ADD_STATE_EXAMPLE', AddStateExampleInput>;
export type UpdateStateExampleAction = Action<'UPDATE_STATE_EXAMPLE', UpdateStateExampleInput>;
export type DeleteStateExampleAction = Action<'DELETE_STATE_EXAMPLE', DeleteStateExampleInput>;
export type ReorderStateExamplesAction = Action<'REORDER_STATE_EXAMPLES', ReorderStateExamplesInput>;

export type DocumentModelStateAction = 
    | SetStateSchemaAction
    | AddStateExampleAction
    | UpdateStateExampleAction
    | DeleteStateExampleAction
    | ReorderStateExamplesAction
;