import { SignalDispatch } from "document-model";
import {
    AddFileAction,
    AddFolderAction,
    DeleteNodeAction,
    UpdateFileAction,
    UpdateNodeAction,
    CopyNodeAction,
    MoveNodeAction,
} from "./actions.js";
import { DocumentDriveState } from "../types.js";

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
