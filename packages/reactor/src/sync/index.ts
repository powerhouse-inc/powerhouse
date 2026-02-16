export type {
  IChannel,
  IChannelFactory,
  ISyncManager,
  Remote,
} from "./interfaces.js";

export type { ShutdownStatus } from "../shared/types.js";

export type {
  ChannelConfig,
  ChannelHealth,
  ChannelMeta,
  JwtHandler,
  RemoteCursor,
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteStatus,
  SyncEnvelope,
  SyncEnvelopeType,
  SyncFailedEvent,
  SyncOperationErrorType,
  SyncPendingEvent,
  SyncResult,
  SyncResultError,
  SyncResultStatus,
  SyncSucceededEvent,
} from "./types.js";

export {
  ChannelErrorSource,
  ChannelScheme,
  SyncEventTypes,
  SyncOperationStatus,
} from "./types.js";

export { BufferedMailbox } from "./buffered-mailbox.js";
export { Mailbox, type IMailbox } from "./mailbox.js";
export {
  SyncOperation,
  SyncOperationAggregateError,
} from "./sync-operation.js";

export { ChannelError, PollingChannelError } from "./errors.js";

export {
  GqlRequestChannel,
  GqlRequestChannelFactory,
  GqlResponseChannel,
  GqlResponseChannelFactory,
  IntervalPollTimer,
  type GqlChannelConfig,
  type IPollTimer,
} from "./channels/index.js";

export { SyncBuilder } from "./sync-builder.js";
export { SyncManager } from "./sync-manager.js";
export { SyncStatus, SyncStatusTracker } from "./sync-status-tracker.js";
export type {
  ISyncStatusTracker,
  SyncStatusChangeCallback,
} from "./sync-status-tracker.js";

export {
  batchOperationsByDocument,
  createIdleHealth,
  filterOperations,
  sortEnvelopesByFirstOperationTimestamp,
  trimMailboxFromAckOrdinal,
} from "./utils.js";

export type { OperationBatch } from "./utils.js";
