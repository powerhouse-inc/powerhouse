import { ActionType } from '../../../document/utils';

import {
    SetStateSchemaInput,
    AddStateExampleInput,
    UpdateStateExampleInput,
    DeleteStateExampleInput,
    ReorderStateExamplesInput,
} from '@acaldas/document-model-graphql/document-model';

export type SetStateSchemaAction = ActionType<'SET_STATE_SCHEMA', SetStateSchemaInput>;
export type AddStateExampleAction = ActionType<'ADD_STATE_EXAMPLE', AddStateExampleInput>;
export type UpdateStateExampleAction = ActionType<'UPDATE_STATE_EXAMPLE', UpdateStateExampleInput>;
export type DeleteStateExampleAction = ActionType<'DELETE_STATE_EXAMPLE', DeleteStateExampleInput>;
export type ReorderStateExamplesAction = ActionType<'REORDER_STATE_EXAMPLES', ReorderStateExamplesInput>;

export type DocumentModelStateAction = 
    | SetStateSchemaAction
    | AddStateExampleAction
    | UpdateStateExampleAction
    | DeleteStateExampleAction
    | ReorderStateExamplesAction
;