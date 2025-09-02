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
  type IJobExecutor,
  type IJobExecutorManager,
} from "./executor/interfaces.js";
export {
  SimpleJobExecutorManager,
  type JobExecutorFactory,
} from "./executor/simple-job-executor-manager.js";
export { SimpleJobExecutor } from "./executor/simple-job-executor.js";
export { type JobExecutorConfig, type JobResult } from "./executor/types.js";

// Backwards compatibility exports (deprecated)
export {
  InMemoryJobExecutor,
  JobExecutorEventTypes,
  type ExecutorStartedEvent,
  type ExecutorStoppedEvent,
  type JobCompletedEvent,
  type JobFailedEvent,
  type JobStartedEvent,
} from "./executor/in-memory-job-executor-shim.js";

// Document Model Registry
export {
  DocumentModelRegistry,
  DuplicateModuleError,
  InvalidModuleError,
  ModuleNotFoundError,
  type IDocumentModelRegistry,
} from "./registry/index.js";
