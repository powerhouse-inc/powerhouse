import {
  DRIVE,
  FILE,
  FOLDER,
  SharingType,
  SyncStatus,
  TDocumentType,
} from "@/connect";
import { Maybe, SynchronizationUnitInput } from "document-model";
import { Scalars } from "zod";

export type UiFileNode = {
  kind: typeof FILE;
  id: string;
  name: string;
  slug?: string | null;
  documentType: TDocumentType;
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
