import { type driveLocations, type sharingTypes } from "#connect";
import { type FileNode, type FolderNode } from "document-drive";

export type SharingTypes = typeof sharingTypes;
export type SharingType = SharingTypes[number];
export type DriveLocations = typeof driveLocations;
export type DriveLocation = DriveLocations[number];

export type DocumentDriveDocument = {
  state: {
    global: {
      id: string;
      name: string;
      slug: string | null | undefined;
      icon: string;
      nodes: (FileNode | FolderNode)[];
    };
    local: {
      sharingType: SharingType;
      availableOffline: boolean;
    };
  };
};
