// Reactor Interface and Implementation
export { type IReactor } from "./interfaces/reactor.js";
export { Reactor } from "./reactor.js";
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

// Event Bus
export { EventBus } from "./events/event-bus.js";
export { type IEventBus } from "./events/interfaces.js";
export { EventBusAggregateError, type Unsubscribe } from "./events/types.js";

// Queue
export { type IQueue } from "./queue/interfaces.js";
export { InMemoryQueue } from "./queue/queue.js";
export {
  QueueEventTypes,
  type Job,
  type JobAvailableEvent,
} from "./queue/types.js";

// Job Executor
export {
  InMemoryJobExecutor,
  JobExecutorEventTypes,
  type ExecutorStartedEvent,
  type ExecutorStoppedEvent,
  type IJobExecutor,
  type JobCompletedEvent,
  type JobExecutorConfig,
  type JobFailedEvent,
  type JobResult,
  type JobStartedEvent,
} from "./executor/job-executor.js";
export { JobExecutorManager, type JobExecutorFactory } from "./executor/job-executor-manager.js";
export { type IJobExecutorManager } from "./executor/interfaces.js";

// Document Model Registry
export {
  DocumentModelRegistry,
  ModuleNotFoundError,
  DuplicateModuleError,
  InvalidModuleError,
  type IDocumentModelRegistry,
} from "./registry/index.js";
