import { type SignalDispatch } from "document-model";
import {
  type AddFileAction,
  type AddFolderAction,
  type DeleteNodeAction,
  type UpdateFileAction,
  type UpdateNodeAction,
  type CopyNodeAction,
  type MoveNodeAction,
} from "./actions.js";
import { type DocumentDriveState } from "../types.js";

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
