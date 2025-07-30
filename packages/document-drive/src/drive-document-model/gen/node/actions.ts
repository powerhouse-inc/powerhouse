import { type BaseAction } from "document-model";
import type {
  AddFileInput,
  AddFolderInput,
  CopyNodeInput,
  DeleteNodeInput,
  MoveNodeInput,
  UpdateFileInput,
  UpdateNodeInput,
} from "../types.js";

export type AddFileAction = BaseAction<"ADD_FILE", AddFileInput>;
export type AddFolderAction = BaseAction<"ADD_FOLDER", AddFolderInput>;
export type DeleteNodeAction = BaseAction<"DELETE_NODE", DeleteNodeInput>;
export type UpdateFileAction = BaseAction<"UPDATE_FILE", UpdateFileInput>;
export type UpdateNodeAction = BaseAction<"UPDATE_NODE", UpdateNodeInput>;
export type CopyNodeAction = BaseAction<"COPY_NODE", CopyNodeInput>;
export type MoveNodeAction = BaseAction<"MOVE_NODE", MoveNodeInput>;

export type DocumentDriveNodeAction =
  | AddFileAction
  | AddFolderAction
  | DeleteNodeAction
  | UpdateFileAction
  | UpdateNodeAction
  | CopyNodeAction
  | MoveNodeAction;
