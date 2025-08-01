import { Action, ActionWithAttachment } from "../../../document/types.js";
import {
  AddChangeLogItemInput,
  DeleteChangeLogItemInput,
  ReorderChangeLogItemsInput,
  UpdateChangeLogItemInput,
} from "../schema/types.js";

export type AddChangeLogItemAction = Action & {
  type: "ADD_CHANGE_LOG_ITEM";
  input: AddChangeLogItemInput;
};
export type UpdateChangeLogItemAction = Action & {
  type: "UPDATE_CHANGE_LOG_ITEM";
  input: UpdateChangeLogItemInput;
};
export type DeleteChangeLogItemAction = Action & {
  type: "DELETE_CHANGE_LOG_ITEM";
  input: DeleteChangeLogItemInput;
};
export type ReorderChangeLogItemsAction = Action & {
  type: "REORDER_CHANGE_LOG_ITEMS";
  input: ReorderChangeLogItemsInput;
};
export type ReleaseNewVersionAction = Action & {
  type: "RELEASE_NEW_VERSION";
  input: {};
};

export type DocumentModelVersioningAction =
  | AddChangeLogItemAction
  | UpdateChangeLogItemAction
  | DeleteChangeLogItemAction
  | ReorderChangeLogItemsAction
  | ReleaseNewVersionAction;
