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
  JobErrorType,
  RemoteFilter,
  RemoteOptions,
  RemoteRecord,
  RemoteCursor,
  RemoteStatus,
  SyncEnvelope,
  SyncEnvelopeType,
  ChannelMeta,
} from "./types.js";

export { ChannelErrorSource, JobChannelStatus } from "./types.js";

export { JobHandle } from "./job-handle.js";
export { Mailbox, type MailboxItem } from "./mailbox.js";

export { ChannelError, InternalChannelError } from "./errors.js";

export { InternalChannel } from "./channels/index.js";

export { SyncManager } from "./sync-manager.js";

export { createIdleHealth, filterOperations } from "./utils.js";
