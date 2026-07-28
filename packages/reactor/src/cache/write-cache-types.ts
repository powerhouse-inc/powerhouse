import type { PHDocument } from "@powerhousedao/shared/document-model";

/**
 * Configuration options for the write cache
 */
export type WriteCacheConfig = {
  /** Maximum number of document streams to cache (LRU eviction). Default: 1000 */
  maxDocuments: number;

  /** Number of snapshots to keep in each document's ring buffer. Default: 10 */
  ringBufferSize: number;

  /** Persist a keyframe snapshot every N revisions. Default: 10 */
  keyframeInterval: number;
};

/**
 * Unique identifier for a document stream
 */
export type DocumentStreamKey = {
  /** Document identifier */
  documentId: string;

  /** Operation scope */
  scope: string;

  /** Branch name */
  branch: string;
};

/**
 * Where a snapshot sits in its stream.
 *
 * - `Head`: the newest revision of the stream when it was stored. Only these
 *   can answer a read that asks for the head.
 * - `Historical`: state at an earlier revision. Usable as a starting point to
 *   replay forward from, and as an answer to a read for that same revision.
 */
export enum SnapshotPosition {
  Head = "head",
  Historical = "historical",
}

/**
 * A cached document snapshot at a specific revision
 */
export type CachedSnapshot = {
  /** The revision number of this snapshot */
  revision: number;

  /** The document state at this revision */
  document: PHDocument;

  /** Where this snapshot sat in the stream when it was stored */
  position: SnapshotPosition;
};

/**
 * Serialized keyframe snapshot for K/V store persistence
 */
export type KeyframeSnapshot = {
  /** The revision number of this keyframe */
  revision: number;

  /** Serialized document state */
  document: string;
};
