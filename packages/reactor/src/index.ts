// Reactor Interface and Implementation
export { ReactorClient } from "./client/reactor-client.js";
export { ReactorClientBuilder } from "./builder.js";
export { type IReactorClient } from "./client/types.js";
export { Reactor } from "./reactor.js";
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
export { type IReactor } from "./types.js";

// Subscription Manager
export { ReactorSubscriptionManager } from "./subs/react-subscription-manager.js";
export { type IReactorSubscriptionManager } from "./subs/types.js";

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
