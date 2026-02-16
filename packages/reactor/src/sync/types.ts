import type { OperationWithContext } from "shared/document-model";

export enum ChannelScheme {
  CONNECT = "connect",
  SWITCHBOARD = "switchboard",
}

/**
 * Dynamic JWT token handler for generating authentication tokens per-request.
 * Called with the target URL to enable audience-specific tokens (aud claim).
 * Returns undefined if no authentication is available (e.g., user not logged in).
 */
export type JwtHandler = (url: string) => Promise<string | undefined>;

export type RemoteOptions = {
  sinceTimestampUtcMs: string;
};

export type RemoteFilter = {
  documentId: string[];
  scope: string[];
  branch: string;
};

export type RemoteCursor = {
  remoteName: string;
  cursorType: string;
  cursorOrdinal: number;
  lastSyncedAtUtcMs?: number;
};

export type ChannelMeta = {
  id: string;
};

export type SyncEnvelopeType = "operations" | "ack";

export type SyncEnvelope = {
  type: SyncEnvelopeType;
  channelMeta: ChannelMeta;
  operations?: OperationWithContext[];
  cursor?: RemoteCursor;
  key?: string;
  dependsOn?: string[];
};

export enum SyncOperationStatus {
  Unknown = -1,
  TransportPending = 0,
  ExecutionPending = 1,
  Applied = 2,
  Error = 3,
}

export enum ChannelErrorSource {
  None = "none",
  Channel = "channel",
  Inbox = "inbox",
  Outbox = "outbox",
}

export type SyncOperationErrorType =
  | "SIGNATURE_INVALID"
  | "HASH_MISMATCH"
  | "LIBRARY_ERROR"
  | "MISSING_OPERATIONS"
  | "EXCESSIVE_SHUFFLE"
  | "GRACEFUL_ABORT";

export type ChannelHealth = {
  state: "idle" | "running" | "error";
  lastSuccessUtcMs?: number;
  lastFailureUtcMs?: number;
  failureCount: number;
};

export type RemoteStatus = {
  push: ChannelHealth;
  pull: ChannelHealth;
};

export type ChannelConfig = {
  type: string;
  parameters: Record<string, unknown>;
};

export type RemoteRecord = {
  id: string;
  name: string;
  collectionId: string;
  channelConfig: ChannelConfig;
  filter: RemoteFilter;
  options: RemoteOptions;
  status: RemoteStatus;
};

/**
 * Event types for sync lifecycle events.
 * These events track the sync progress of a job's operations to remotes.
 * Uses a separate namespace (20000 range) from ReactorEventTypes (10000 range).
 */
export const SyncEventTypes = {
  SYNC_PENDING: 20001,
  SYNC_SUCCEEDED: 20002,
  SYNC_FAILED: 20003,
} as const;

/**
 * Event emitted when all SyncOperations for a job are queued in outboxes.
 */
export type SyncPendingEvent = {
  jobId: string;
  syncOperationCount: number;
  remoteNames: string[];
};

/**
 * Event emitted when all sync operations for a job succeed.
 */
export type SyncSucceededEvent = {
  jobId: string;
  syncOperationCount: number;
};

/**
 * Event emitted when at least one sync operation for a job fails.
 */
export type SyncFailedEvent = {
  jobId: string;
  successCount: number;
  failureCount: number;
  errors: Array<{
    remoteName: string;
    documentId: string;
    error: string;
  }>;
};

/**
 * Status of a sync operation result.
 */
export type SyncResultStatus = "succeeded" | "failed";

/**
 * Error information for a failed sync operation to a specific remote.
 */
export type SyncResultError = {
  remoteName: string;
  documentId: string;
  error: string;
};

/**
 * Result of waiting for sync operations to complete for a job.
 * Returned by ISyncManager.waitForSync().
 */
export type SyncResult = {
  jobId: string;
  status: SyncResultStatus;
  syncOperationCount: number;
  successCount: number;
  failureCount: number;
  errors: SyncResultError[];
};
