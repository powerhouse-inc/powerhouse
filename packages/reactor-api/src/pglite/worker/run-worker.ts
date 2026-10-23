import type { PGlite, PGliteOptions, Results } from "@electric-sql/pglite";
import type { MessagePort } from "node:worker_threads";
import { createDurableNodeFs, type NodeFsClass } from "../durable-node-fs.js";
import { PGLITE_UTC_PARSERS } from "../parsers.js";
import { toPGliteErrorInfo } from "./error-info.js";
import type {
  ExecRequest,
  HostMessage,
  InitRequest,
  LogLevel,
  PGliteParserPreset,
  PGliteWorkerStoreOptions,
  QueryRequest,
  WorkerMessage,
  WorkerResults,
} from "./protocol.js";

type PGliteModule = { PGlite: typeof PGlite };
type NodeFsModule = { NodeFS: NodeFsClass };

/** A wasm runtime abort, as opposed to a Postgres error (which carries a code). */
const ABORT_PATTERN = /PGlite aborted|Aborted\(/;

/**
 * Worker side of a threaded PGlite store: owns the PGlite instance (and its
 * DurableNodeFs and maintenance), and runs the host's requests one at a time
 * in arrival order, so a transaction opened by SQL holds the single
 * connection until it commits or rolls back.
 */
export function runPGliteWorker(port: MessagePort): void {
  let pg: PGlite | null = null;
  let initError: unknown = null;
  let closed = false;
  let abortReported = false;
  let tail: Promise<void> = Promise.resolve();

  function post(message: WorkerMessage): void {
    port.postMessage(message);
  }

  function log(level: LogLevel, message: string, error?: unknown): void {
    post({
      type: "log",
      level,
      message,
      error: error === undefined ? undefined : toPGliteErrorInfo(error),
    });
  }

  function reportAbort(reason: string): void {
    if (abortReported) {
      return;
    }
    abortReported = true;
    post({ type: "abort", reason });
  }

  function inTransaction(): boolean {
    if (pg === null || pg.closed) {
      return false;
    }
    try {
      return pg.isInTransaction();
    } catch {
      return false;
    }
  }

  function postError(id: number, error: unknown): void {
    const info = toPGliteErrorInfo(error);
    if (!("code" in info.fields) && ABORT_PATTERN.test(info.message)) {
      reportAbort(info.message);
    }
    post({ type: "error", id, error: info, inTransaction: inTransaction() });
  }

  function openStore(): PGlite {
    if (pg !== null && !closed) {
      return pg;
    }
    const reason = closed ? "the store is closed" : "the store did not open";
    throw new Error(`PGlite worker cannot run the request: ${reason}`, {
      cause: initError ?? undefined,
    });
  }

  async function handleInit(msg: InitRequest): Promise<void> {
    if (pg !== null) {
      postError(msg.id, new Error("PGlite worker is already initialised"));
      return;
    }
    let instance: PGlite;
    try {
      instance = await createPGlite(msg.store, {
        warn: (message) => log("warn", message),
        onAbort: (what) => reportAbort(`PGlite aborted: ${String(what)}`),
      });
    } catch (error) {
      initError = error;
      postError(msg.id, error);
      return;
    }
    try {
      await instance.waitReady;
    } catch (error) {
      initError = error;
      postError(msg.id, error);
      return;
    }
    pg = instance;
    post({ type: "ready", id: msg.id, inTransaction: inTransaction() });
  }

  async function handleQuery(msg: QueryRequest): Promise<void> {
    let result: Results;
    try {
      result = await openStore().query(msg.sql, msg.params, msg.options);
    } catch (error) {
      postError(msg.id, error);
      return;
    }
    post({
      type: "query-result",
      id: msg.id,
      result: toWorkerResults(result),
      inTransaction: inTransaction(),
    });
  }

  async function handleExec(msg: ExecRequest): Promise<void> {
    let results: Results[];
    try {
      results = await openStore().exec(msg.sql, msg.options);
    } catch (error) {
      postError(msg.id, error);
      return;
    }
    post({
      type: "exec-result",
      id: msg.id,
      results: results.map(toWorkerResults),
      inTransaction: inTransaction(),
    });
  }

  async function handleClose(id: number): Promise<void> {
    const instance = pg;
    closed = true;
    if (instance === null || instance.closed) {
      post({ type: "closed", id });
      return;
    }
    try {
      await instance.close();
    } catch (error) {
      postError(id, error);
      return;
    }
    post({ type: "closed", id });
  }

  function handle(msg: HostMessage): Promise<void> {
    switch (msg.type) {
      case "init":
        return handleInit(msg);
      case "query":
        return handleQuery(msg);
      case "exec":
        return handleExec(msg);
      case "close":
        return handleClose(msg.id);
      default: {
        const exhaustive: never = msg;
        void exhaustive;
        return Promise.resolve();
      }
    }
  }

  process.on("uncaughtException", (err: unknown) => {
    try {
      log("error", "PGlite worker uncaughtException", err);
    } catch {
      // nothing left to report to
    }
    throw err;
  });

  process.on("unhandledRejection", (reason: unknown) => {
    try {
      log("error", "PGlite worker unhandledRejection", reason);
    } catch {
      // nothing left to report to
    }
  });

  port.on("message", (msg: HostMessage) => {
    tail = tail.then(() => handle(msg));
  });
}

type CreateHooks = {
  warn: (message: string) => void;
  onAbort: (what: unknown) => void;
};

async function createPGlite(
  store: PGliteWorkerStoreOptions,
  hooks: CreateHooks,
): Promise<PGlite> {
  const { PGlite: PGliteClass } = (await import(
    store.module.pglite
  )) as PGliteModule;
  const options: PGliteOptions = { parsers: parsersFor(store.parsers) };
  if (store.dataDir === null) {
    return new PGliteClass(options);
  }
  const { NodeFS } = (await import(store.module.nodefs)) as NodeFsModule;
  const durable = store.durableFs;
  const fs =
    durable === null
      ? new NodeFS(store.dataDir)
      : createDurableNodeFs(NodeFS, store.dataDir, {
          fsync: durable.fsync,
          maintenanceIntervalMs: durable.maintenanceIntervalMs,
          vacuumFullAboveBytes: durable.vacuumFullAboveBytes,
          logger: { warn: hooks.warn },
          onAbort: hooks.onAbort,
        });
  return new PGliteClass({ ...options, fs });
}

function parsersFor(preset: PGliteParserPreset): PGliteOptions["parsers"] {
  switch (preset) {
    case "utc-timestamps":
      return { ...PGLITE_UTC_PARSERS };
    case "none":
      return {};
    default: {
      const exhaustive: never = preset;
      throw new Error(`Unknown PGlite parser preset: ${String(exhaustive)}`);
    }
  }
}

function toWorkerResults(result: Results): WorkerResults {
  return {
    rows: result.rows,
    affectedRows: result.affectedRows,
    fields: result.fields.map((field) => ({
      name: field.name,
      dataTypeID: field.dataTypeID,
    })),
  };
}
