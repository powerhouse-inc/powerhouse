import { type BaseAction } from "document-model";
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

export type SetDriveNameAction = BaseAction<
  "SET_DRIVE_NAME",
  SetDriveNameInput
>;
export type SetDriveIconAction = BaseAction<
  "SET_DRIVE_ICON",
  SetDriveIconInput
>;
export type SetSharingTypeAction = BaseAction<
  "SET_SHARING_TYPE",
  SetSharingTypeInput
>;
export type SetAvailableOfflineAction = BaseAction<
  "SET_AVAILABLE_OFFLINE",
  SetAvailableOfflineInput
>;
export type AddListenerAction = BaseAction<"ADD_LISTENER", AddListenerInput>;
export type RemoveListenerAction = BaseAction<
  "REMOVE_LISTENER",
  RemoveListenerInput
>;
export type AddTriggerAction = BaseAction<"ADD_TRIGGER", AddTriggerInput>;
export type RemoveTriggerAction = BaseAction<
  "REMOVE_TRIGGER",
  RemoveTriggerInput
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
