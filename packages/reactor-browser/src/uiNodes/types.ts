import { type Maybe, type SynchronizationUnitInput } from "document-model";
import {
  type DRIVE,
  type driveLocations,
  type FILE,
  type FOLDER,
  type sharingTypes,
  type syncStatuses,
} from "./constants.js";

export type SharingTypes = typeof sharingTypes;
export type SharingType = SharingTypes[number];
export type DriveLocations = typeof driveLocations;
export type DriveLocation = DriveLocations[number];

export type SyncStatuses = typeof syncStatuses;
export type SyncStatus = SyncStatuses[number];

export type UiFileNode = {
  kind: typeof FILE;
  id: string;
  name: string;
  slug?: string | null;
  documentType: string;
  parentFolder: string;
  driveId: string;
  syncStatus: SyncStatus | undefined;
  synchronizationUnits: SynchronizationUnitInput[];
  sharingType: SharingType;
};

export type UiFolderNode = {
  kind: typeof FOLDER;
  id: string;
  name: string;
  slug?: string | null;
  parentFolder: string;
  driveId: string;
  children: UiNode[];
  syncStatus: SyncStatus | undefined;
  sharingType: SharingType;
};

export type UiDriveNode = {
  kind: typeof DRIVE;
  id: string;
  name: string;
  slug: string | null;
  parentFolder: null;
  driveId: string;
  children: UiNode[];
  nodeMap: Record<string, UiNode>;
  syncStatus: SyncStatus | undefined;
  sharingType: SharingType;
  availableOffline: boolean;
  icon: string | null;
};

export type UiNode = UiDriveNode | UiFileNode | UiFolderNode;

export type FileNode = {
  documentType: string;
  id: string;
  kind: string;
  name: string;
  parentFolder: Maybe<string>;
  synchronizationUnits: SynchronizationUnitInput[];
};

export type FolderNode = {
  id: string;
  kind: string;
  name: string;
  parentFolder: Maybe<string>;
};
