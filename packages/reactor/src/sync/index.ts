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
  JwtHandler,
  SyncOperationErrorType,
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteCursor,
  RemoteStatus,
  SyncEnvelope,
  SyncEnvelopeType,
  ChannelMeta,
  SyncPendingEvent,
  SyncSucceededEvent,
  SyncFailedEvent,
  SyncResult,
  SyncResultStatus,
  SyncResultError,
} from "./types.js";

export {
  ChannelErrorSource,
  SyncEventTypes,
  SyncOperationStatus,
} from "./types.js";

export {
  SyncOperation,
  SyncOperationAggregateError,
} from "./sync-operation.js";
export { Mailbox, type MailboxItem } from "./mailbox.js";
export { BufferedMailbox } from "./buffered-mailbox.js";

export { ChannelError, PollingChannelError } from "./errors.js";

export {
  PollingChannel,
  GqlChannel,
  GqlChannelFactory,
  CompositeChannelFactory,
  IntervalPollTimer,
  type GqlChannelConfig,
  type IPollTimer,
} from "./channels/index.js";

export { SyncManager } from "./sync-manager.js";
export { SyncBuilder } from "./sync-builder.js";

export { createIdleHealth, filterOperations } from "./utils.js";
