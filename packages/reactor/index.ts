// Attachments
export type { AttachmentHash, AttachmentRef } from "./src/attachments/index.js";

// Action Creators
export {
  addRelationshipAction,
  createDocumentAction,
  deleteDocumentAction,
  documentActions,
  removeRelationshipAction,
  updateRelationshipAction,
  upgradeDocumentAction,
} from "./src/actions/index.js";

// Reactor Interface and Implementation
export { DriveClient } from "./src/client/drive-client.js";
export { ReactorClient } from "./src/client/reactor-client.js";
export {
  DocumentChangeType,
  type DocumentChangeEvent,
  type IDriveClient,
  type IReactorClient,
} from "./src/client/types.js";
export {
  ReactorBuilder,
  type DocumentModelSpecInput,
  type ProjectionShardBuilderConfig,
  type ReadModelFactory,
  type ReadModelFactoryDeps,
} from "./src/core/reactor-builder.js";
export type {
  BuiltInReadModelKind,
  IProjectionTransport,
  ProjectionShardManagerConfig,
  ProjectionWorkerFactory,
} from "./src/projection/index.js";
export { ReactorClientBuilder } from "./src/core/reactor-client-builder.js";
export { DEFAULT_DRIVE_CONTAINER_TYPES } from "./src/core/drive-container-types.js";
export { Reactor } from "./src/core/reactor.js";
export {
  type BatchExecutionRequest,
  type BatchExecutionResult,
  type BatchLoadRequest,
  type BatchLoadResult,
  type ExecutionJobPlan,
  type IReactor,
  type LoadJobPlan,
  type ReactorClientModule,
  type ReactorFeatures,
  type ReactorModule,
  type SyncModule,
} from "./src/core/types.js";
export { JobAwaiter, type IJobAwaiter } from "./src/shared/awaiter.js";
export {
  ConsistencyTracker,
  makeConsistencyKey,
  type IConsistencyTracker,
} from "./src/shared/consistency-tracker.js";
export {
  driveIdFromUrl,
  parseDriveUrl,
  type ParsedDriveUrl,
} from "./src/shared/drive-url.js";
export { createMutableShutdownStatus } from "./src/shared/factories.js";
export { parsePagingOptions, type ParsedPaging } from "./src/shared/utils.js";
export {
  JobStatus,
  PropagationMode,
  RelationshipChangeType,
  type ConsistencyCoordinate,
  type ConsistencyKey,
  type ConsistencyToken,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type SearchFilter,
  type ShutdownStatus,
  type ViewFilter,
} from "./src/shared/types.js";
export {
  type SignatureVerificationHandler,
  type SignerConfig,
} from "./src/signer/types.js";

// Subscription Manager
export { DefaultSubscriptionErrorHandler } from "./src/subs/default-error-handler.js";
export { ReactorSubscriptionManager } from "./src/subs/react-subscription-manager.js";
export {
  type IReactorSubscriptionManager,
  type ISubscriptionErrorHandler,
  type SubscriptionErrorContext,
} from "./src/subs/types.js";

// Event Bus
export { EventBus } from "./src/events/event-bus.js";
export { type IEventBus } from "./src/events/interfaces.js";
export {
  EventBusAggregateError,
  ReactorEventTypes,
  type JobPendingEvent,
  type JobReadReadyEvent,
  type JobRunningEvent,
  type JobWriteReadyEvent,
  type JobFailedEvent as ReactorJobFailedEvent,
  type ReadModelBatchCompletedEvent,
  type ReadModelIndexedEvent,
  type ReadModelStage,
  type ReadModelIndexingStage,
  type Unsubscribe,
} from "./src/events/types.js";

// Queue
export { type IQueue } from "./src/queue/interfaces.js";
export { InMemoryQueue } from "./src/queue/queue.js";
export {
  QueueEventTypes,
  type Job,
  type JobAvailableEvent,
} from "./src/queue/types.js";

// Job Tracker
export { InMemoryJobTracker } from "./src/job-tracker/in-memory-job-tracker.js";
export { type IJobTracker } from "./src/job-tracker/interfaces.js";

// Job Executor
export {
  type IJobExecutor,
  type IJobExecutorManager,
} from "./src/executor/interfaces.js";
export {
  SimpleJobExecutorManager,
  type JobExecutorFactory,
} from "./src/executor/simple-job-executor-manager.js";
export {
  SimpleJobExecutor as InMemoryJobExecutor,
  SimpleJobExecutor,
} from "./src/executor/simple-job-executor.js";
export {
  JobExecutorEventTypes,
  type ExecutorStartedEvent,
  type ExecutorStoppedEvent,
  type JobCompletedEvent,
  type JobExecutorConfig,
  type JobFailedEvent,
  type JobResult,
  type JobStartedEvent,
} from "./src/executor/types.js";

// Executor Worker Utilities
export {
  createForwardingLogger,
  errorToInfo,
  sanitizeArg,
  workerEntryPath,
} from "./src/executor/worker/index.js";

// Executor Worker Protocol
export type {
  AbortMessage,
  DbConfig,
  DocumentModelSpec,
  ErrorInfo as WorkerErrorInfo,
  ExecuteMessage,
  FactorySpec,
  HeartbeatMessage,
  InitMessage,
  JobWriteReadyPayload,
  LoadModelMessage,
  LogMessage,
  MetricsMessage,
  ModelLoadFailedMessage,
  ModelLoadedMessage,
  ModelManifestEntry,
  ModuleRef,
  ParentMessage,
  ReadyMessage,
  ResultMessage,
  SanitizedArg,
  ShutdownMessage,
  SignatureVerifierSpec,
  WorkerMessage,
  WorkerPoolConfig,
} from "./src/executor/worker/protocol.js";

// Document Model Registry
export {
  DocumentModelRegistry,
  DocumentModelResolver,
  DuplicateManifestError,
  DuplicateModuleError,
  InvalidModuleError,
  ModuleNotFoundError,
  NullDocumentModelResolver,
  type IDocumentModelLoader,
  type IDocumentModelRegistry,
  type IDocumentModelResolver,
} from "./src/registry/index.js";

// Storage
export type {
  OperationContext,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
export type { Database } from "./src/core/types.js";
export {
  DuplicateOperationError,
  OptimisticLockError,
  RevisionMismatchError,
  type AtomicTxn,
  type DocumentGraphEdge,
  type DocumentRelationship,
  type DocumentRevisions,
  type IDocumentGraph,
  type IDocumentIndexer,
  type IDocumentView,
  type IKeyframeStore,
  type IOperationStore,
  type OperationFilter,
} from "./src/storage/interfaces.js";
export { KyselyDocumentIndexer } from "./src/storage/kysely/document-indexer.js";
export { KyselyKeyframeStore } from "./src/storage/kysely/keyframe-store.js";
export { KyselyOperationStore } from "./src/storage/kysely/store.js";
export {
  instrumentPgPool,
  type PoolInstrumentation,
  type PoolStats,
} from "./src/storage/pool-instrumentation.js";
export type {
  DocumentIndexerDatabase,
  OperationTable,
  Database as StorageDatabase,
} from "./src/storage/kysely/types.js";

// Read Models
export { BaseReadModel } from "./src/read-models/base-read-model.js";
export { ReadModelCoordinator } from "./src/read-models/coordinator.js";
export { KyselyDocumentView } from "./src/read-models/document-view.js";
export {
  type IReadModel,
  type IReadModelCoordinator,
} from "./src/read-models/interfaces.js";
export type {
  DocumentViewDatabase,
  InsertableDocumentSnapshot,
} from "./src/read-models/types.js";

// Cache
export { KyselyWriteCache } from "./src/cache/kysely-write-cache.js";
export {
  DriveCollectionId,
  type IOperationIndex,
  type OperationIndexEntry,
} from "./src/cache/operation-index-types.js";
export type {
  CachedSnapshot,
  DocumentStreamKey,
  KeyframeSnapshot,
  WriteCacheConfig,
} from "./src/cache/write-cache-types.js";
export { type IWriteCache } from "./src/cache/write/interfaces.js";

// Migrations
export {
  getMigrationStatus,
  REACTOR_SCHEMA,
  runMigrations,
} from "./src/storage/migrations/migrator.js";

// Synchronization
export {
  KyselySyncCursorStorage,
  KyselySyncRemoteStorage,
  type ISyncCursorStorage,
  type ISyncRemoteStorage,
} from "./src/storage/index.js";
export {
  batchOperationsByDocument,
  ChannelError,
  ChannelErrorSource,
  ChannelScheme,
  consolidateSyncOperations,
  envelopesToSyncOperations,
  GqlRequestChannel,
  GqlRequestChannelFactory,
  GqlResponseChannel,
  GqlResponseChannelFactory,
  IntervalPollTimer,
  DRIVE_AUTH_ERROR_MESSAGES,
  isDriveAuthError,
  Mailbox,
  PollBehavior,
  PollingChannelError,
  SyncBuilder,
  SyncEventTypes,
  SyncOperation,
  SyncOperationAggregateError,
  SyncOperationStatus,
  SyncStatus,
  SyncStatusTracker,
  trimMailboxFromAckOrdinal,
  type ChannelConfig,
  type ChannelHealth,
  type ChannelMeta,
  type ConnectionState,
  type ConnectionStateChangeCallback,
  type ConnectionStateChangedEvent,
  type ConnectionStateSnapshot,
  type DeadLetterAddedEvent,
  type GqlChannelConfig,
  type IChannel,
  type IChannelFactory,
  type IPollTimer,
  type ISyncManager,
  type ISyncStatusTracker,
  type JwtHandler,
  type OperationBatch,
  type Remote,
  type RemoteCursor,
  type RemoteFilter,
  type RemoteOptions,
  type RemoteRecord,
  type RemoteStatus,
  type SyncEnvelope,
  type SyncEnvelopeType,
  type SyncFailedEvent,
  type SyncOperationErrorType,
  type SyncPendingEvent,
  type SyncStatusChangeCallback,
  type SyncSucceededEvent,
} from "./src/sync/index.js";

// Processors
export {
  createRelationalDb,
  RelationalDbProcessor,
} from "@powerhousedao/shared/processors";
export type {
  IProcessor,
  IProcessorHostModule,
  IProcessorManager,
  IRelationalDb,
  ProcessorApp,
  ProcessorFactory,
  ProcessorFactoryBuilder,
  ProcessorFilter,
  ProcessorRecord,
  ProcessorStatus,
  TrackedProcessor,
} from "@powerhousedao/shared/processors";
export { DocumentIntegrityService } from "./src/admin/document-integrity-service.js";
export type {
  IDocumentIntegrityService,
  KeyframeValidationIssue,
  RebuildResult,
  SnapshotValidationIssue,
  ValidationResult,
} from "./src/admin/types.js";
export { ProcessorManager } from "./src/processors/index.js";
