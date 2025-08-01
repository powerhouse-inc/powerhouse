import { type Action } from "document-model";
import type {
  AddFileInput,
  AddFolderInput,
  CopyNodeInput,
  DeleteNodeInput,
  MoveNodeInput,
  UpdateFileInput,
  UpdateNodeInput,
} from "../types.js";

export type AddFileAction = Action & { type: "ADD_FILE"; input: AddFileInput; };
export type AddFolderAction = Action & { type: "ADD_FOLDER"; input: AddFolderInput; };
export type DeleteNodeAction = Action & { type: "DELETE_NODE"; input: DeleteNodeInput; };
export type UpdateFileAction = Action & { type: "UPDATE_FILE"; input: UpdateFileInput; };
export type UpdateNodeAction = Action & { type: "UPDATE_NODE"; input: UpdateNodeInput; };
export type CopyNodeAction = Action & { type: "COPY_NODE"; input: CopyNodeInput; };
export type MoveNodeAction = Action & { type: "MOVE_NODE"; input: MoveNodeInput; };

export type DocumentDriveNodeAction =
  | AddFileAction
  | AddFolderAction
  | DeleteNodeAction
  | UpdateFileAction
  | UpdateNodeAction
  | CopyNodeAction
  | MoveNodeAction;
