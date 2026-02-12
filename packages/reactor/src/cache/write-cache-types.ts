import type { PHDocument } from "document-model";

/**
 * Configuration options for the write cache
 */
export type WriteCacheConfig = {
  /** Maximum number of document streams to cache (LRU eviction). Default: 1000 */
  maxDocuments: number;

  /** Number of snapshots to keep in each document's ring buffer. Default: 10 */
  ringBufferSize: number;
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
 * A cached document snapshot at a specific revision
 */
export type CachedSnapshot = {
  /** The revision number of this snapshot */
  revision: number;

  /** The document state at this revision */
  document: PHDocument;
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
