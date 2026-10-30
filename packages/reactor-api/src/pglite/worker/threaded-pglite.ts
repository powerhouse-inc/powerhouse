import type { QueryOptions, Results } from "@electric-sql/pglite";
import {
  registerTelemetryWorker,
  type IStoreMaintenance,
  type TableRewriteRequest,
  type TableRewriteResult,
  type WorkerMemorySample,
} from "@powerhousedao/reactor";
import { childLogger, type ILogger } from "document-model";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { Worker, type ResourceLimits } from "node:worker_threads";
import type { PGliteLike } from "../pglite-like.js";
import { disableWasmWrapperTiering } from "../wasm-wrapper-tiering.js";
import { fromPGliteErrorInfo } from "./error-info.js";
import {
  PGliteWorkerClosedError,
  PGliteWorkerExitedError,
  PGliteWorkerInitError,
} from "./errors.js";
import type {
  HostMessage,
  LogMessage,
  PGliteWorkerStoreOptions,
  WorkerMessage,
  WorkerQueryOptions,
  WorkerResults,
} from "./protocol.js";

export const DEFAULT_PGLITE_WORKER_MEMORY_MB = 1024;
export const DEFAULT_PGLITE_WORKER_CLOSE_GRACE_MS = 60_000;

export type ThreadedPGliteOptions = {
  store: PGliteWorkerStoreOptions;
  /** Caps the worker's JS heap; defaults to {@link resolvePgliteWorkerMemoryMb}. WebAssembly memory is outside it. */
  memoryLimitMb?: number;
  /** The worker script; defaults to the built entry next to this module. Tests pass a tsx bootstrap. */
  workerScript?: string | URL;
  /** Bound on PGlite's own close (its shutdown checkpoint) before the thread is terminated. */
  closeGraceMs?: number;
  logger?: ILogger;
};

/** Called once, when the worker reports that the wasm runtime aborted. */
export type PGliteAbortListener = (reason: string) => void;

/** Called once, when the worker thread is gone; `error` is null after a clean close. */
export type PGliteExitListener = (error: Error | null) => void;

type PendingKind =
  | "init"
  | "query"
  | "exec"
  | "close"
  | "reserve"
  | "stats"
  | "rewrite";

type Pending = {
  kind: PendingKind;
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type Phase = "starting" | "ready" | "closing" | "closed";

/** `PH_PGLITE_WORKER_MEMORY_MB`, else {@link DEFAULT_PGLITE_WORKER_MEMORY_MB}. */
export function resolvePgliteWorkerMemoryMb(
  env: Record<string, string | undefined>,
): number {
  const raw = env.PH_PGLITE_WORKER_MEMORY_MB;
  if (raw === undefined || raw.trim() === "") {
    return DEFAULT_PGLITE_WORKER_MEMORY_MB;
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(
      `PH_PGLITE_WORKER_MEMORY_MB must be a positive integer (got: ${raw})`,
    );
  }
  return parsed;
}

/**
 * Main-thread stand-in for a PGlite instance whose store lives in a worker
 * thread. It has the surface knex-pglite, kysely-pglite-dialect and
 * `HardenedPGliteDialect` use: `waitReady`, `query`, `exec`, a synchronous
 * `isInTransaction()`, `closed` and `close()`.
 *
 * Construction is synchronous and starts the worker; calls made before the
 * worker is ready are queued behind its open. The worker runs requests one at
 * a time in arrival order, and every answer carries the transaction status.
 * The instance is a plain extensible object, since knex stores its own
 * bookkeeping on the connection.
 */
export class ThreadedPGlite implements PGliteLike, IStoreMaintenance {
  readonly label: string;
  /** Settles once the worker has opened the store; rejects with {@link PGliteWorkerInitError}. */
  readonly waitReady: Promise<void>;

  private readonly worker: Worker;
  private readonly logger: ILogger;
  private readonly closeGraceMs: number;
  private readonly pending = new Map<number, Pending>();
  /** The reservation an `admit` run is executing under, carried through its async calls. */
  private readonly admission = new AsyncLocalStorage<number>();
  private readonly abortListeners = new Set<PGliteAbortListener>();
  private readonly exitListeners = new Set<PGliteExitListener>();
  private nextId = 1;
  private phase: Phase = "starting";
  private inTransaction = false;
  private terminalError: Error | null = null;
  private workerError: Error | null = null;
  private abortReason: string | null = null;
  private closePromise: Promise<void> | null = null;
  private readonly forgetTelemetry: () => void;

  constructor(options: ThreadedPGliteOptions) {
    this.label = options.store.label;
    this.logger =
      options.logger ??
      childLogger(["reactor-api", "pglite-worker", this.label]);
    this.closeGraceMs =
      options.closeGraceMs ?? DEFAULT_PGLITE_WORKER_CLOSE_GRACE_MS;
    const memoryLimitMb =
      options.memoryLimitMb ?? resolvePgliteWorkerMemoryMb(process.env);

    const workerScript = options.workerScript ?? pgliteWorkerEntryPath;
    if (workerScript === null) {
      throw new Error(
        "No PGlite worker script is available: build @powerhousedao/reactor-api or pass workerScript",
      );
    }
    disableWasmWrapperTiering();
    this.worker = new Worker(workerScript, {
      name: `pglite:${this.label}`,
      resourceLimits: { maxOldGenerationSizeMb: memoryLimitMb },
    });
    this.worker.on("message", (msg: WorkerMessage) => this.handleMessage(msg));
    this.worker.on("error", (err: Error) => this.handleWorkerError(err));
    this.worker.on("exit", (code: number) => this.handleExit(code));
    this.forgetTelemetry = registerTelemetryWorker(`pglite:${this.label}`, () =>
      this.memoryStats(),
    );

    this.waitReady = this.request<void>("init", (id) => ({
      type: "init",
      id,
      store: options.store,
    })).then(
      () => {
        if (this.phase === "starting") {
          this.phase = "ready";
        }
      },
      (error: unknown) => {
        const initError =
          error instanceof PGliteWorkerInitError
            ? error
            : new PGliteWorkerInitError(this.label, { cause: error });
        this.fail(initError);
        throw initError;
      },
    );
    this.waitReady.catch(() => undefined);
  }

  /** JS heap of the worker and the WASM linear memory, which only grows. */
  async memoryStats(): Promise<WorkerMemorySample> {
    const [heap, wasm] = await Promise.all([
      this.worker.getHeapStatistics(),
      this.request<number>("stats", (id) => ({ type: "stats", id })),
    ]);
    return { heapUsed: heap.used_heap_size, wasm };
  }

  /** True once the store is open and until close starts. */
  get ready(): boolean {
    return this.phase === "ready";
  }

  /** True once close has started or the worker is gone. */
  get closed(): boolean {
    return this.phase === "closing" || this.phase === "closed";
  }

  /** The reason the worker reported for a wasm abort, or null. */
  get aborted(): string | null {
    return this.abortReason;
  }

  /** The limits the worker thread runs under (empty once it has exited). */
  get resourceLimits(): ResourceLimits {
    return this.worker.resourceLimits ?? {};
  }

  /** The worker's thread id, for diagnostics. */
  get threadId(): number {
    return this.worker.threadId;
  }

  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
    options?: QueryOptions,
  ): Promise<Results<T>> {
    const wireOptions = toWireOptions(options);
    const result = await this.request<WorkerResults>("query", (id) => ({
      type: "query",
      id,
      admission: this.currentAdmission(),
      sql,
      params: params ?? [],
      options: wireOptions,
    }));
    return toResults<T>(result);
  }

  async exec(sql: string, options?: QueryOptions): Promise<Results[]> {
    const wireOptions = toWireOptions(options);
    const results = await this.request<WorkerResults[]>("exec", (id) => ({
      type: "exec",
      id,
      admission: this.currentAdmission(),
      sql,
      options: wireOptions,
    }));
    return results.map((result) => toResults(result));
  }

  /**
   * `HardenedPGliteDialect`'s admission hook: `run` starts only once the worker
   * can run its statements at once, with nothing queued ahead and no
   * maintenance pass in progress, so the dialect's statement deadline (which
   * starts inside `run`) never counts time spent waiting behind other work.
   * Statements `run` issues bypass the queue until it settles; everything
   * else waits behind them.
   */
  async admit<T>(run: () => Promise<T>): Promise<T> {
    let reservation = 0;
    await this.request<void>("reserve", (id) => {
      reservation = id;
      return { type: "reserve", id };
    });
    try {
      return await this.admission.run(reservation, run);
    } finally {
      this.release(reservation);
    }
  }

  /** Rewrites one table through the store's maintenance inside the worker. */
  rewriteTable(request: TableRewriteRequest): Promise<TableRewriteResult> {
    return this.request<TableRewriteResult>("rewrite", (id) => ({
      type: "rewrite-table",
      id,
      request,
    }));
  }

  /** The status after the most recently answered request, as PGlite reported it. */
  isInTransaction(): boolean {
    return this.inTransaction;
  }

  /** Closes PGlite inside the worker (its shutdown checkpoint), then terminates the thread. */
  close(): Promise<void> {
    if (this.closePromise !== null) {
      return this.closePromise;
    }
    if (this.phase === "closed") {
      return Promise.resolve();
    }
    this.closePromise = this.closeWorker();
    return this.closePromise;
  }

  /** Stops the thread at once, without PGlite's close; pending calls reject. */
  async terminate(): Promise<void> {
    if (this.phase === "closed") {
      return;
    }
    await this.worker.terminate();
  }

  onAbort(listener: PGliteAbortListener): () => void {
    this.abortListeners.add(listener);
    return () => {
      this.abortListeners.delete(listener);
    };
  }

  onExit(listener: PGliteExitListener): () => void {
    this.exitListeners.add(listener);
    return () => {
      this.exitListeners.delete(listener);
    };
  }

  private async closeWorker(): Promise<void> {
    if (this.terminalError !== null) {
      this.phase = "closing";
      await this.worker.terminate();
      return;
    }
    const closing = this.request<void>("close", (id) => ({
      type: "close",
      id,
    }));
    this.phase = "closing";
    let timer: ReturnType<typeof setTimeout> | undefined;
    const grace = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), this.closeGraceMs);
    });
    let outcome: "closed" | "timeout" = "closed";
    let closeError: Error | null = null;
    try {
      outcome = await Promise.race([
        closing.then(() => "closed" as const),
        grace,
      ]);
    } catch (error) {
      closeError = error instanceof Error ? error : new Error(String(error));
    } finally {
      clearTimeout(timer);
    }
    if (outcome === "timeout") {
      this.logger.warn(
        `PGlite worker for ${this.label} did not close within ${this.closeGraceMs}ms; terminating`,
      );
    }
    await this.worker.terminate();
    if (closeError !== null) {
      throw closeError;
    }
  }

  private currentAdmission(): number | null {
    return this.admission.getStore() ?? null;
  }

  private release(reservation: number): void {
    if (this.phase === "closed") {
      return;
    }
    const message: HostMessage = { type: "release", id: reservation };
    this.worker.postMessage(message);
  }

  private request<T>(
    kind: PendingKind,
    build: (id: number) => HostMessage,
  ): Promise<T> {
    if (this.terminalError !== null) {
      return Promise.reject(this.terminalError);
    }
    if (kind !== "init" && this.closed) {
      return Promise.reject(new PGliteWorkerClosedError(this.label));
    }
    const id = this.nextId++;
    const promise = new Promise<T>((resolve, reject) => {
      this.pending.set(id, {
        kind,
        resolve: resolve as (value: unknown) => void,
        reject,
      });
    });
    this.worker.postMessage(build(id));
    return promise;
  }

  private handleMessage(msg: WorkerMessage): void {
    switch (msg.type) {
      case "admitted":
        this.settle(msg.id, msg.inTransaction, undefined);
        return;
      case "ready":
        this.settle(msg.id, msg.inTransaction, undefined);
        return;
      case "query-result":
        this.settle(msg.id, msg.inTransaction, msg.result);
        return;
      case "exec-result":
        this.settle(msg.id, msg.inTransaction, msg.results);
        return;
      case "stats-result":
        this.settle(msg.id, this.inTransaction, msg.wasmBytes);
        return;
      case "rewrite-table-result":
        this.settle(msg.id, msg.inTransaction, msg.result);
        return;
      case "closed":
        this.settle(msg.id, false, undefined);
        return;
      case "error":
        this.settleError(
          msg.id,
          msg.inTransaction,
          fromPGliteErrorInfo(msg.error),
        );
        return;
      case "abort":
        this.handleAbort(msg.reason);
        return;
      case "log":
        this.handleLog(msg);
        return;
      default: {
        const exhaustive: never = msg;
        void exhaustive;
      }
    }
  }

  private settle(id: number, inTransaction: boolean, value: unknown): void {
    this.inTransaction = inTransaction;
    const entry = this.pending.get(id);
    if (entry === undefined) {
      return;
    }
    this.pending.delete(id);
    entry.resolve(value);
  }

  private settleError(id: number, inTransaction: boolean, error: Error): void {
    this.inTransaction = inTransaction;
    const entry = this.pending.get(id);
    if (entry === undefined) {
      return;
    }
    this.pending.delete(id);
    entry.reject(error);
  }

  private handleAbort(reason: string): void {
    if (this.abortReason !== null) {
      return;
    }
    this.abortReason = reason;
    this.logger.error(
      `PGlite worker for ${this.label} aborted: @reason`,
      reason,
    );
    for (const listener of [...this.abortListeners]) {
      try {
        listener(reason);
      } catch (error) {
        this.logger.error("PGlite abort listener threw: @error", error);
      }
    }
  }

  private handleLog(msg: LogMessage): void {
    const message = `[${this.label}] ${msg.message}`;
    const args =
      msg.error === undefined ? [] : [fromPGliteErrorInfo(msg.error)];
    const template = args.length > 0 ? `${message}: @error` : message;
    switch (msg.level) {
      case "debug":
        this.logger.debug(template, ...args);
        return;
      case "info":
        this.logger.info(template, ...args);
        return;
      case "warn":
        this.logger.warn(template, ...args);
        return;
      case "error":
        this.logger.error(template, ...args);
        return;
      default: {
        const exhaustive: never = msg.level;
        void exhaustive;
      }
    }
  }

  private handleWorkerError(err: Error): void {
    this.workerError = err;
    this.logger.error(`PGlite worker for ${this.label} failed: @error`, err);
  }

  private handleExit(code: number): void {
    this.forgetTelemetry();
    const graceful = this.phase === "closing" && this.terminalError === null;
    this.phase = "closed";
    this.inTransaction = false;
    const error = graceful
      ? null
      : (this.terminalError ??
        new PGliteWorkerExitedError(this.label, code, {
          cause: this.workerError ?? undefined,
        }));
    if (error !== null && this.terminalError === null) {
      this.terminalError = error;
    }
    this.rejectPending(error ?? new PGliteWorkerClosedError(this.label));
    for (const listener of [...this.exitListeners]) {
      try {
        listener(error);
      } catch (listenerError) {
        this.logger.error("PGlite exit listener threw: @error", listenerError);
      }
    }
    this.exitListeners.clear();
    this.abortListeners.clear();
  }

  /** Records a fatal error and stops the thread; the exit rejects what is pending. */
  private fail(error: Error): void {
    if (this.terminalError === null) {
      this.terminalError = error;
    }
    this.rejectPending(error);
    void this.worker.terminate();
  }

  private rejectPending(error: Error): void {
    const entries = [...this.pending.values()];
    this.pending.clear();
    for (const entry of entries) {
      entry.reject(error);
    }
  }
}

function toWireOptions(options: QueryOptions | undefined): WorkerQueryOptions {
  if (options === undefined) {
    return {};
  }
  if (
    options.parsers !== undefined ||
    options.serializers !== undefined ||
    options.blob !== undefined ||
    options.onNotice !== undefined
  ) {
    throw new Error(
      "ThreadedPGlite does not support parsers, serializers, blob or onNotice per query; configure parsers on the worker",
    );
  }
  const wire: WorkerQueryOptions = {};
  if (options.rowMode !== undefined) {
    wire.rowMode = options.rowMode;
  }
  if (options.paramTypes !== undefined) {
    wire.paramTypes = options.paramTypes;
  }
  return wire;
}

function toResults<T>(result: WorkerResults): Results<T> {
  const out: Results<T> = {
    rows: result.rows as T[],
    fields: result.fields,
  };
  if (result.affectedRows !== undefined) {
    out.affectedRows = result.affectedRows;
  }
  return out;
}

/**
 * The worker script: the built entry (chunking may place this module in
 * `dist/` or `dist/src/pglite/`), or, when this module runs from its
 * TypeScript source, a bootstrap that loads the entry through tsx. Null when
 * neither is available.
 */
function resolvePgliteWorkerEntryPath(): string | null {
  if (/\.m?ts$/.test(new URL(import.meta.url).pathname)) {
    return resolveSourceBootstrap();
  }
  const candidates = [
    "./src/pglite/worker/entry.mjs",
    "./worker/entry.mjs",
    "./entry.mjs",
  ].map((relative) => fileUrlToPath(new URL(relative, import.meta.url)));
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

function resolveSourceBootstrap(): string | null {
  const bootstrap = fileUrlToPath(
    new URL("./source-bootstrap.mjs", import.meta.url),
  );
  if (!existsSync(bootstrap)) {
    return null;
  }
  try {
    createRequire(import.meta.url).resolve("tsx/esm/api");
  } catch {
    return null;
  }
  return bootstrap;
}

function fileUrlToPath(url: URL): string {
  if (url.protocol !== "file:") {
    return url.href;
  }
  let pathname = decodeURIComponent(url.pathname);
  if (/^\/[A-Za-z]:[/\\]/.test(pathname)) {
    pathname = pathname.slice(1);
  }
  return pathname;
}

/** Absolute path of the worker script for `new Worker(...)`; null when none can run here. */
export const pgliteWorkerEntryPath = resolvePgliteWorkerEntryPath();
