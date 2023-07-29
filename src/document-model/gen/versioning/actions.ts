import { Action } from '../../../document';

import {
    AddChangeLogItemInput,
    UpdateChangeLogItemInput,
    DeleteChangeLogItemInput,
    ReorderChangeLogItemsInput,
} from '@acaldas/document-model-graphql/document-model';

export type AddChangeLogItemAction = Action<'ADD_CHANGE_LOG_ITEM', AddChangeLogItemInput>;
export type UpdateChangeLogItemAction = Action<'UPDATE_CHANGE_LOG_ITEM', UpdateChangeLogItemInput>;
export type DeleteChangeLogItemAction = Action<'DELETE_CHANGE_LOG_ITEM', DeleteChangeLogItemInput>;
export type ReorderChangeLogItemsAction = Action<'REORDER_CHANGE_LOG_ITEMS', ReorderChangeLogItemsInput>;
export type ReleaseNewVersionAction = Action<'RELEASE_NEW_VERSION', {}>;

export type DocumentModelVersioningAction = 
    | AddChangeLogItemAction
    | UpdateChangeLogItemAction
    | DeleteChangeLogItemAction
    | ReorderChangeLogItemsAction
    | ReleaseNewVersionAction
;