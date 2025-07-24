import { type driveLocations, type sharingTypes } from "#connect";

export type SharingTypes = typeof sharingTypes;
export type SharingType = SharingTypes[number];
export type DriveLocations = typeof driveLocations;
export type DriveLocation = DriveLocations[number];
