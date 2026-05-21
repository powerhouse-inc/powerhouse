import type { Action } from "@powerhousedao/shared/document-model";
import { generateId } from "@powerhousedao/shared/document-model";
import type {
  AddFolderActionInput,
  RemoveFolderActionInput,
  UpdateFolderActionInput,
} from "./types.js";

export type SetDriveNameInput = { name: string };
export type SetDriveIconInput = { icon: string | null };
export type SetSharingTypeInput = { sharingType: string };
export type SetAvailableOfflineInput = { availableOffline: boolean };

export function setDriveNameAction(input: SetDriveNameInput): Action {
  return {
    id: generateId(),
    type: "SET_DRIVE_NAME",
    scope: "global",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

export function setDriveIconAction(input: SetDriveIconInput): Action {
  return {
    id: generateId(),
    type: "SET_DRIVE_ICON",
    scope: "global",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

export function setSharingTypeAction(input: SetSharingTypeInput): Action {
  return {
    id: generateId(),
    type: "SET_SHARING_TYPE",
    scope: "local",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

export function setAvailableOfflineAction(
  input: SetAvailableOfflineInput,
): Action {
  return {
    id: generateId(),
    type: "SET_AVAILABLE_OFFLINE",
    scope: "local",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

export function addFolderAction(input: AddFolderActionInput): Action {
  return {
    id: generateId(),
    type: "ADD_FOLDER",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

export function updateFolderAction(input: UpdateFolderActionInput): Action {
  return {
    id: generateId(),
    type: "UPDATE_FOLDER",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

export function removeFolderAction(input: RemoveFolderActionInput): Action {
  return {
    id: generateId(),
    type: "REMOVE_FOLDER",
    scope: "document",
    timestampUtcMs: new Date().toISOString(),
    input,
  };
}

export const reactorDriveActions = {
  setDriveName: setDriveNameAction,
  setDriveIcon: setDriveIconAction,
  setSharingType: setSharingTypeAction,
  setAvailableOffline: setAvailableOfflineAction,
  addFolder: addFolderAction,
  updateFolder: updateFolderAction,
  removeFolder: removeFolderAction,
};
