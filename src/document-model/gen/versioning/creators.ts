import { createAction } from '../../../document/utils';

import {
    AddChangeLogItemInput,
    UpdateChangeLogItemInput,
    DeleteChangeLogItemInput,
    ReorderChangeLogItemsInput,
} from '../types';
import {
    AddChangeLogItemAction,
    UpdateChangeLogItemAction,
    DeleteChangeLogItemAction,
    ReorderChangeLogItemsAction,
    ReleaseNewVersionAction,
} from './actions';

export const addChangeLogItem = (input: AddChangeLogItemInput, skip = 0) =>
    createAction<AddChangeLogItemAction>(
        'ADD_CHANGE_LOG_ITEM',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const updateChangeLogItem = (input: UpdateChangeLogItemInput, skip = 0) =>
    createAction<UpdateChangeLogItemAction>(
        'UPDATE_CHANGE_LOG_ITEM',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const deleteChangeLogItem = (input: DeleteChangeLogItemInput, skip = 0) =>
    createAction<DeleteChangeLogItemAction>(
        'DELETE_CHANGE_LOG_ITEM',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );

export const reorderChangeLogItems = (input: ReorderChangeLogItemsInput, skip = 0) =>
    createAction<ReorderChangeLogItemsAction>(
        'REORDER_CHANGE_LOG_ITEMS',
        {...input},
        undefined,
        undefined,
        undefined,
        skip,
    );


export const releaseNewVersion = (skip = 0) =>
    createAction<ReleaseNewVersionAction>(
        'RELEASE_NEW_VERSION',
        undefined,
        undefined,
        undefined,
        undefined,
        skip,
    );
