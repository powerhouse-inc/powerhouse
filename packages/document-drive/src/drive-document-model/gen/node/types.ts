import type {
  AddFileInput,
  AddFolderInput,
  CopyNodeInput,
  DeleteNodeInput,
  DocumentDriveState,
  MoveNodeInput,
  UpdateFileInput,
  UpdateNodeInput,
} from "document-drive";
import type { Action, SignalDispatch } from "document-model";

export type AddFileAction = Action & { type: "ADD_FILE"; input: AddFileInput };
export type AddFolderAction = Action & {
  type: "ADD_FOLDER";
  input: AddFolderInput;
};
export type DeleteNodeAction = Action & {
  type: "DELETE_NODE";
  input: DeleteNodeInput;
};
export type UpdateFileAction = Action & {
  type: "UPDATE_FILE";
  input: UpdateFileInput;
};
export type UpdateNodeAction = Action & {
  type: "UPDATE_NODE";
  input: UpdateNodeInput;
};
export type CopyNodeAction = Action & {
  type: "COPY_NODE";
  input: CopyNodeInput;
};
export type MoveNodeAction = Action & {
  type: "MOVE_NODE";
  input: MoveNodeInput;
};

export type DocumentDriveNodeAction =
  | AddFileAction
  | AddFolderAction
  | DeleteNodeAction
  | UpdateFileAction
  | UpdateNodeAction
  | CopyNodeAction
  | MoveNodeAction;

export interface DocumentDriveNodeOperations {
  addFileOperation: (
    state: DocumentDriveState,
    action: AddFileAction,
    dispatch?: SignalDispatch,
  ) => void;
  addFolderOperation: (
    state: DocumentDriveState,
    action: AddFolderAction,
    dispatch?: SignalDispatch,
  ) => void;
  deleteNodeOperation: (
    state: DocumentDriveState,
    action: DeleteNodeAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateFileOperation: (
    state: DocumentDriveState,
    action: UpdateFileAction,
    dispatch?: SignalDispatch,
  ) => void;
  updateNodeOperation: (
    state: DocumentDriveState,
    action: UpdateNodeAction,
    dispatch?: SignalDispatch,
  ) => void;
  copyNodeOperation: (
    state: DocumentDriveState,
    action: CopyNodeAction,
    dispatch?: SignalDispatch,
  ) => void;
  moveNodeOperation: (
    state: DocumentDriveState,
    action: MoveNodeAction,
    dispatch?: SignalDispatch,
  ) => void;
}
