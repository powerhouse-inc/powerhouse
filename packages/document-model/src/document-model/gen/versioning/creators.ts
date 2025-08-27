import { createAction } from "document-model";
import type {
  AddChangeLogItemInput,
  DeleteChangeLogItemInput,
  ReorderChangeLogItemsInput,
  UpdateChangeLogItemInput,
} from "../schema/index.js";
import { z } from "../schema/index.js";
import type {
  AddChangeLogItemAction,
  DeleteChangeLogItemAction,
  ReleaseNewVersionAction,
  ReorderChangeLogItemsAction,
  UpdateChangeLogItemAction,
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
