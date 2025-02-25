import { BaseAction } from "document-model";
import {
  AddListenerInput,
  AddTriggerInput,
  RemoveListenerInput,
  RemoveTriggerInput,
  SetAvailableOfflineInput,
  SetDriveIconInput,
  SetDriveNameInput,
  SetSharingTypeInput,
} from "../types.js";

export type SetDriveNameAction = BaseAction<
  "SET_DRIVE_NAME",
  SetDriveNameInput,
  "global"
>;
export type SetDriveIconAction = BaseAction<
  "SET_DRIVE_ICON",
  SetDriveIconInput,
  "global"
>;
export type SetSharingTypeAction = BaseAction<
  "SET_SHARING_TYPE",
  SetSharingTypeInput,
  "local"
>;
export type SetAvailableOfflineAction = BaseAction<
  "SET_AVAILABLE_OFFLINE",
  SetAvailableOfflineInput,
  "local"
>;
export type AddListenerAction = BaseAction<
  "ADD_LISTENER",
  AddListenerInput,
  "local"
>;
export type RemoveListenerAction = BaseAction<
  "REMOVE_LISTENER",
  RemoveListenerInput,
  "local"
>;
export type AddTriggerAction = BaseAction<"ADD_TRIGGER", AddTriggerInput, "local">;
export type RemoveTriggerAction = BaseAction<
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
