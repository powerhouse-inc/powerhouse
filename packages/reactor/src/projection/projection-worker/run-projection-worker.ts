import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import type { MessagePort } from "node:worker_threads";
import type { Database } from "../../core/types.js";
import { createForwardingLogger } from "../../executor/worker/forwarding-logger.js";
import type { DbConfig } from "../../executor/worker/protocol.js";
import { errorToInfo } from "../../executor/worker/sanitize.js";
import type {
  JobReadReadyEvent,
  JobWriteReadyEvent,
  ReadModelBatchCompletedEvent,
  ReadModelIndexedEvent,
} from "../../events/types.js";
import type {
  ProjectionInitMessage,
  ProjectionParentMessage,
  ProjectionWorkerMessage,
} from "../protocol.js";
import {
  buildProjectionStack,
  type ProjectionStack,
} from "./build-projection-stack.js";

/**
 * Closeable handle around the worker's Postgres pool. Decoupled from the
 * default factory so tests can swap in PGlite via `RunProjectionWorkerOverrides`.
 */
export type ProjectionWorkerDatabaseHandle = {
  kysely: Kysely<Database>;
  shutdown(): Promise<void>;
};

export type RunProjectionWorkerOverrides = {
  createDatabase?: (
    config: DbConfig,
    shardId: string,
  ) => Promise<ProjectionWorkerDatabaseHandle>;
  loadFactory?: Parameters<typeof buildProjectionStack>[0]["loadFactory"];
  beforeBuildStack?: (db: Kysely<Database>) => Promise<void>;
};

async function defaultCreateDatabase(
  config: DbConfig,
  shardId: string,
): Promise<ProjectionWorkerDatabaseHandle> {
  const { Kysely, PostgresDialect } = await import("kysely");
  const pgModule = await import("pg");
  const Pool = pgModule.default.Pool;
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.user,
    password: config.password,
    ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
    application_name: config.applicationName ?? shardId,
    max: config.poolSize,
    connectionTimeoutMillis: config.connectionTimeoutMillis,
    idleTimeoutMillis: config.idleTimeoutMillis,
  });
  const kysely = new Kysely<Database>({
    dialect: new PostgresDialect({ pool }),
  });
  return {
    kysely,
    async shutdown(): Promise<void> {
      try {
        await kysely.destroy();
      } catch {
        // best-effort
      }
      try {
        await pool.end();
      } catch {
        // best-effort
      }
    },
  };
}

/**
 * Drives the projection worker's message loop. Owns lifecycle of the
 * database handle and the projection stack. The default factory builds a
 * real Postgres pool; tests inject overrides for an in-process PGlite path.
 */
export function runProjectionWorker(
  parentPort: MessagePort,
  overrides: RunProjectionWorkerOverrides = {},
): void {
  let shardId = "";
  let initCompleted = false;
  let stack: ProjectionStack | null = null;
  let database: ProjectionWorkerDatabaseHandle | null = null;
  let depthTimer: NodeJS.Timeout | null = null;
  let lastReportedDepth = -1;

  function post(msg: ProjectionWorkerMessage): void {
    parentPort.postMessage(msg);
  }

  const logger = createForwardingLogger((msg) => post({ ...msg, shardId }));

  process.on("uncaughtException", (err: unknown) => {
    try {
      post({
        type: "log",
        shardId,
        level: "error",
        message: "projection worker uncaughtException",
        args: [errorToInfo(err)],
        timestamp: Date.now(),
      });
    } catch {
      // nothing left to do
    }
    throw err;
  });

  process.on("unhandledRejection", (reason: unknown) => {
    try {
      post({
        type: "log",
        shardId,
        level: "error",
        message: "projection worker unhandledRejection",
        args: [errorToInfo(reason)],
        timestamp: Date.now(),
      });
    } catch {
      // nothing left to do
    }
  });

  function startDepthReporter(intervalMs: number): void {
    if (intervalMs <= 0) {
      return;
    }
    depthTimer = setInterval(() => {
      if (!stack) {
        return;
      }
      const depth = stack.getChainDepth();
      if (depth === lastReportedDepth) {
        return;
      }
      lastReportedDepth = depth;
      post({
        type: "chain-depth",
        shardId,
        depth,
        timestamp: Date.now(),
      });
    }, intervalMs);
    depthTimer.unref();
  }

  function stopDepthReporter(): void {
    if (depthTimer) {
      clearInterval(depthTimer);
      depthTimer = null;
    }
  }

  async function handleInit(msg: ProjectionInitMessage): Promise<void> {
    shardId = msg.shardId;
    const createDb = overrides.createDatabase ?? defaultCreateDatabase;
    database = await createDb(msg.db, msg.shardId);
    if (overrides.beforeBuildStack) {
      await overrides.beforeBuildStack(database.kysely);
    }
    stack = await buildProjectionStack({
      init: msg,
      database: database.kysely,
      logger: new ConsoleLogger([`projection-shard:${msg.shardId}`]),
      loadFactory: overrides.loadFactory,
      events: {
        onReadReady: (event: JobReadReadyEvent) => {
          post({
            type: "read-ready",
            shardId,
            jobId: event.jobId,
            operations: event.operations,
          });
        },
        onReadModelIndexed: (event: ReadModelIndexedEvent) => {
          post({
            type: "readmodel-indexed",
            shardId,
            jobId: event.jobId,
            readModelName: event.readModelName,
            stage: event.stage,
            durationMs: event.durationMs,
            operationCount: event.operationCount,
            success: event.success,
          });
        },
        onBatchCompleted: (event: ReadModelBatchCompletedEvent) => {
          post({
            type: "readmodel-batch-completed",
            shardId,
            jobId: event.jobId,
            batchSize: event.batchSize,
            chainWaitDurationMs: event.chainWaitDurationMs,
            preReadyDurationMs: event.preReadyDurationMs,
            emitDurationMs: event.emitDurationMs,
            postReadyDurationMs: event.postReadyDurationMs,
          });
        },
      },
    });
    initCompleted = true;
    startDepthReporter(msg.chainDepthReportIntervalMs);
    logger.info("projection worker initialized: @shardId", msg.shardId);
    post({ type: "ready", correlationId: msg.correlationId, shardId });
  }

  async function handleWriteReady(
    msg: Extract<ProjectionParentMessage, { type: "write-ready" }>,
  ): Promise<void> {
    if (!stack) {
      logger.warn(
        "write-ready received before init on shard @shardId",
        shardId,
      );
      return;
    }
    const event: JobWriteReadyEvent = {
      jobId: msg.jobId,
      operations: msg.operations,
      jobMeta: msg.jobMeta,
      collectionMemberships: msg.collectionMemberships,
    };
    await stack.relayWriteReady(event);
  }

  async function handleDrain(correlationId: string): Promise<void> {
    if (stack) {
      await stack.drain();
    }
    post({ type: "drained", correlationId, shardId });
  }

  async function shutdownStack(): Promise<void> {
    stopDepthReporter();
    if (stack) {
      try {
        await stack.drain();
      } catch (error) {
        logger.warn(
          "projection worker drain failed during shutdown: @error",
          error,
        );
      }
      try {
        await stack.shutdown();
      } catch (error) {
        logger.warn("projection worker stack shutdown failed: @error", error);
      }
      stack = null;
    }
    if (database) {
      await database.shutdown();
      database = null;
    }
  }

  function handleParentMessage(msg: ProjectionParentMessage): void {
    switch (msg.type) {
      case "init": {
        handleInit(msg).catch((err: unknown) => {
          post({
            type: "log",
            shardId,
            level: "error",
            message: "projection worker init failed",
            args: [errorToInfo(err)],
            timestamp: Date.now(),
          });
        });
        break;
      }
      case "write-ready": {
        if (!initCompleted) {
          logger.warn(
            "write-ready received before init on shard @shardId",
            shardId,
          );
          break;
        }
        handleWriteReady(msg).catch((err: unknown) => {
          post({
            type: "log",
            shardId,
            level: "error",
            message: "projection worker write-ready failed",
            args: [errorToInfo(err)],
            timestamp: Date.now(),
          });
        });
        break;
      }
      case "drain": {
        handleDrain(msg.correlationId).catch((err: unknown) => {
          post({
            type: "log",
            shardId,
            level: "error",
            message: "projection worker drain failed",
            args: [errorToInfo(err)],
            timestamp: Date.now(),
          });
        });
        break;
      }
      case "shutdown": {
        logger.info("projection worker shutting down: @shardId", shardId);
        void shutdownStack().finally(() => {
          post({
            type: "log",
            shardId,
            level: "info",
            message: "projection worker shutdown",
            args: [],
            timestamp: Date.now(),
          });
          process.exit(0);
        });
        break;
      }
      default: {
        const exhaustive: never = msg;
        void exhaustive;
        break;
      }
    }
  }

  parentPort.on("message", handleParentMessage);

  const harness = {
    handleParentMessage,
    get initCompleted(): boolean {
      return initCompleted;
    },
    get shardId(): string {
      return shardId;
    },
  };
  (
    parentPort as unknown as { __reactorProjectionWorkerHarness?: unknown }
  ).__reactorProjectionWorkerHarness = harness;
}
