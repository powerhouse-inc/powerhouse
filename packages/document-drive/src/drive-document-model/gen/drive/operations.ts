import { type SignalDispatch } from "document-model";
import {
  type SetDriveNameAction,
  type SetDriveIconAction,
  type SetSharingTypeAction,
  type SetAvailableOfflineAction,
  type AddListenerAction,
  type RemoveListenerAction,
  type AddTriggerAction,
  type RemoveTriggerAction,
} from "./actions.js";
import {
  type DocumentDriveState,
  type DocumentDriveLocalState,
} from "../types.js";

export interface DocumentDriveDriveOperations {
  setDriveNameOperation: (
    state: DocumentDriveState,
    action: SetDriveNameAction,
    dispatch?: SignalDispatch,
  ) => void;
  setDriveIconOperation: (
    state: DocumentDriveState,
    action: SetDriveIconAction,
    dispatch?: SignalDispatch,
  ) => void;
  setSharingTypeOperation: (
    state: DocumentDriveLocalState,
    action: SetSharingTypeAction,
    dispatch?: SignalDispatch,
  ) => void;
  setAvailableOfflineOperation: (
    state: DocumentDriveLocalState,
    action: SetAvailableOfflineAction,
    dispatch?: SignalDispatch,
  ) => void;
  addListenerOperation: (
    state: DocumentDriveLocalState,
    action: AddListenerAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeListenerOperation: (
    state: DocumentDriveLocalState,
    action: RemoveListenerAction,
    dispatch?: SignalDispatch,
  ) => void;
  addTriggerOperation: (
    state: DocumentDriveLocalState,
    action: AddTriggerAction,
    dispatch?: SignalDispatch,
  ) => void;
  removeTriggerOperation: (
    state: DocumentDriveLocalState,
    action: RemoveTriggerAction,
    dispatch?: SignalDispatch,
  ) => void;
}
