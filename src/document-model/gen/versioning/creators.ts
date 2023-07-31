import { createAction } from '../../../document/utils'; 

import {
    AddChangeLogItemInput,
    UpdateChangeLogItemInput,
    DeleteChangeLogItemInput,
    ReorderChangeLogItemsInput,
} from '@acaldas/document-model-graphql/document-model';

import {
    AddChangeLogItemAction,
    UpdateChangeLogItemAction,
    DeleteChangeLogItemAction,
    ReorderChangeLogItemsAction,
    ReleaseNewVersionAction,
} from './actions';

export const addChangeLogItem = (input: AddChangeLogItemInput) =>
    createAction<AddChangeLogItemAction>(
        'ADD_CHANGE_LOG_ITEM',
        {...input}
    );

export const updateChangeLogItem = (input: UpdateChangeLogItemInput) =>
    createAction<UpdateChangeLogItemAction>(
        'UPDATE_CHANGE_LOG_ITEM',
        {...input}
    );

export const deleteChangeLogItem = (input: DeleteChangeLogItemInput) =>
    createAction<DeleteChangeLogItemAction>(
        'DELETE_CHANGE_LOG_ITEM',
        {...input}
    );

export const reorderChangeLogItems = (input: ReorderChangeLogItemsInput) =>
    createAction<ReorderChangeLogItemsAction>(
        'REORDER_CHANGE_LOG_ITEMS',
        {...input}
    );


export const releaseNewVersion = () =>
    createAction<ReleaseNewVersionAction>('RELEASE_NEW_VERSION');
