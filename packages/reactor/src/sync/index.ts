export {
  deriveConnectionHealth,
  type DeadLetterPage,
  type ISyncInspector,
  type MailboxDepths,
  type RemoteConnectionHealth,
  type RemoteCursorInfo,
  type RemoteSyncInspection,
} from "./sync-inspection.js";

export type {
  ConnectionStateChangeCallback,
  IChannel,
  IChannelFactory,
  ISyncAdmin,
  ISyncManager,
  PeerManifestListener,
  Remote,
  RemoteMeta,
} from "./interfaces.js";

export type { ShutdownStatus } from "../shared/types.js";

export type {
  ChannelConfig,
  ChannelHealth,
  ChannelMeta,
  ConnectionState,
  ConnectionStateChangedEvent,
  ConnectionStateSnapshot,
  DeadLetterAddedEvent,
  JwtHandler,
  LocalPeer,
  PurgeLookup,
  RemoteCursor,
  RemoteFilter,
  RemoteOptions,
  RemotePeer,
  RemoteRecord,
  RemoteStatus,
  SyncEnvelope,
  SyncHeldEvent,
  SyncHold,
  SyncPurgeRefusedEvent,
  SyncReleasedEvent,
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
  PollBehavior,
  SyncEventTypes,
  SyncOperationStatus,
} from "./types.js";

export { BufferedMailbox } from "./buffered-mailbox.js";
export { Mailbox, type IMailbox } from "./mailbox.js";
export {
  SyncOperation,
  SyncOperationAggregateError,
} from "./sync-operation.js";

export {
  ChannelError,
  DriveRequestError,
  PollingChannelError,
  SyncRepairRefusedError,
  isDriveAuthError,
  isRecoverableGraphQLError,
  DRIVE_AUTH_ERROR_MESSAGES,
  RECOVERABLE_GRAPHQL_ERROR_CODES,
} from "./errors.js";

export {
  channelFactoryTypes,
  envelopesToSyncOperations,
  GQL_CHANNEL_TYPE,
  GqlRequestChannel,
  GqlRequestChannelFactory,
  GqlResponseChannel,
  GqlResponseChannelFactory,
  POLLING_CHANNEL_TYPE,
  IntervalPollTimer,
  type GqlChannelConfig,
  type IPollTimer,
  type PollDelegate,
} from "./channels/index.js";

export { SyncBuilder } from "./sync-builder.js";
export {
  supportsDeliveryTracking,
  type DeliveryLookup,
  type DeliveryMembership,
  type DeliveryRow,
  type IDeliveryTracking,
  type PendingDelivery,
} from "./delivery-tracking.js";
export { InMemorySyncHoldStorage } from "./memory-hold-storage.js";
export { InMemorySyncPurgeRefusalStorage } from "./memory-purge-refusal-storage.js";
export {
  MAX_POLLED_REFUSALS,
  supportsPurgeRefusals,
  type IPurgeRefusalRecorder,
  type PolledMarkerRefusal,
} from "./purge-refusals.js";
export { InMemorySyncReceivedMarkerStorage } from "./memory-received-marker-storage.js";
export {
  createPeerAgreement,
  type IPeerAgreement,
  type PeerAgreementBasis,
} from "./peer-agreement.js";
export { SyncManager, type SyncManagerConfig } from "./sync-manager.js";
export { SyncStatus, SyncStatusTracker } from "./sync-status-tracker.js";
export type {
  ISyncStatusTracker,
  SyncStatusChangeCallback,
} from "./sync-status-tracker.js";

export {
  batchOperationsByDocument,
  chunkSyncOperations,
  classifyJobFailure,
  consolidateSyncOperations,
  createIdleHealth,
  filterOperations,
  quarantinesDocument,
  splitTrailingSameTimestampRun,
  syncOperationErrorType,
  trimMailboxFromAckOrdinal,
} from "./utils.js";

export type { OperationBatch } from "./utils.js";
