/**
 * Wire protocol between a {@link ThreadedPGlite} stand-in on the main thread
 * and the worker thread that owns one PGlite store.
 *
 * Every payload is structured-cloned, so it holds data only: functions such as
 * row parsers are named by preset and built inside the worker.
 */

/** Module specifiers the worker imports PGlite and its NodeFS from. */
export type PGliteModuleSpec = {
  /** Specifier or file URL of the PGlite package entry, e.g. `@electric-sql/pglite`. */
  pglite: string;
  /** Specifier or file URL of the matching NodeFS entry, e.g. `@electric-sql/pglite/nodefs`. */
  nodefs: string;
};

export const CURRENT_PGLITE_MODULE: PGliteModuleSpec = {
  pglite: "@electric-sql/pglite",
  nodefs: "@electric-sql/pglite/nodefs",
};

/** Row parser sets the worker knows how to build. */
export type PGliteParserPreset = "none" | "utc-timestamps";

/** DurableNodeFs settings; see `DurableNodeFsOptions`. */
export type PGliteWorkerDurableFsOptions = {
  fsync: boolean;
  /** Undefined keeps the DurableNodeFs default (5 min); 0 disables. */
  maintenanceIntervalMs?: number;
  /** Undefined keeps the DurableNodeFs default (256 MB); 0 disables. */
  vacuumFullAboveBytes?: number;
  /** Undefined keeps the DurableNodeFs default (60 s); 0 runs VACUUM FULL on the first pass. */
  vacuumFullQuietMs?: number;
  /** Undefined keeps the DurableNodeFs default (0: the quiet window only); a deadline in ms forces the run past it. */
  vacuumFullMaxDeferMs?: number;
};

/** What the worker opens. */
export type PGliteWorkerStoreOptions = {
  /** Names the store in logs and errors, e.g. `read-storage`. */
  label: string;
  /** PGlite data dir; null opens an in-memory store. */
  dataDir: string | null;
  module: PGliteModuleSpec;
  /** DurableNodeFs over `dataDir`; null uses the module's stock NodeFS. Ignored in memory. */
  durableFs: PGliteWorkerDurableFsOptions | null;
  parsers: PGliteParserPreset;
};

/** The structured-clonable subset of PGlite's `QueryOptions`. */
export type WorkerQueryOptions = {
  rowMode?: "object" | "array";
  paramTypes?: number[];
};

export type PGliteErrorInfo = {
  name: string;
  message: string;
  stack?: string;
  cause?: PGliteErrorInfo;
  /** Postgres error fields, copied when present. */
  fields: Record<string, string>;
};

export type WorkerResults = {
  rows: unknown[];
  affectedRows?: number;
  fields: { name: string; dataTypeID: number }[];
};

export type InitRequest = {
  type: "init";
  id: number;
  store: PGliteWorkerStoreOptions;
};

export type QueryRequest = {
  type: "query";
  id: number;
  /** The reservation this statement runs under, or null for the request queue. */
  admission: number | null;
  sql: string;
  params: unknown[];
  options: WorkerQueryOptions;
};

export type ExecRequest = {
  type: "exec";
  id: number;
  admission: number | null;
  sql: string;
  options: WorkerQueryOptions;
};

export type CloseRequest = {
  type: "close";
  id: number;
};

/**
 * Asks for the connection: answered with `admitted` once everything queued
 * ahead (requests and maintenance passes) has finished. Until the matching
 * `release`, the worker runs only statements tagged with this reservation.
 */
export type ReserveRequest = {
  type: "reserve";
  id: number;
};

/** Ends a reservation; the request queue resumes. Not answered. */
export type ReleaseRequest = {
  type: "release";
  id: number;
};

/** Asks for the store's memory; answered outside the admission queue. */
export type StatsRequest = {
  type: "stats";
  id: number;
};

export type HostMessage =
  | StatsRequest
  | InitRequest
  | QueryRequest
  | ExecRequest
  | CloseRequest
  | ReserveRequest
  | ReleaseRequest;

export type StatsMessage = {
  type: "stats-result";
  id: number;
  /** Bytes of WASM linear memory; 0 before the store has opened. */
  wasmBytes: number;
};

export type AdmittedMessage = {
  type: "admitted";
  id: number;
  inTransaction: boolean;
};

export type ReadyMessage = {
  type: "ready";
  id: number;
  inTransaction: boolean;
};

export type QueryResultMessage = {
  type: "query-result";
  id: number;
  result: WorkerResults;
  inTransaction: boolean;
};

export type ExecResultMessage = {
  type: "exec-result";
  id: number;
  results: WorkerResults[];
  inTransaction: boolean;
};

export type ClosedMessage = {
  type: "closed";
  id: number;
};

export type ErrorMessage = {
  type: "error";
  id: number;
  error: PGliteErrorInfo;
  inTransaction: boolean;
};

/** The wasm runtime aborted (a Postgres PANIC); the store is dead. */
export type AbortMessage = {
  type: "abort";
  reason: string;
};

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogMessage = {
  type: "log";
  level: LogLevel;
  message: string;
  error?: PGliteErrorInfo;
};

export type WorkerMessage =
  | StatsMessage
  | AdmittedMessage
  | ReadyMessage
  | QueryResultMessage
  | ExecResultMessage
  | ClosedMessage
  | ErrorMessage
  | AbortMessage
  | LogMessage;
