// Reactor Interface and Implementation
export { ReactorClient } from "./client/reactor-client.js";
export { type IReactorClient } from "./client/types.js";
export { ReactorClientBuilder } from "./core/builder.js";
export { Reactor } from "./core/reactor.js";
export { type IReactor } from "./core/types.js";
export { JobAwaiter, type IJobAwaiter } from "./shared/awaiter.js";
export { createMutableShutdownStatus } from "./shared/factories.js";
export {
  JobStatus,
  PropagationMode,
  RelationshipChangeType,
  type JobInfo,
  type PagedResults,
  type PagingOptions,
  type SearchFilter,
  type ShutdownStatus,
  type ViewFilter,
} from "./shared/types.js";

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
export { type IJobTracker } from "./job-tracker/interfaces.js";
export { InMemoryJobTracker } from "./job-tracker/in-memory-job-tracker.js";

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
export {
  DuplicateOperationError,
  OptimisticLockError,
  RevisionMismatchError,
  type AtomicTxn,
  type DocumentRevisions,
  type DocumentSnapshot,
  type IDocumentView,
  type IOperationStore,
  type OperationContext,
  type OperationWithContext,
} from "./storage/interfaces.js";
export { KyselyOperationStore } from "./storage/kysely/store.js";
export type { Database, OperationTable } from "./storage/kysely/types.js";

// Read Models
export {
  type IReadModel,
  type IReadModelCoordinator,
} from "./read-models/interfaces.js";
export { ReadModelCoordinator } from "./read-models/coordinator.js";
export { KyselyDocumentView } from "./read-models/document-view.js";
export type {
  DocumentViewDatabase,
  InsertableDocumentSnapshot,
} from "./read-models/types.js";
