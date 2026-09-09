import type {
  ReadModelCoordinatorFactory,
  ReadModelCoordinatorFactoryDeps,
} from "../core/reactor-builder.js";
import { HybridProjectionCoordinator } from "./hybrid-projection-coordinator.js";
import type { DbConfig } from "./protocol.js";

export type HybridProjectionOptions = {
  /** Defaults to 1: one worker captures the whole win (Run 11). */
  shardCount?: number;
  poolSize?: number;
  db?: DbConfig;
  onFatal?: (shardId: string, reason: Error) => void;
  initTimeoutMs?: number;
  shutdownGraceMs?: number;
  drainTimeoutMs?: number;
  chainDepthReportIntervalMs?: number;
};

type CoordinatorRef = { current: HybridProjectionCoordinator | undefined };

/** Built-ins in one projection worker; all other read models stay on the host. */
export function createHybridProjectionCoordinatorFactory(
  options: HybridProjectionOptions = {},
): ReadModelCoordinatorFactory {
  return async (deps: ReadModelCoordinatorFactoryDeps) => {
    // Set before start(): onReadReady cannot fire until a write-ready is routed.
    const ref: CoordinatorRef = { current: undefined };
    const manager = await deps.createProjectionShardManager({
      shardCount: options.shardCount ?? 1,
      preReadyKinds: ["document-view", "document-indexer"],
      postReadyKinds: [],
      db: options.db,
      poolSize: options.poolSize,
      initTimeoutMs: options.initTimeoutMs,
      shutdownGraceMs: options.shutdownGraceMs,
      drainTimeoutMs: options.drainTimeoutMs,
      chainDepthReportIntervalMs: options.chainDepthReportIntervalMs,
      onReadReady: (event) => ref.current!.acceptReadReady(event),
      onShardFatal: options.onFatal,
    });
    const coordinator = new HybridProjectionCoordinator({
      eventBus: deps.eventBus,
      logger: deps.logger,
      manager,
      preReady: deps.readModels,
      postReady: [
        deps.subscriptionNotificationReadModel,
        deps.processorManager,
      ],
      lookupOnly: [deps.documentView, deps.documentIndexer],
    });
    ref.current = coordinator;
    deps.registerShutdownHook(() => coordinator.shutdown());
    return coordinator;
  };
}
