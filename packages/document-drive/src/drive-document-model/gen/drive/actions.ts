import { type Action } from "document-model";
import type {
  AddListenerInput,
  AddTriggerInput,
  RemoveListenerInput,
  RemoveTriggerInput,
  SetAvailableOfflineInput,
  SetDriveIconInput,
  SetDriveNameInput,
  SetSharingTypeInput,
} from "../types.js";

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
