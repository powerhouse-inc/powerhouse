import {
  type DRIVE,
  type FILE,
  type FOLDER,
  type SharingType,
  type SyncStatus,
  type TDocumentType,
} from "#connect";
import { type Maybe } from "document-model";

export type BaseUiFolderNode = {
  id: string;
  name: string;
  driveId: string;
  kind: typeof FOLDER;
  parentFolder: string;
  syncStatus: SyncStatus | undefined;
};

export type BaseUiDriveNode = {
  id: string;
  name: string;
  driveId: string;
  kind: typeof DRIVE;
  parentFolder: null;
  syncStatus: SyncStatus | undefined;
};

export type BaseUiFileNode = {
  id: string;
  name: string;
  driveId: string;
  kind: typeof FILE;
  parentFolder: string;
  documentType: string;
  syncStatus: SyncStatus | undefined;
};

export type BaseUiNode = BaseUiFolderNode | BaseUiFileNode | BaseUiDriveNode;

export type UiFileNode = BaseUiFileNode & {
  slug?: string | null;
  documentType: TDocumentType;
  sharingType: SharingType;
};

export type UiFolderNode = BaseUiFolderNode & {
  slug?: string | null;
  children: UiNode[];
  sharingType: SharingType;
};

export type UiDriveNode = BaseUiDriveNode & {
  slug: string | null;
  children: UiNode[];
  nodeMap: Record<string, UiNode>;
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
};

export type FolderNode = {
  id: string;
  kind: string;
  name: string;
  parentFolder: Maybe<string>;
};
