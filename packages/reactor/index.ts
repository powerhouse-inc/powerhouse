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
export {
  ReactorClient,
  type ActionEvaluationConfig,
} from "./src/client/reactor-client.js";
export {
  DocumentChangeType,
  type ActionCandidate,
  type ActionEvaluations,
  type CreateDocumentOptions,
  type DocumentChangeEvent,
  type IDriveClient,
  type IReactorClient,
  type ProtocolSelection,
  type UpgradeDocumentOptions,
} from "./src/client/types.js";
export {
  ReactorBuilder,
  type DocumentModelSource,
  type FileModelSource,
  type PackageModelSource,
  type ProjectionShardBuilderConfig,
  type ReadModelCoordinatorFactory,
  type ReadModelCoordinatorFactoryDeps,
  type ReadModelFactory,
  type ReadModelFactoryDeps,
  type WorkerPoolOptions,
} from "./src/core/reactor-builder.js";
export type {
  BuiltInReadModelKind,
  IProjectionTransport,
  ProjectionShardHooks,
  ProjectionShardManagerConfig,
  ProjectionWorkerFactory,
} from "./src/projection/index.js";
// Leaf modules, not the projection barrel: the barrel pulls in worker_threads.
export {
  createHybridProjectionCoordinatorFactory,
  type HybridProjectionOptions,
} from "./src/projection/create-hybrid-projection-coordinator.js";
export {
  HybridProjectionCoordinator,
  type HybridProjectionCoordinatorOptions,
} from "./src/projection/hybrid-projection-coordinator.js";
export { ReactorClientBuilder } from "./src/core/reactor-client-builder.js";
export { DEFAULT_DRIVE_CONTAINER_TYPES } from "./src/core/drive-container-types.js";
export { Reactor } from "./src/core/reactor.js";
export {
  type BatchExecutionRequest,
  type BatchExecutionResult,
  type BatchLoadRequest,
  type BatchLoadResult,
  type DegradedComponent,
  type ExecutionJobPlan,
  type InProcessReactorClientModule,
  type InProcessReactorModule,
  type InProcessSyncModule,
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
export {
  AuthEnforcementDisabledError,
  InvalidSignatureError,
  RelationshipNotFoundError,
  UnsupportedStoredProtocolError,
} from "./src/shared/errors.js";
export type { UnsupportedStoredDocuments } from "./src/core/stored-protocol-check.js";
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
  type JobResultSummary,
  type PagedResults,
  type PagingOptions,
  type SearchFilter,
  type ShutdownStatus,
  type SubmittedActionResult,
  type ViewFilter,
} from "./src/shared/types.js";
export {
  SIGNATURE_REFUSAL_CODES,
  type AdmissionPath,
  type SignatureRefusalCode,
  type SignatureScheme,
  type SignatureVerificationHandler,
  type SignatureTrustPolicy,
  type SignatureVerificationMode,
  type SignerConfig,
} from "./src/signer/types.js";
export {
  verifyActionSignature,
  type VerificationTarget,
} from "./src/signer/verify-action-signature.js";

// Subscription Manager
export { DefaultSubscriptionErrorHandler } from "./src/subs/default-error-handler.js";
export { ReactorSubscriptionManager } from "./src/subs/react-subscription-manager.js";
export {
  type DocumentDeletedInfo,
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
  type ModelLoadedEvent,
  type JobPendingEvent,
  type JobReadReadyEvent,
  type JobRunningEvent,
  type JobWriteReadyEvent,
  type JobFailedEvent as ReactorJobFailedEvent,
  type ReadModelBatchCompletedEvent,
  type ReadModelIndexedEvent,
  type CatchUpSweptEvent,
  type PurgeMarkerContext,
  type ReadModelStage,
  type ReadModelIndexingStage,
  type SignatureRefusedEvent,
  type StorageSessionRecreatedEvent,
  type Unsubscribe,
} from "./src/events/types.js";

// Queue
export { type IQueue } from "./src/queue/interfaces.js";
export { InMemoryQueue } from "./src/queue/queue.js";
export {
  QueueEventTypes,
  RetryAccounting,
  type Job,
  type JobAvailableEvent,
  type JobKind,
  type PurgeJobOptions,
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
  type ReactorFeatureFlags,
} from "./src/executor/types.js";

export {
  bucketFor,
  hashDocumentId,
} from "./src/executor/worker-pool-router.js";

// Executor Worker Utilities
export {
  createForwardingLogger,
  errorToInfo,
  loadDocumentModelSpec,
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
  ModelNotWorkerImportableError,
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
  APPEND_CONDITION_FAILED_PREFIX,
  AppendConditionFailedError,
  DocumentAlreadyExistsError,
  DocumentExistence,
  DuplicateOperationError,
  OptimisticLockError,
  RevisionMismatchError,
  type AppendCondition,
  type AppendConditionStream,
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

// Decision Models
export { buildDecisionModel } from "./src/decision/build-decision-model.js";
export type {
  BuiltDecisionModel,
  DecisionContext,
  DecisionModel,
  DecisionTarget,
  Evaluation,
  IStreamStateReader,
  Projection,
  StreamQuery,
} from "./src/decision/types.js";
export {
  authDecisionModel,
  type AuthDecisionModel,
} from "./src/decision/auth-decision-model.js";
export {
  documentDecisionModel,
  type DocumentDecisionModel,
} from "./src/decision/document-decision-model.js";
export {
  decideAtHead,
  selectDecisionModel,
  type AdmissionDecision,
  type RegisteredDecisionModel,
} from "./src/decision/registered-model.js";
export {
  ALWAYS_READABLE_SCOPES,
  BareReadGate,
  ModelReadGate,
  readDecisionModel,
  SeededStateReader,
  type IReadGate,
  type ReadGateOptions,
  type SubjectScopePredicate,
} from "./src/decision/read-gate.js";
export { SyncScopeGate } from "./src/decision/sync-scope-gate.js";
export {
  firstOutOfOrderPair,
  type OutOfOrderPair,
} from "./src/decision/stream-order.js";
export { KyselyDocumentIndexer } from "./src/storage/kysely/document-indexer.js";
export { KyselyKeyframeStore } from "./src/storage/kysely/keyframe-store.js";
export {
  DEFAULT_ACQUIRE_TIMEOUT_MS,
  DEFAULT_LONG_STATEMENT_TIMEOUT_MS,
  DEFAULT_RECOVERY_TIMEOUT_MS,
  DEFAULT_STATEMENT_TIMEOUT_MS,
  HardenedPGliteDialect,
  isLongRunningStatement,
  PGliteAbortedTransactionError,
  PGliteAcquireTimeoutError,
  PGliteSessionError,
  PGliteSessionPoisonedError,
  PGliteStatementTimeoutError,
  queryThroughDialect,
  type HardenedPGliteDialectOptions,
  type PGliteSession,
} from "./src/storage/kysely/pglite-dialect.js";
export {
  DEFAULT_CLOSE_TIMEOUT_MS,
  DEFAULT_FLUSH_QUIESCE_TIMEOUT_MS,
  DEFAULT_FLUSH_SYNC_TIMEOUT_MS,
  PGliteEpochSupersededError,
  PGliteFlushQuiesceTimeoutError,
  PGliteFlushSyncTimeoutError,
  SelfHealingPGliteClient,
  type RecreatablePGliteInstance,
  type SelfHealingPGliteClientOptions,
} from "./src/storage/kysely/self-healing-pglite-client.js";
export {
  NoopStorageFlusher,
  StorageEpochSupersededError,
  type IStorageFlusher,
} from "./src/storage/storage-flush.js";
export { FlushGuardedSyncCursorStorage } from "./src/storage/flush-guarded-sync-cursor-storage.js";
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
export {
  BaseReadModel,
  DEFAULT_COMMIT_CHUNK_SIZE,
  DEFAULT_READ_MODEL_YIELD_DEADLINE_MS,
  defaultReadModelIndexingConfig,
  unchunkedReadModelIndexingConfig,
  type BaseReadModelConfig,
  type PurgeFence,
  type ReadModelIndexingConfig,
} from "./src/read-models/base-read-model.js";
export { ReadModelCoordinator } from "./src/read-models/coordinator.js";
export {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "./src/read-models/document-view.js";
export {
  supportsLiveReadModelRegistration,
  type ILiveReadModelCoordinator,
  type IReadModel,
  type IReadModelCoordinator,
  type ReadModelRegistrationStage,
} from "./src/read-models/interfaces.js";
export type {
  DocumentViewDatabase,
  InsertableDocumentSnapshot,
} from "./src/read-models/types.js";
export {
  DOCUMENT_INDEXER_READ_MODEL,
  DOCUMENT_VIEW_READ_MODEL,
  type ReactorReadModels,
} from "./src/read-models/names.js";

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
  fencesOnStorageEpoch,
  KyselySyncCursorStorage,
  KyselySyncHoldStorage,
  KyselySyncPurgeRefusalStorage,
  KyselySyncReceivedMarkerStorage,
  KyselySyncRemoteStorage,
  type DeadLetterRecord,
  type ISyncCursorEpochFence,
  type ISyncCursorStorage,
  type ISyncDeadLetterStorage,
  type ISyncHoldStorage,
  type ISyncPurgeRefusalStorage,
  type ISyncReceivedMarkerStorage,
  type ISyncRemoteStorage,
  type PurgeRefusalRecord,
  type ReceivedMarkerRecord,
  type SyncHoldRecord,
} from "./src/storage/index.js";
export {
  batchOperationsByDocument,
  channelFactoryTypes,
  ChannelError,
  ChannelErrorSource,
  ChannelScheme,
  CompositeChannelFactory,
  consolidateSyncOperations,
  deriveConnectionHealth,
  envelopesToSyncOperations,
  GqlRequestChannel,
  GqlRequestChannelFactory,
  GqlResponseChannel,
  GqlResponseChannelFactory,
  GQL_CHANNEL_TYPE,
  IntervalPollTimer,
  LocalChannel,
  LocalChannelFactory,
  LOCAL_CHANNEL_TYPE,
  POLLING_CHANNEL_TYPE,
  messagePortTransport,
  isLocalWireMessage,
  type LocalAckMessage,
  type LocalChannelPort,
  type LocalChannelTransportProvider,
  type LocalHelloMessage,
  type LocalPushMessage,
  type LocalResendMessage,
  type LocalWireKind,
  type LocalWireMessage,
  type MessagePortLike,
  DRIVE_AUTH_ERROR_MESSAGES,
  DriveRequestError,
  isDriveAuthError,
  isRecoverableGraphQLError,
  RECOVERABLE_GRAPHQL_ERROR_CODES,
  Mailbox,
  PollBehavior,
  PollingChannelError,
  RemotePersistence,
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
  type DegradedRemote,
  type GqlChannelConfig,
  type IChannel,
  type IChannelFactory,
  type IMailbox,
  type IPollTimer,
  type ISyncManager,
  type ISyncStatusTracker,
  type JwtHandler,
  type OperationBatch,
  type PollDelegate,
  type Remote,
  type RemoteCursor,
  type RemoteMeta,
  classifyJobFailure,
  quarantinesDocument,
  syncOperationErrorType,
  type RemoteFilter,
  type LocalPeer,
  type RemoteOptions,
  type RemotePeer,
  type RemoteRecord,
  type RemoteStatus,
  type SyncEnvelope,
  type SyncHeldEvent,
  type SyncHold,
  type SyncPurgeRefusedEvent,
  type SyncReleasedEvent,
  type PurgeLookup,
  type DeliveryLookup,
  type DeliveryMembership,
  type DeliveryRow,
  type IDeliveryTracking,
  type PendingDelivery,
  supportsDeliveryTracking,
  supportsPurgeRefusals,
  type IPurgeRefusalRecorder,
  MAX_POLLED_REFUSALS,
  type PolledMarkerRefusal,
  InMemorySyncPurgeRefusalStorage,
  type IPeerAgreement,
  type PeerAgreementBasis,
  createPeerAgreement,
  InMemorySyncHoldStorage,
  InMemorySyncReceivedMarkerStorage,
  type SyncEnvelopeType,
  type SyncFailedEvent,
  type SyncOperationErrorType,
  type SyncPendingEvent,
  type SyncStatusChangeCallback,
  type SyncSucceededEvent,
  type DeadLetterPage,
  type InspectableSyncManager,
  type ISyncInspector,
  type MailboxDepths,
  type RemoteConnectionHealth,
  type RemoteCursorInfo,
  type RemoteSyncInspection,
} from "./src/sync/index.js";

// Processors
export {
  createRelationalDb,
  RelationalDbProcessor,
} from "@powerhousedao/shared/processors";
export type {
  IProcessor,
  IProcessorHostModuleBase,
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
export {
  createReactorHostModuleBase,
  type IReactorProcessorHostModuleBase,
  type ReactorHostModuleBaseOptions,
} from "./src/processors/host-module.js";
export { DocumentIntegrityService } from "./src/admin/document-integrity-service.js";
export type {
  IDocumentIntegrityService,
  KeyframeValidationIssue,
  RebuildResult,
  SnapshotValidationIssue,
  StreamOrderIssue,
  ValidationResult,
} from "./src/admin/types.js";
export { ProcessorManager } from "./src/processors/index.js";
export * from "./src/catch-up/index.js";

// Inspection
export {
  createReactorInspector,
  INSPECTION_ORDINAL_FIELDS,
  INSPECTION_WIRE_FIELDS,
  reactorInspectorComponents,
  ReactorInspector,
  StorageHealthTracker,
  type IInspectableAttachmentStore,
  type IInspectableQueue,
  type IInspector,
  type InspectorAttachmentInfo,
  type InspectorDocumentModelInfo,
  type InspectorDriveInfo,
  type InspectorDriveIntegrity,
  type InspectorDriveIntegrityRef,
  type InspectorDrivePage,
  type InspectorProcessorInfo,
  type IReactorDbQuery,
  type IStorageHealthProvider,
  type QueueStateSnapshot,
  type ReactorInspectorComponents,
  type StorageHealth,
  type WireChannelConfig,
  type WireDeadLetterPage,
  type WireInspectorAttachmentInfo,
  type WireInspectorDocumentModel,
  type WireInspectorDrive,
  type WireInspectorDriveIntegrity,
  type WireInspectorDriveIntegrityRef,
  type WireInspectorDrivePage,
  type WireInspectorProcessor,
  type WireMailboxDepths,
  type WireQueueState,
  type WireReactorInspectionInfo,
  type WireRemoteConnectionHealth,
  type WireRemoteCursor,
  type WireRemoteMeta,
  type WireRemoteSyncInspection,
  type WireStorageHealth,
} from "./src/inspector/index.js";

// Document erasure
export {
  isPurgeMarker,
  PURGE_DOCUMENT,
  type PurgeDocumentAction,
  type PurgeDocumentActionInput,
  type PurgeMarkerOperation,
} from "@powerhousedao/shared/document-model";
export {
  DocumentNotDeletedError,
  DocumentPurgedError,
  GroupInUseError,
  PurgeTooLargeError,
  ReservedActionError,
} from "./src/shared/errors.js";
export {
  acquirePurgeLocks,
  findPurged,
  listPurged,
  PURGE_LOCK_BUCKETS,
  PURGE_NS,
  type PurgeLockMode,
} from "./src/storage/kysely/document-purges.js";
export type {
  DocumentPurgeRow,
  PurgeRemovedRows,
} from "./src/storage/kysely/types.js";
export {
  appliedDelete,
  DEFAULT_PURGE_DELETE_BATCH,
  KyselyDocumentPurger,
  type CollectionMember,
  type PurgeStream,
} from "./src/storage/kysely/document-purger.js";
export {
  DEFAULT_MAX_PURGE_OPERATIONS,
  DocumentPurgeService,
  type EnqueuePurgeOptions,
} from "./src/admin/document-purge-service.js";
