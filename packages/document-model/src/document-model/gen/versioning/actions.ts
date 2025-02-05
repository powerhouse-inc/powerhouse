import { BaseAction } from "@document/types.js";
import { AddChangeLogItemInput, UpdateChangeLogItemInput, DeleteChangeLogItemInput, ReorderChangeLogItemsInput } from "../schema/types.js";


export type AddChangeLogItemAction = BaseAction<
  "ADD_CHANGE_LOG_ITEM",
  AddChangeLogItemInput
>;
export type UpdateChangeLogItemAction = BaseAction<
  "UPDATE_CHANGE_LOG_ITEM",
  UpdateChangeLogItemInput
>;
export type DeleteChangeLogItemAction = BaseAction<
  "DELETE_CHANGE_LOG_ITEM",
  DeleteChangeLogItemInput
>;
export type ReorderChangeLogItemsAction = BaseAction<
  "REORDER_CHANGE_LOG_ITEMS",
  ReorderChangeLogItemsInput
>;
export type ReleaseNewVersionAction = BaseAction<"RELEASE_NEW_VERSION", never>;

export type DocumentModelVersioningAction =
  | AddChangeLogItemAction
  | UpdateChangeLogItemAction
  | DeleteChangeLogItemAction
  | ReorderChangeLogItemsAction
  | ReleaseNewVersionAction;
