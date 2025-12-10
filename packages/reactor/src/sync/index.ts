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
  SyncOperationErrorType,
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteCursor,
  RemoteStatus,
  SyncEnvelope,
  SyncEnvelopeType,
  ChannelMeta,
} from "./types.js";

export { ChannelErrorSource, SyncOperationStatus } from "./types.js";

export {
  SyncOperation,
  SyncOperationAggregateError,
} from "./sync-operation.js";
export { Mailbox, type MailboxItem } from "./mailbox.js";

export { ChannelError, InternalChannelError } from "./errors.js";

export {
  InternalChannel,
  GqlChannelFactory,
  CompositeChannelFactory,
} from "./channels/index.js";

export { SyncManager } from "./sync-manager.js";
export { SyncBuilder } from "./sync-builder.js";

export { createIdleHealth, filterOperations } from "./utils.js";
