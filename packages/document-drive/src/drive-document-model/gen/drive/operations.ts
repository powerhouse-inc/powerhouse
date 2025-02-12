import { SignalDispatch } from "document-model";
import { DocumentDriveAction, DocumentDriveLocalState, DocumentDriveState } from "../types.js";
import {
  AddListenerAction,
  AddTriggerAction,
  RemoveListenerAction,
  RemoveTriggerAction,
  SetAvailableOfflineAction,
  SetDriveIconAction,
  SetDriveNameAction,
  SetSharingTypeAction,
} from "./actions.js";

export interface DocumentDriveDriveOperations {
  setDriveNameOperation: (
    state: DocumentDriveState,
    action: SetDriveNameAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  setDriveIconOperation: (
    state: DocumentDriveState,
    action: SetDriveIconAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  setSharingTypeOperation: (
    state: DocumentDriveLocalState,
    action: SetSharingTypeAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  setAvailableOfflineOperation: (
    state: DocumentDriveLocalState,
    action: SetAvailableOfflineAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  addListenerOperation: (
    state: DocumentDriveLocalState,
    action: AddListenerAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  removeListenerOperation: (
    state: DocumentDriveLocalState,
    action: RemoveListenerAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  addTriggerOperation: (
    state: DocumentDriveLocalState,
    action: AddTriggerAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
  removeTriggerOperation: (
    state: DocumentDriveLocalState,
    action: RemoveTriggerAction,
    dispatch?: SignalDispatch<DocumentDriveState, DocumentDriveLocalState, DocumentDriveAction>,
  ) => void;
}
