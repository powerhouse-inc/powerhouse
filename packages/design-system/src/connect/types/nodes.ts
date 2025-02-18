import {
  DRIVE,
  FILE,
  FOLDER,
  SharingType,
  SyncStatus,
  TDocumentType,
} from "@/connect";
import { Maybe, Scalars, SynchronizationUnit } from "document-model";

export type UiFileNode = {
  kind: typeof FILE;
  id: string;
  name: string;
  slug?: string | null;
  documentType: TDocumentType;
  parentFolder: string;
  driveId: string;
  syncStatus: SyncStatus | undefined;
  synchronizationUnits: SynchronizationUnit[];
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
  documentType: Scalars["String"]["output"];
  id: Scalars["String"]["output"];
  kind: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  parentFolder: Maybe<Scalars["String"]["output"]>;
  synchronizationUnits: SynchronizationUnit[];
};

export type FolderNode = {
  id: Scalars["String"]["output"];
  kind: Scalars["String"]["output"];
  name: Scalars["String"]["output"];
  parentFolder: Maybe<Scalars["String"]["output"]>;
};
