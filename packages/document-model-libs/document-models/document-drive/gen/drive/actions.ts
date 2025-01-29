import { Action } from "document-model/document";
import {
  SetDriveNameInput,
  SetDriveIconInput,
  SetSharingTypeInput,
  SetAvailableOfflineInput,
  AddListenerInput,
  RemoveListenerInput,
  AddTriggerInput,
  RemoveTriggerInput,
} from "../types";

export type SetDriveNameAction = Action<
  "SET_DRIVE_NAME",
  SetDriveNameInput,
  "global"
>;
export type SetDriveIconAction = Action<
  "SET_DRIVE_ICON",
  SetDriveIconInput,
  "global"
>;
export type SetSharingTypeAction = Action<
  "SET_SHARING_TYPE",
  SetSharingTypeInput,
  "local"
>;
export type SetAvailableOfflineAction = Action<
  "SET_AVAILABLE_OFFLINE",
  SetAvailableOfflineInput,
  "local"
>;
export type AddListenerAction = Action<
  "ADD_LISTENER",
  AddListenerInput,
  "local"
>;
export type RemoveListenerAction = Action<
  "REMOVE_LISTENER",
  RemoveListenerInput,
  "local"
>;
export type AddTriggerAction = Action<"ADD_TRIGGER", AddTriggerInput, "local">;
export type RemoveTriggerAction = Action<
  "REMOVE_TRIGGER",
  RemoveTriggerInput,
  "local"
>;

export type DocumentDriveDriveAction =
  | SetDriveNameAction
  | SetDriveIconAction
  | SetSharingTypeAction
  | SetAvailableOfflineAction
  | AddListenerAction
  | RemoveListenerAction
  | AddTriggerAction
  | RemoveTriggerAction;
