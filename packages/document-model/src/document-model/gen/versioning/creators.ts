import type {
  AddChangeLogItemAction,
  AddChangeLogItemInput,
  DeleteChangeLogItemAction,
  DeleteChangeLogItemInput,
  ReleaseNewVersionAction,
  ReorderChangeLogItemsAction,
  ReorderChangeLogItemsInput,
  UpdateChangeLogItemAction,
  UpdateChangeLogItemInput,
} from "document-model";
import {
  AddChangeLogItemInputSchema,
  createAction,
  DeleteChangeLogItemInputSchema,
  ReorderChangeLogItemsInputSchema,
  UpdateChangeLogItemInputSchema,
} from "document-model";

export const addChangeLogItem = (input: AddChangeLogItemInput) =>
  createAction<AddChangeLogItemAction>(
    "ADD_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    AddChangeLogItemInputSchema,
    "global",
  );

export const updateChangeLogItem = (input: UpdateChangeLogItemInput) =>
  createAction<UpdateChangeLogItemAction>(
    "UPDATE_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    UpdateChangeLogItemInputSchema,
    "global",
  );

export const deleteChangeLogItem = (input: DeleteChangeLogItemInput) =>
  createAction<DeleteChangeLogItemAction>(
    "DELETE_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    DeleteChangeLogItemInputSchema,
    "global",
  );

export const reorderChangeLogItems = (input: ReorderChangeLogItemsInput) =>
  createAction<ReorderChangeLogItemsAction>(
    "REORDER_CHANGE_LOG_ITEMS",
    { ...input },
    undefined,
    ReorderChangeLogItemsInputSchema,
    "global",
  );

export const releaseNewVersion = () =>
  createAction<ReleaseNewVersionAction>(
    "RELEASE_NEW_VERSION",
    {},
    undefined,
    undefined,
    "global",
  );
