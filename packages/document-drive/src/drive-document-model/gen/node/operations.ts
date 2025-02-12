import { SignalDispatch } from "document-model";
import { DocumentDriveAction, DocumentDriveLocalState, DocumentDriveState } from "../types.js";
import {
  AddFileAction,
  AddFolderAction,
  CopyNodeAction,
  DeleteNodeAction,
  MoveNodeAction,
  UpdateFileAction,
  UpdateNodeAction,
} from "./actions.js";

export interface DocumentDriveNodeOperations {
  addFileOperation: (
    state: DocumentDriveState,
    action: AddFileAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  addFolderOperation: (
    state: DocumentDriveState,
    action: AddFolderAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  deleteNodeOperation: (
    state: DocumentDriveState,
    action: DeleteNodeAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  updateFileOperation: (
    state: DocumentDriveState,
    action: UpdateFileAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  updateNodeOperation: (
    state: DocumentDriveState,
    action: UpdateNodeAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  copyNodeOperation: (
    state: DocumentDriveState,
    action: CopyNodeAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  moveNodeOperation: (
    state: DocumentDriveState,
    action: MoveNodeAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
}
