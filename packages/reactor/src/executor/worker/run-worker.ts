import type { DocumentModelModule } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import type { Kysely } from "kysely";
import type { MessagePort } from "node:worker_threads";
import type { Database } from "../../core/types.js";
import type { Job } from "../../queue/types.js";
import {
  buildWorkerExecutor,
  defaultLoadFactory,
  type BuildWorkerExecutorOptions,
  type WorkerExecutorStack,
} from "./build-worker-executor.js";
import { createForwardingLogger } from "./forwarding-logger.js";
import type {
  DbConfig,
  FactorySpec,
  InitMessage,
  LoadModelMessage,
  ParentMessage,
  WorkerMessage,
} from "./protocol.js";
import { errorToInfo } from "./sanitize.js";

/**
 * Closeable handle around the parent's Postgres pool the worker owns.
 * Decoupled so tests can substitute a PGlite-backed Kysely.
 */
export type WorkerDatabaseHandle = {
  kysely: Kysely<Database>;
  shutdown(): Promise<void>;
};

export type RunWorkerOverrides = {
  /**
   * Builds the worker's Kysely instance from the init's DbConfig. Defaults
   * to a real Postgres pool. Tests typically swap this for PGlite.
   */
  createDatabase?: (
    config: DbConfig,
    workerId: string,
  ) => Promise<WorkerDatabaseHandle>;
  /**
   * Overrides the dynamic-import factory loader used for the signature
   * verifier and document model manifest. Tests usually inject this so
   * they don't need real packages.
   */
  loadFactory?: BuildWorkerExecutorOptions["loadFactory"];
  /**
   * Called after the database is created but before the executor stack
   * is built. Lets tests run reactor migrations against PGlite, since
   * the production parent runs them once against shared Postgres.
   */
  beforeBuildExecutor?: (db: Kysely<Database>) => Promise<void>;
};

async function defaultCreateDatabase(
  config: DbConfig,
  workerId: string,
): Promise<WorkerDatabaseHandle> {
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
    application_name: config.applicationName ?? workerId,
    max: config.poolSize,
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
 * Drives the worker's message loop. Owns lifecycle of the database handle
 * and executor stack. The default factories build a real Postgres pool and
 * use dynamic `import()` for model/verifier specs; tests inject overrides
 * for an in-process PGlite path.
 */
export function runWorker(
  parentPort: MessagePort,
  overrides: RunWorkerOverrides = {},
): void {
  let workerId = "";
  let initCompleted = false;
  let initConfig: InitMessage | null = null;
  let executorStack: WorkerExecutorStack | null = null;
  let database: WorkerDatabaseHandle | null = null;
  const activeLoadFactory: NonNullable<
    BuildWorkerExecutorOptions["loadFactory"]
  > = overrides.loadFactory ?? defaultLoadFactory;

  function post(msg: WorkerMessage): void {
    parentPort.postMessage(msg);
  }

  const logger = createForwardingLogger(post);

  process.on("uncaughtException", (err: unknown) => {
    try {
      post({
        type: "log",
        level: "error",
        message: "worker uncaughtException",
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
        level: "error",
        message: "worker unhandledRejection",
        args: [errorToInfo(reason)],
        timestamp: Date.now(),
      });
    } catch {
      // nothing left to do
    }
  });

  async function handleInit(msg: InitMessage): Promise<void> {
    workerId = msg.workerId;
    initConfig = msg;
    const createDb = overrides.createDatabase ?? defaultCreateDatabase;
    database = await createDb(msg.db, msg.workerId);
    if (overrides.beforeBuildExecutor) {
      await overrides.beforeBuildExecutor(database.kysely);
    }
    executorStack = await buildWorkerExecutor({
      init: msg,
      database: database.kysely,
      logger: new ConsoleLogger([`reactor-worker:${msg.workerId}`]),
      loadFactory: activeLoadFactory,
    });
    initCompleted = true;
    logger.info("worker initialized: @workerId", msg.workerId);
    post({
      type: "ready",
      correlationId: msg.correlationId,
      workerId: msg.workerId,
    });
  }

  async function handleExecute(correlationId: string, job: Job): Promise<void> {
    if (!executorStack) {
      post({
        type: "result",
        correlationId,
        result: { job, success: false },
        error: errorToInfo(new Error("execute received before init")),
      });
      return;
    }
    try {
      const result = await executorStack.executor.executeJob(job);
      const writeReady = executorStack.takeLastWriteReady();
      post({
        type: "result",
        correlationId,
        result,
        writeReady: writeReady ?? undefined,
      });
    } catch (error) {
      post({
        type: "result",
        correlationId,
        result: { job, success: false },
        error: errorToInfo(error),
      });
    }
  }

  async function handleLoadModel(msg: LoadModelMessage): Promise<void> {
    const stack = executorStack;
    if (!stack) {
      post({
        type: "model-load-failed",
        correlationId: msg.correlationId,
        documentType: msg.model.documentType,
        version: msg.model.version,
        error: errorToInfo(new Error("load-model received before init")),
      });
      return;
    }
    let module: DocumentModelModule;
    try {
      module = (await activeLoadFactory(msg.model.spec)) as DocumentModelModule;
    } catch (error) {
      post({
        type: "model-load-failed",
        correlationId: msg.correlationId,
        documentType: msg.model.documentType,
        version: msg.model.version,
        error: errorToInfo(error),
      });
      return;
    }
    const [result] = stack.registry.registerModules(module);
    if (result.status === "error") {
      post({
        type: "model-load-failed",
        correlationId: msg.correlationId,
        documentType: msg.model.documentType,
        version: msg.model.version,
        error: errorToInfo(result.error),
      });
      return;
    }
    post({
      type: "model-loaded",
      correlationId: msg.correlationId,
      documentType: msg.model.documentType,
      version: msg.model.version,
    });
  }

  async function shutdownDatabase(): Promise<void> {
    if (database) {
      await database.shutdown();
    }
  }

  function handleParentMessage(msg: ParentMessage): void {
    switch (msg.type) {
      case "init": {
        handleInit(msg).catch((err: unknown) => {
          post({
            type: "log",
            level: "error",
            message: "worker init failed",
            args: [errorToInfo(err)],
            timestamp: Date.now(),
          });
        });
        break;
      }

      case "execute": {
        if (!initCompleted) {
          logger.warn("received execute before init");
          post({
            type: "result",
            correlationId: msg.correlationId,
            result: { job: msg.job, success: false },
            error: errorToInfo(new Error("execute received before init")),
          });
          break;
        }
        handleExecute(msg.correlationId, msg.job).catch((err: unknown) => {
          post({
            type: "result",
            correlationId: msg.correlationId,
            result: { job: msg.job, success: false },
            error: errorToInfo(err),
          });
        });
        break;
      }

      case "shutdown": {
        logger.info("worker shutting down: @workerId", workerId);
        void shutdownDatabase().finally(() => {
          post({
            type: "log",
            level: "info",
            message: "worker shutdown",
            args: [],
            timestamp: Date.now(),
          });
          process.exit(0);
        });
        break;
      }

      case "abort": {
        logger.warn(
          "abort received (no-op stub): @correlationId",
          msg.correlationId,
        );
        break;
      }

      case "load-model": {
        handleLoadModel(msg).catch((err: unknown) => {
          post({
            type: "model-load-failed",
            correlationId: msg.correlationId,
            documentType: msg.model.documentType,
            version: msg.model.version,
            error: errorToInfo(err),
          });
        });
        break;
      }

      default: {
        const raw = msg as Record<string, unknown>;
        if (raw["type"] === "__test_throw") {
          const rawReason = raw["reason"];
          const reason =
            typeof rawReason === "string"
              ? rawReason
              : "synthetic uncaughtException";
          setTimeout(() => {
            throw new Error(reason);
          }, 0);
          return;
        }
        const _exhaustive: never = msg;
        void _exhaustive;
        break;
      }
    }
  }

  parentPort.on("message", handleParentMessage);

  // Test-only exports surfaced on a side-channel for unit tests that drive
  // the message loop directly without a real worker_threads parent.
  const harness = {
    handleParentMessage,
    get initCompleted(): boolean {
      return initCompleted;
    },
    get initConfig(): InitMessage | null {
      return initConfig;
    },
    get workerId(): string {
      return workerId;
    },
  };
  (
    parentPort as unknown as { __reactorWorkerHarness?: unknown }
  ).__reactorWorkerHarness = harness;
}

export type FactorySpecForTesting = FactorySpec;
