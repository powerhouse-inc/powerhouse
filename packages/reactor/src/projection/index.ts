export {
  ProjectionShardManager,
  type ProjectionShardManagerConfig,
  type ProjectionWorkerFactory,
} from "./projection-shard-manager.js";
export {
  createProjectionThreadTransport,
  type IProjectionTransport,
  type ProjectionTransportEvent,
  type ProjectionTransportEventMap,
  type ProjectionTransportListener,
} from "./transport.js";
export type {
  BuiltInReadModelKind,
  ChainDepthReport,
  ProjectionBatchCompletedMessage,
  ProjectionChainDepthMessage,
  ProjectionDrainedMessage,
  ProjectionDrainMessage,
  ProjectionInitMessage,
  ProjectionLogMessage,
  ProjectionParentMessage,
  ProjectionReadModelIndexedMessage,
  ProjectionReadReadyMessage,
  ProjectionReadyMessage,
  ProjectionShutdownMessage,
  ProjectionStage,
  ProjectionWorkerMessage,
  ProjectionWriteReadyMessage,
} from "./protocol.js";
export { projectionWorkerEntryPath } from "./projection-worker/index.js";
