import { type FileNode, type SyncStatus } from "document-drive";
import { type PHDocument } from "document-model";
import { type SharingType } from "./drives.js";

export type NodeKind = "DRIVE" | "FILE" | "FOLDER";

export type AddDocument = (
  driveId: string,
  name: string,
  documentType: string,
  parentNodeId?: string,
  document?: PHDocument,
) => Promise<FileNode>;

export type AddFolder = (
  driveId: string,
  name: string,
  parentNodeId?: string,
) => Promise<Node>;

export type AddFile = (
  file: string | File,
  driveId: string,
  name?: string,
  parentNodeId?: string,
) => Promise<Node>;

export type RenameNode = (
  driveId: string,
  nodeId: string,
  name: string,
) => Promise<Node>;

export type MoveNode = (
  srcNodeId: string,
  targetNodeId: string,
  driveId: string,
) => Promise<void>;

export type CopyNode = (
  srcNodeId: string,
  targetNodeId: string,
  driveId: string,
) => Promise<void>;

export type DeleteNode = (driveId: string, nodeId: string) => Promise<void>;

export type GetSyncStatusSync = (
  syncId: string,
  sharingType: SharingType,
) => SyncStatus | undefined;

export type SetSelectedNodeId = (nodeId: string | null) => void;
export type OnAddDocument = (...args: Parameters<AddDocument>) => void;
export type OnAddFolder = (...args: Parameters<AddFolder>) => void;
export type OnAddFile = (...args: Parameters<AddFile>) => void;
export type OnRenameNode = (...args: Parameters<RenameNode>) => void;
export type OnMoveNode = (...args: Parameters<MoveNode>) => void;
export type OnCopyNode = (...args: Parameters<CopyNode>) => void;
export type OnDeleteNode = (...args: Parameters<DeleteNode>) => void;
