import { createAction } from "../../../document/utils/base.js";
import {
  z,
  type AddChangeLogItemInput,
  type DeleteChangeLogItemInput,
  type ReorderChangeLogItemsInput,
  type UpdateChangeLogItemInput,
} from "../schema/index.js";
import {
  type AddChangeLogItemAction,
  type DeleteChangeLogItemAction,
  type ReleaseNewVersionAction,
  type ReorderChangeLogItemsAction,
  type UpdateChangeLogItemAction,
} from "./actions.js";

export const addChangeLogItem = (input: AddChangeLogItemInput) =>
  createAction<AddChangeLogItemAction>(
    "ADD_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    z.AddChangeLogItemInputSchema,
    "global",
  );

export const updateChangeLogItem = (input: UpdateChangeLogItemInput) =>
  createAction<UpdateChangeLogItemAction>(
    "UPDATE_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    z.UpdateChangeLogItemInputSchema,
    "global",
  );

export const deleteChangeLogItem = (input: DeleteChangeLogItemInput) =>
  createAction<DeleteChangeLogItemAction>(
    "DELETE_CHANGE_LOG_ITEM",
    { ...input },
    undefined,
    z.DeleteChangeLogItemInputSchema,
    "global",
  );

export const reorderChangeLogItems = (input: ReorderChangeLogItemsInput) =>
  createAction<ReorderChangeLogItemsAction>(
    "REORDER_CHANGE_LOG_ITEMS",
    { ...input },
    undefined,
    z.ReorderChangeLogItemsInputSchema,
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
