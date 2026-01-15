// Action Creators
export {
  addRelationshipAction,
  createDocumentAction,
  deleteDocumentAction,
  documentActions,
  removeRelationshipAction,
  upgradeDocumentAction,
} from "./actions/index.js";

// Reactor Interface and Implementation
export { ReactorClient } from "./client/reactor-client.js";
export {
  DocumentChangeType,
  type DocumentChangeEvent,
  type IReactorClient,
} from "./client/types.js";
export { ReactorBuilder } from "./core/reactor-builder.js";
export { ReactorClientBuilder } from "./core/reactor-client-builder.js";
export { Reactor } from "./core/reactor.js";
export {
  type IReactor,
  type ReactorClientModule,
  type ReactorFeatures,
  type ReactorModule,
  type SyncModule,
} from "./core/types.js";
export { JobAwaiter, type IJobAwaiter } from "./shared/awaiter.js";
export {
  ConsistencyTracker,
  makeConsistencyKey,
  type IConsistencyTracker,
} from "./shared/consistency-tracker.js";
export { createMutableShutdownStatus } from "./shared/factories.js";
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
} from "./shared/types.js";
export {
  type SignatureVerificationHandler,
  type SignerConfig,
} from "./signer/types.js";

// Subscription Manager
export { DefaultSubscriptionErrorHandler } from "./subs/default-error-handler.js";
export { ReactorSubscriptionManager } from "./subs/react-subscription-manager.js";
export {
  type IReactorSubscriptionManager,
  type ISubscriptionErrorHandler,
  type SubscriptionErrorContext,
} from "./subs/types.js";

// Event Bus
export { EventBus } from "./events/event-bus.js";
export { type IEventBus } from "./events/interfaces.js";
export {
  EventBusAggregateError,
  OperationEventTypes,
  type OperationsReadyEvent,
  type OperationWrittenEvent,
  type Unsubscribe,
} from "./events/types.js";

// Queue
export { type IQueue } from "./queue/interfaces.js";
export { InMemoryQueue } from "./queue/queue.js";
export {
  QueueEventTypes,
  type Job,
  type JobAvailableEvent,
} from "./queue/types.js";

// Job Tracker
export { InMemoryJobTracker } from "./job-tracker/in-memory-job-tracker.js";
export { type IJobTracker } from "./job-tracker/interfaces.js";

// Job Executor
export {
  type IJobExecutor,
  type IJobExecutorManager,
} from "./executor/interfaces.js";
export {
  SimpleJobExecutorManager,
  type JobExecutorFactory,
} from "./executor/simple-job-executor-manager.js";
export {
  SimpleJobExecutor as InMemoryJobExecutor,
  SimpleJobExecutor,
} from "./executor/simple-job-executor.js";
export {
  JobExecutorEventTypes,
  type ExecutorStartedEvent,
  type ExecutorStoppedEvent,
  type JobCompletedEvent,
  type JobExecutorConfig,
  type JobFailedEvent,
  type JobResult,
  type JobStartedEvent,
} from "./executor/types.js";

// Document Model Registry
export {
  DocumentModelRegistry,
  DuplicateModuleError,
  InvalidModuleError,
  ModuleNotFoundError,
  type IDocumentModelRegistry,
} from "./registry/index.js";

// Storage
export type { Database } from "./core/types.js";
export { ConsistencyAwareLegacyStorage } from "./storage/consistency-aware-legacy-storage.js";
export {
  DuplicateOperationError,
  OptimisticLockError,
  RevisionMismatchError,
  type AtomicTxn,
  type DocumentGraphEdge,
  type DocumentRelationship,
  type DocumentRevisions,
  type DocumentSnapshot,
  type IConsistencyAwareStorage,
  type IDocumentGraph,
  type IDocumentIndexer,
  type IDocumentView,
  type IKeyframeStore,
  type IOperationStore,
  type OperationContext,
  type OperationWithContext,
} from "./storage/interfaces.js";
export { KyselyDocumentIndexer } from "./storage/kysely/document-indexer.js";
export { KyselyKeyframeStore } from "./storage/kysely/keyframe-store.js";
export { KyselyOperationStore } from "./storage/kysely/store.js";
export type {
  DocumentIndexerDatabase,
  OperationTable,
  Database as StorageDatabase,
} from "./storage/kysely/types.js";

// Read Models
export { BaseReadModel } from "./read-models/base-read-model.js";
export { ReadModelCoordinator } from "./read-models/coordinator.js";
export { KyselyDocumentView } from "./read-models/document-view.js";
export {
  type IReadModel,
  type IReadModelCoordinator,
} from "./read-models/interfaces.js";
export type {
  DocumentViewDatabase,
  InsertableDocumentSnapshot,
} from "./read-models/types.js";

// Cache
export { KyselyWriteCache } from "./cache/kysely-write-cache.js";
export { driveCollectionId } from "./cache/operation-index-types.js";
export type {
  CachedSnapshot,
  DocumentStreamKey,
  KeyframeSnapshot,
  WriteCacheConfig,
} from "./cache/write-cache-types.js";
export { type IWriteCache } from "./cache/write/interfaces.js";

// Logging
export { ConsoleLogger } from "./logging/console.js";
export { type ILogger } from "./logging/types.js";

// Migrations
export {
  REACTOR_SCHEMA,
  runMigrations,
} from "./storage/migrations/migrator.js";

// Synchronization
export {
  KyselySyncCursorStorage,
  KyselySyncRemoteStorage,
  type ISyncCursorStorage,
  type ISyncRemoteStorage,
} from "./storage/index.js";
export {
  ChannelError,
  ChannelErrorSource,
  CompositeChannelFactory,
  GqlChannelFactory,
  Mailbox,
  PollingChannel,
  PollingChannelError,
  SyncBuilder,
  SyncOperation,
  SyncOperationAggregateError,
  SyncOperationStatus,
  type ChannelConfig,
  type ChannelHealth,
  type ChannelMeta,
  type IChannel,
  type IChannelFactory,
  type ISyncManager,
  type MailboxItem,
  type Remote,
  type RemoteCursor,
  type RemoteFilter,
  type RemoteOptions,
  type RemoteRecord,
  type RemoteStatus,
  type SyncEnvelope,
  type SyncEnvelopeType,
  type SyncOperationErrorType,
} from "./sync/index.js";

// Processors
export { ProcessorManager } from "./processors/index.js";
export type {
  IProcessor,
  IProcessorManager,
  ProcessorFactory,
  ProcessorFilter,
  ProcessorRecord,
} from "./processors/index.js";
