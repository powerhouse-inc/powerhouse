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

export type AddFileAction = BaseAction<AddFileInput> & { type: "ADD_FILE" };
export type AddFolderAction = BaseAction<AddFolderInput> & { type: "ADD_FOLDER" };
export type DeleteNodeAction = BaseAction<DeleteNodeInput> & { type: "DELETE_NODE" };
export type UpdateFileAction = BaseAction<UpdateFileInput> & { type: "UPDATE_FILE" };
export type UpdateNodeAction = BaseAction<UpdateNodeInput> & { type: "UPDATE_NODE" };
export type CopyNodeAction = BaseAction<CopyNodeInput> & { type: "COPY_NODE" };
export type MoveNodeAction = BaseAction<MoveNodeInput> & { type: "MOVE_NODE" };

export type DocumentDriveNodeAction =
  | AddFileAction
  | AddFolderAction
  | DeleteNodeAction
  | UpdateFileAction
  | UpdateNodeAction
  | CopyNodeAction
  | MoveNodeAction;
