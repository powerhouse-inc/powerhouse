import type { FileNode, Node } from "document-drive";
import { type PHDocument } from "document-model";
import {
  type driveLocations,
  type sharingTypes,
  type syncStatuses,
} from "./constants.js";
export type SharingTypes = typeof sharingTypes;
export type SharingType = SharingTypes[number];
export type DriveLocations = typeof driveLocations;
export type DriveLocation = DriveLocations[number];

export type SyncStatuses = typeof syncStatuses;
export type SyncStatus = SyncStatuses[number];
