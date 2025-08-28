import type { Action } from "document-model";
import type {
  AddListenerInput,
  AddTriggerInput,
  RemoveListenerInput,
  RemoveTriggerInput,
  SetAvailableOfflineInput,
  SetDriveIconInput,
  SetDriveNameInput,
  SetSharingTypeInput,
} from "document-drive";

export type SetDriveNameAction = Action & {
  type: "SET_DRIVE_NAME";
  input: SetDriveNameInput;
};
export type SetDriveIconAction = Action & {
  type: "SET_DRIVE_ICON";
  input: SetDriveIconInput;
};
export type SetSharingTypeAction = Action & {
  type: "SET_SHARING_TYPE";
  input: SetSharingTypeInput;
};
export type SetAvailableOfflineAction = Action & {
  type: "SET_AVAILABLE_OFFLINE";
  input: SetAvailableOfflineInput;
};
export type AddListenerAction = Action & {
  type: "ADD_LISTENER";
  input: AddListenerInput;
};
export type RemoveListenerAction = Action & {
  type: "REMOVE_LISTENER";
  input: RemoveListenerInput;
};
export type AddTriggerAction = Action & {
  type: "ADD_TRIGGER";
  input: AddTriggerInput;
};
export type RemoveTriggerAction = Action & {
  type: "REMOVE_TRIGGER";
  input: RemoveTriggerInput;
};

export type DocumentDriveDriveAction =
  | SetDriveNameAction
  | SetDriveIconAction
  | SetSharingTypeAction
  | SetAvailableOfflineAction
  | AddListenerAction
  | RemoveListenerAction
  | AddTriggerAction
  | RemoveTriggerAction;
import type {
  DocumentDriveLocalState,
  DocumentDriveState,
} from "document-drive";
import type { SignalDispatch } from "document-model";

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
