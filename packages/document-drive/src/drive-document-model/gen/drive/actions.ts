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

export type SetDriveNameAction = BaseAction<SetDriveNameInput> & {
  type: "SET_DRIVE_NAME";
};
export type SetDriveIconAction = BaseAction<SetDriveIconInput> & {
  type: "SET_DRIVE_ICON";
};
export type SetSharingTypeAction = BaseAction<SetSharingTypeInput> & {
  type: "SET_SHARING_TYPE";
};
export type SetAvailableOfflineAction = BaseAction<SetAvailableOfflineInput> & {
  type: "SET_AVAILABLE_OFFLINE";
};
export type AddListenerAction = BaseAction<AddListenerInput> & {
  type: "ADD_LISTENER";
};
export type RemoveListenerAction = BaseAction<RemoveListenerInput> & {
  type: "REMOVE_LISTENER";
};
export type AddTriggerAction = BaseAction<AddTriggerInput> & {
  type: "ADD_TRIGGER";
};
export type RemoveTriggerAction = BaseAction<RemoveTriggerInput> & {
  type: "REMOVE_TRIGGER";
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
