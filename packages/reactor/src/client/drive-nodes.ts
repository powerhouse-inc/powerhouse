import type { ISigner, PHDocument } from "@powerhousedao/shared/document-model";
import type { PagedResults, PagingOptions } from "../shared/types.js";
import type {
  CopyNodeOptions,
  IReactorReadClient,
  IReactorWriteClient,
  NodeWriteHandle,
  WriteHandle,
} from "./types.js";

/** The kind of a drive node. */
export type DriveNodeKind = "file" | "folder";

/** One node of a drive, as a node source serves it, whatever the drive's type. */
export type DriveNodeRecord = {
  kind: DriveNodeKind;
  id: string;
  driveId: string;
  parentFolder: string | null;
  name: string;
  /** Set on file nodes. */
  documentType?: string;
};

/** A page of nodes; `cursors` holds, per node, the cursor that resumes after it. */
export type DriveNodePage = PagedResults<DriveNodeRecord> & {
  cursors?: string[];
};

/**
 * A drive's nodes as a projection serves them, for every drive type. Reads are
 * eventually consistent; a caller that needs its own write reflected waits for
 * the write's `readable` stage first.
 */
export interface IDriveNodeSource {
  getNode(
    driveId: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<DriveNodeRecord | undefined>;

  /**
   * - `parentFolder === undefined` lists every node in the drive.
   * - `parentFolder === null` lists the root-level nodes.
   * - `parentFolder === <id>` lists the direct children of that folder.
   * - `kind` keeps only nodes of that kind.
   */
  listChildren(
    driveId: string,
    parentFolder: string | null | undefined,
    paging?: PagingOptions,
    signal?: AbortSignal,
    kind?: DriveNodeKind,
  ): Promise<DriveNodePage>;

  /** Every node reachable from `root`, `root` included. */
  getDescendants(
    driveId: string,
    root: string,
    signal?: AbortSignal,
  ): Promise<DriveNodeRecord[]>;

  /** Every node in the drive, unpaged. */
  listAll(driveId: string, signal?: AbortSignal): Promise<DriveNodeRecord[]>;
}

/**
 * The node writes of one drive document type. `write.drives` resolves a drive's
 * type and delegates to the strategy registered for it; a type with none takes
 * the legacy document-drive path. `driveIdentifier` is the resolved drive id.
 */
export interface IDriveWriteStrategy {
  /** The handle's document is the new file. */
  addFile(
    driveIdentifier: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle>;

  addFolder(
    driveIdentifier: string,
    name: string,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle>;

  removeNode(
    driveIdentifier: string,
    nodeId: string,
    signal?: AbortSignal,
  ): Promise<WriteHandle>;

  renameNode(
    driveIdentifier: string,
    nodeId: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<NodeWriteHandle>;

  setPreferredEditorOnNode(
    nodeId: string,
    preferredEditor: string | null,
    signal?: AbortSignal,
  ): Promise<WriteHandle>;

  moveNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
  ): Promise<WriteHandle>;

  /** A copy keeps its source's versions unless `options` overrides them. */
  copyNode(
    driveIdentifier: string,
    srcNodeId: string,
    targetParentFolderId: string | undefined,
    signal?: AbortSignal,
    options?: CopyNodeOptions,
  ): Promise<WriteHandle>;
}

/** What a drive write strategy is built from. */
export type DriveWriteStrategyContext = {
  read: IReactorReadClient;
  write: IReactorWriteClient;
  nodes?: IDriveNodeSource;
  signer: ISigner;
};

/** Builds the strategy for one drive document type, once per write client. */
export type DriveWriteStrategyFactory = (
  context: DriveWriteStrategyContext,
) => IDriveWriteStrategy;

/** The drive node source and write strategies a client is built with. */
export type DriveClientOptions = {
  nodes?: IDriveNodeSource;
  /** Keyed by drive document type. */
  strategies: ReadonlyMap<string, DriveWriteStrategyFactory>;
};
