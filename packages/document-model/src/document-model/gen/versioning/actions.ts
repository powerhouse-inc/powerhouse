import { BaseAction } from "../../../document/types.js";
import {
  AddChangeLogItemInput,
  DeleteChangeLogItemInput,
  ReorderChangeLogItemsInput,
  UpdateChangeLogItemInput,
} from "../schema/types.js";

export type AddChangeLogItemAction = BaseAction<AddChangeLogItemInput> & {
  type: "ADD_CHANGE_LOG_ITEM";
};
export type UpdateChangeLogItemAction = BaseAction<UpdateChangeLogItemInput> & {
  type: "UPDATE_CHANGE_LOG_ITEM";
};
export type DeleteChangeLogItemAction = BaseAction<DeleteChangeLogItemInput> & {
  type: "DELETE_CHANGE_LOG_ITEM";
};
export type ReorderChangeLogItemsAction = BaseAction<ReorderChangeLogItemsInput> & {
  type: "REORDER_CHANGE_LOG_ITEMS";
};
export type ReleaseNewVersionAction = BaseAction<never> & {
  type: "RELEASE_NEW_VERSION";
};

export type DocumentModelVersioningAction =
  | AddChangeLogItemAction
  | UpdateChangeLogItemAction
  | DeleteChangeLogItemAction
  | ReorderChangeLogItemsAction
  | ReleaseNewVersionAction;
