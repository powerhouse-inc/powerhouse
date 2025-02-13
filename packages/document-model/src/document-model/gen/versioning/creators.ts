import { createAction } from "../../../document/utils/base.js";
import {
  AddChangeLogItemInput,
  DeleteChangeLogItemInput,
  ReorderChangeLogItemsInput,
  UpdateChangeLogItemInput,
} from "../schema/types.js";
import {
  AddChangeLogItemAction,
  DeleteChangeLogItemAction,
  ReleaseNewVersionAction,
  ReorderChangeLogItemsAction,
  UpdateChangeLogItemAction,
} from "./actions.js";

export const addChangeLogItem = (input: AddChangeLogItemInput) =>
  createAction<AddChangeLogItemAction>("ADD_CHANGE_LOG_ITEM", { ...input });

export const updateChangeLogItem = (input: UpdateChangeLogItemInput) =>
  createAction<UpdateChangeLogItemAction>("UPDATE_CHANGE_LOG_ITEM", {
    ...input,
  });

export const deleteChangeLogItem = (input: DeleteChangeLogItemInput) =>
  createAction<DeleteChangeLogItemAction>("DELETE_CHANGE_LOG_ITEM", {
    ...input,
  });

export const reorderChangeLogItems = (input: ReorderChangeLogItemsInput) =>
  createAction<ReorderChangeLogItemsAction>("REORDER_CHANGE_LOG_ITEMS", {
    ...input,
  });

export const releaseNewVersion = () =>
  createAction<ReleaseNewVersionAction>("RELEASE_NEW_VERSION");
