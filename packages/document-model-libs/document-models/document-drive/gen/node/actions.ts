import { Action } from "document-model/document";
import {
  AddFileInput,
  AddFolderInput,
  DeleteNodeInput,
  UpdateFileInput,
  UpdateNodeInput,
  CopyNodeInput,
  MoveNodeInput,
} from "../types";

export type AddFileAction = Action<"ADD_FILE", AddFileInput, "global">;
export type AddFolderAction = Action<"ADD_FOLDER", AddFolderInput, "global">;
export type DeleteNodeAction = Action<"DELETE_NODE", DeleteNodeInput, "global">;
export type UpdateFileAction = Action<"UPDATE_FILE", UpdateFileInput, "global">;
export type UpdateNodeAction = Action<"UPDATE_NODE", UpdateNodeInput, "global">;
export type CopyNodeAction = Action<"COPY_NODE", CopyNodeInput, "global">;
export type MoveNodeAction = Action<"MOVE_NODE", MoveNodeInput, "global">;

export type DocumentDriveNodeAction =
  | AddFileAction
  | AddFolderAction
  | DeleteNodeAction
  | UpdateFileAction
  | UpdateNodeAction
  | CopyNodeAction
  | MoveNodeAction;
