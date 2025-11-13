import type { OperationWithContext } from "../storage/interfaces.js";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export type RemoteOptions = {
  // future configuration options
};

export type RemoteFilter = {
  documentId: string[];
  scope: string[];
  branch: string;
};

export type RemoteCursor = {
  remoteName: string;
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
};

export enum JobChannelStatus {
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

export type JobErrorType =
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
  name: string;
  collectionId: string;
  channelConfig: ChannelConfig;
  filter: RemoteFilter;
  options: RemoteOptions;
  status: RemoteStatus;
};
