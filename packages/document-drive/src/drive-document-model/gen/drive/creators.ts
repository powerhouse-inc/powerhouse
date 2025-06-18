import { createAction } from "document-model";
import {
  z,
  type SetDriveNameInput,
  type SetDriveIconInput,
  type SetSharingTypeInput,
  type SetAvailableOfflineInput,
  type AddListenerInput,
  type RemoveListenerInput,
  type AddTriggerInput,
  type RemoveTriggerInput,
} from "../types.js";
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

export const setDriveName = (input: SetDriveNameInput) =>
  createAction<SetDriveNameAction>(
    "SET_DRIVE_NAME",
    { ...input },
    undefined,
    z.SetDriveNameInputSchema,
    "global",
  );

export const setDriveIcon = (input: SetDriveIconInput) =>
  createAction<SetDriveIconAction>(
    "SET_DRIVE_ICON",
    { ...input },
    undefined,
    z.SetDriveIconInputSchema,
    "global",
  );

export const setSharingType = (input: SetSharingTypeInput) =>
  createAction<SetSharingTypeAction>(
    "SET_SHARING_TYPE",
    { ...input },
    undefined,
    z.SetSharingTypeInputSchema,
    "local",
  );

export const setAvailableOffline = (input: SetAvailableOfflineInput) =>
  createAction<SetAvailableOfflineAction>(
    "SET_AVAILABLE_OFFLINE",
    { ...input },
    undefined,
    z.SetAvailableOfflineInputSchema,
    "local",
  );

export const addListener = (input: AddListenerInput) =>
  createAction<AddListenerAction>(
    "ADD_LISTENER",
    { ...input },
    undefined,
    z.AddListenerInputSchema,
    "local",
  );

export const removeListener = (input: RemoveListenerInput) =>
  createAction<RemoveListenerAction>(
    "REMOVE_LISTENER",
    { ...input },
    undefined,
    z.RemoveListenerInputSchema,
    "local",
  );

export const addTrigger = (input: AddTriggerInput) =>
  createAction<AddTriggerAction>(
    "ADD_TRIGGER",
    { ...input },
    undefined,
    z.AddTriggerInputSchema,
    "local",
  );

export const removeTrigger = (input: RemoveTriggerInput) =>
  createAction<RemoveTriggerAction>(
    "REMOVE_TRIGGER",
    { ...input },
    undefined,
    z.RemoveTriggerInputSchema,
    "local",
  );
