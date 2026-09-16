// The pieces layer, for suites that exercise a piece without a reactor: the
// loader, the worker pool and the executor, plus the stand-ins they need.
export {
  buildDescriptor,
  type PieceDescriptor,
} from "./pieces/activepieces/descriptor.js";
export {
  ensurePieceBundle,
  fetchPieceBundle,
} from "./pieces/activepieces/fetch.js";
export { loadPieceFromDir } from "./pieces/activepieces/loader.js";
export {
  localFirstResolver,
  type LocalPiece,
  type PackagePiece,
  type PieceResolver,
} from "./pieces/activepieces/resolver.js";
export {
  extractDedupeKey,
  type RecordedSchedule,
} from "./pieces/activepieces/context/trigger.js";
export {
  PieceWorker,
  type IPieceWorker,
} from "./pieces/activepieces/worker/host.js";
export { PieceWorkerPool } from "./pieces/activepieces/worker/pool.js";
export {
  ActivepiecesBlockExecutor,
  CompositeBlockExecutor,
  type AttachmentPort,
  type ReactorPort,
} from "./pieces/engine/blocks.js";
export { StaticConnectionResolver } from "./pieces/engine/connections.js";
export { runWorkflow } from "./pieces/engine/coordinator.js";
export { InMemorySecretProvider } from "./pieces/engine/secrets.js";
export type {
  BlockExecution,
  WorkflowRunResult,
} from "./pieces/engine/types.js";
export { PieceRegistry } from "./reactor/piece-registry.js";
