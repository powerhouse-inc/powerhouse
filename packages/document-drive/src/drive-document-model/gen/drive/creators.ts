import { createAction } from "document-model";
import { AddListenerInputSchema, AddTriggerInputSchema, RemoveListenerInputSchema, RemoveTriggerInputSchema, SetAvailableOfflineInputSchema, SetDriveIconInputSchema, SetDriveNameInputSchema, SetSharingTypeInputSchema } from "../schema/zod.js";
import {
  AddListenerInput,
  AddTriggerInput,
  RemoveListenerInput,
  RemoveTriggerInput,
  SetAvailableOfflineInput,
  SetDriveIconInput,
  SetDriveNameInput,
  SetSharingTypeInput
} from "../types.js";
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



export const setDriveName = (input: SetDriveNameInput) =>
  createAction<SetDriveNameAction>(
    "SET_DRIVE_NAME",
    { ...input },
    undefined,
    SetDriveNameInputSchema,
    "global",
  );

export const setDriveIcon = (input: SetDriveIconInput) =>
  createAction<SetDriveIconAction>(
    "SET_DRIVE_ICON",
    { ...input },
    undefined,
    SetDriveIconInputSchema,
    "global",
  );

export const setSharingType = (input: SetSharingTypeInput) =>
  createAction<SetSharingTypeAction>(
    "SET_SHARING_TYPE",
    { ...input },
    undefined,
    SetSharingTypeInputSchema,
    "local",
  );

export const setAvailableOffline = (input: SetAvailableOfflineInput) =>
  createAction<SetAvailableOfflineAction>(
    "SET_AVAILABLE_OFFLINE",
    { ...input },
    undefined,
    SetAvailableOfflineInputSchema,
    "local",
  );

export const addListener = (input: AddListenerInput) =>
  createAction<AddListenerAction>(
    "ADD_LISTENER",
    { ...input },
    undefined,
    AddListenerInputSchema,
    "local",
  );

export const removeListener = (input: RemoveListenerInput) =>
  createAction<RemoveListenerAction>(
    "REMOVE_LISTENER",
    { ...input },
    undefined,
    RemoveListenerInputSchema,
    "local",
  );

export const addTrigger = (input: AddTriggerInput) =>
  createAction<AddTriggerAction>(
    "ADD_TRIGGER",
    { ...input },
    undefined,
    AddTriggerInputSchema,
    "local",
  );

export const removeTrigger = (input: RemoveTriggerInput) =>
  createAction<RemoveTriggerAction>(
    "REMOVE_TRIGGER",
    { ...input },
    undefined,
    RemoveTriggerInputSchema,
    "local",
  );
