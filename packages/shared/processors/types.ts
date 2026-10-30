import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Action } from "../document-model/actions.js";
import type { IAnalyticsStore } from "../analytics/types.js";
import type {
  PHDocument,
  PHDocumentHeader,
} from "../document-model/documents.js";
import type { PROCESSOR_APPS } from "./constants.js";
import type { IHttpScope } from "./http.js";
import type { IRelationalDb } from "./relational/types.js";

export type ProcessorDispatchResult = {
  id: string;
  status: string;
};

/** A dispatched create: the job, and the id the new document carries. */
export type ProcessorDispatchCreateResult = ProcessorDispatchResult & {
  documentId: string;
};

/** How a dispatched delete treats children: "cascade" deletes orphans too. */
export type ProcessorDeletePropagation = "none" | "cascade";

/**
 * How a processor writes. Each member resolves once the write is accepted and
 * answers with the job's id and status; it does not wait for the commit.
 */
export interface IProcessorDispatch {
  execute(
    docId: string,
    branch: string,
    actions: Action[],
    signal?: AbortSignal,
    meta?: Record<string, unknown>,
  ): Promise<ProcessorDispatchResult>;

  /**
   * Adds a document to a drive, under `parentFolder` when given. The
   * document's own creation has completed when this resolves; the drive's
   * file node has been accepted.
   */
  createInDrive(
    driveId: string,
    document: PHDocument,
    parentFolder?: string,
    signal?: AbortSignal,
  ): Promise<ProcessorDispatchCreateResult>;

  /** Deletes a document, and with "cascade" its orphaned children. */
  deleteDocument(
    docId: string,
    propagate?: ProcessorDeletePropagation,
    signal?: AbortSignal,
  ): Promise<ProcessorDispatchResult>;
}

// Host-agnostic core. reactor-browser and reactor-api extend it with
// `client` and `attachments` as `IProcessorHostModule`.
export interface IProcessorHostModuleBase {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
  processorApp: ProcessorApp;
  dispatch: IProcessorDispatch;
  getReadModel<T>(name: string): T;
  config?: Map<string, unknown>;
  /**
   * The package's slice of the HTTP surface, bound to its own namespace.
   *
   * Declared on the host-agnostic base rather than on each host's module so
   * the two cannot drift: codegen types generated processors against
   * reactor-browser's `IProcessorHostModule`, and the same source has to
   * compile against reactor-api's.
   *
   * Absent whenever the host has no HTTP server — processors also run in the
   * browser — and on the reactor when the package's name cannot be resolved to
   * a routable namespace, so a caller must always check before using it.
   */
  http?: IHttpScope;
}

/**
 * Filter for matching operations to processors.
 * All fields are optional arrays - when provided, operations must match at least one value in each specified field.
 * When a field is undefined or empty, it matches all values for that field.
 */
export type ProcessorFilter = {
  documentType?: string[];
  scope?: string[];
  branch?: string[];
  documentId?: string[];
};

/**
 * Describes an object that can process operations.
 */
export interface IProcessor {
  /**
   * Processes a list of operations with context.
   * Called when operations match this processor's filter.
   *
   * Delivery is at-least-once. Within a document's scope and branch, each
   * call is in ordinal order, and an operation delivered late comes with
   * every later operation of its stream this processor was already given.
   * Across documents there is no ordering guarantee. A processor receives one
   * `onOperations` call at a time; the next call begins after the previous
   * resolves.
   *
   * A drive's processors also receive the drive's own DELETE_DOCUMENT or
   * PURGE_DOCUMENT, whatever the filter, as the last delivery before
   * `onDisconnect`. A purged document's operations other than its marker are
   * not delivered. Erase a document's data on either deletion action.
   *
   * `context.resultingState` is the executor's state after the operation on a
   * live delivery. On a replay (first install, catch-up after a restart,
   * rerun, retry) it is what the record's `replayState` says: by default the
   * document's latest state, which can be newer than the operation.
   */
  onOperations(operations: OperationWithContext[]): Promise<void>;

  /**
   * Called when the processor is disconnected.
   * Used to clean up any resources allocated during processor creation.
   * Also runs when the factory is unregistered, so it is not a deletion signal.
   */
  onDisconnect(): Promise<void>;

  /**
   * Optional. Erases everything this processor derived, so that a replay from
   * its first ordinal rebuilds it. Called while none of the processors sharing
   * its {@link clearScope} is being delivered to.
   */
  clear?(): Promise<void>;

  /**
   * What `clear` erases. Processors of one drive and factory with equal scopes
   * share what they derived, so they are cleared and replayed together. A
   * processor without one shares only with records holding the same instance.
   */
  readonly clearScope?: string;
}

/**
 * Relates a processor to its filter configuration.
 */
/**
 * What a replayed operation carries. A replay (first install, catch-up after a
 * restart, rerun, retry) reads operations from the index, which keeps no
 * `resultingState`; a live delivery always carries the executor's.
 *
 * - `latest` (the default): every operation, with the document's latest state.
 *   It can be newer than the operation, never older than a state already
 *   delivered for that stream.
 * - `collapse`: per document stream, one delivery with the latest state; the
 *   operations it includes are skipped. Only for processors whose output
 *   depends on the latest state alone.
 * - `exact`: every operation, with its state at its own revision. Slower.
 * - `operations`: every operation, without state.
 */
export type ReplayStateMode = "latest" | "collapse" | "exact" | "operations";

export type ProcessorRecord = {
  processor: IProcessor;
  filter: ProcessorFilter;
  startFrom?: "beginning" | "current";
  /** What a replayed operation carries; `latest` when omitted. */
  replayState?: ReplayStateMode;
  // Stable cursor key within its factory and drive. Derived from the
  // processor's namespace or class name when omitted.
  id?: string;
};

/**
 * A factory function that creates processor records for a given drive.
 * Called once per drive when the drive is first detected or when the factory is registered.
 * The header is the drive's header at creation. For a purged drive it is
 * minimal: only `id` and `documentType` are set, and `slug` and `name` are
 * empty, so a factory that selects drives by slug or name makes no processor
 * for it and the deletion stays owed.
 */
export type ProcessorFactory = (
  driveHeader: PHDocumentHeader,
  processorApp?: ProcessorApp,
) => Promise<ProcessorRecord[]> | ProcessorRecord[];

/** Takes a processor host module and builds processor factories using its context. */
// Method syntax keeps the param bivariant so builders typed against a host's
// extended module stay assignable to the base instantiation.
export type ProcessorFactoryBuilder<
  TModule extends IProcessorHostModuleBase = IProcessorHostModuleBase,
> = {
  bivarianceHack(module: TModule): Promise<ProcessorFactory> | ProcessorFactory;
}["bivarianceHack"];

export type ProcessorStatus = "active" | "errored";

/**
 * Where a processor stands: replaying towards the head while a backfill,
 * retry or rerun is queued or running, keeping up with live operations, or
 * stopped on an error.
 */
export type ProcessorPhase = "catching-up" | "live" | "errored";

/** How {@link IProcessorManager.rerun} replays a processor. */
export type ProcessorRerunOptions = {
  /** Erase what it derived first; `fromOrdinal` is then its floor. */
  clear: boolean;
  /** Without `clear`: the ordinal the replay starts above. */
  fromOrdinal: number;
};

export type TrackedProcessor = {
  processorId: string;
  factoryId: string;
  driveId: string;
  processorIndex: number;
  record: ProcessorRecord;
  lastOrdinal: number;
  status: ProcessorStatus;
  lastError: string | undefined;
  lastErrorTimestamp: Date | undefined;
  /** Ordinals at or below this are never delivered to it. */
  floor: number;
  /**
   * The cursor as its current backfill, retry or rerun began; equal to
   * `lastOrdinal` once live, so `lastOrdinal - runFrom` is the replay's
   * progress.
   */
  runFrom: number;
  phase: ProcessorPhase;
  /**
   * Clears the error and resolves once the replay from the cursor completes.
   * Safe from anywhere, but awaiting it from this processor's own
   * `onOperations` waits on itself: the replay runs after that call returns.
   * A no-op once the processor has been removed.
   */
  retry: () => Promise<void>;
  /** Readable name: record id, class name or namespace; not the cursor key. */
  name?: string;
  /** The drive's slug, else its name, else its id. */
  driveLabel?: string;
  /** Its numbers so far; undefined while timing is off. */
  timing?: () => ProcessorTiming | undefined;
  /** What waits on its queue right now. */
  queueDepth?: () => ProcessorQueueDepth;
};

/** How much a reactor records about its processors' time. */
export type ProcessorTimingLevel = "off" | "basic" | "detailed";

/** The two ways an operation reaches a processor. */
export type ProcessorTimingPath = "live" | "replay";

/**
 * One path's numbers over one horizon. Times are wall-clock milliseconds the
 * queue awaited, not CPU: a queue runs one task at a time, so one processor's
 * busy time never exceeds the horizon, but processors run concurrently, so the
 * sum over processors can. Read time includes waiting for the store connection.
 */
export type ProcessorTimingCounters = {
  /** `onOperations` calls. */
  batches: number;
  opsDelivered: number;
  /** Replay: read from the log. Live: routed to this queue. */
  opsScanned: number;
  /** Replay: after the filter and floor, before tombstones. Live: routed. */
  opsMatched: number;
  /** Replay pages read. */
  pages: number;
  /** Inside `onOperations`. */
  handlerMs: number;
  maxBatchMs: number;
  /** Reading a page of the operation index. */
  readMs: number;
  /** Checking tombstones. */
  lookupMs: number;
  /** Filling replay state. */
  fillMs: number;
  /** Waiting for a backfill slot: throttling, not work. */
  slotWaitMs: number;
  /** Between pages: throttling, not work. */
  pauseMs: number;
  errors: number;
};

export type ProcessorTimingHorizon = {
  live: ProcessorTimingCounters;
  replay: ProcessorTimingCounters;
  ordinalsAdvanced: number;
  /** Handler, read, lookup and fill over both paths: the ranking key. */
  busyMs: number;
};

/** The replay running now. */
export type ProcessorTimingRun = {
  startedAtUtcMs: number;
  runFrom: number;
  counters: ProcessorTimingCounters;
  ordinalsAdvanced: number;
};

/** The last replay that scanned anything, kept once it ends. */
export type ProcessorTimingLastRun = {
  startedAtUtcMs: number;
  durationMs: number;
  ordinals: number;
  opsDelivered: number;
  busyMs: number;
};

/** The last `onOperations` call. */
export type ProcessorTimingBatch = {
  atUtcMs: number;
  path: ProcessorTimingPath;
  ops: number;
  ms: number;
  fromOrdinal: number;
  toOrdinal: number;
};

/** Handler time attributed to a document type by its share of each batch. */
export type ProcessorTimingDocumentType = {
  documentType: string;
  ops: number;
  handlerMs: number;
};

/** One processor's numbers; see {@link ProcessorTimingCounters} on reading them. */
export type ProcessorTiming = {
  processorId: string;
  name: string;
  driveLabel: string;
  factoryId: string;
  driveId: string;
  /** Start of `total`: the first bind, or the last reset. */
  sinceUtcMs: number;
  total: ProcessorTimingHorizon;
  /** The last `windowMs`. */
  window: ProcessorTimingHorizon;
  /** The span `window` covers; shorter right after the start. */
  windowMs: number;
  currentRun: ProcessorTimingRun | null;
  lastRun: ProcessorTimingLastRun | null;
  lastBatch: ProcessorTimingBatch | null;
  /** Over `window`; filled at level `detailed` only. */
  byDocumentType: ProcessorTimingDocumentType[];
};

/** What waits on a processor's queue. */
export type ProcessorQueueDepth = {
  tasks: number;
  /** Operations in queued live batches. */
  ops: number;
};

/**
 * Manages processor creation and destruction based on drive operations.
 */
export interface IProcessorManager {
  /**
   * Registers a processor factory.
   * Immediately creates processors for all existing drives and resolves once
   * every factory run has completed and its processors are bound. Their
   * backfills run afterwards, on each processor's own queue. A deleted drive
   * whose deletion one of the factory's processors never received (it was not
   * running, or its delivery threw) gets a processor too: it receives only the
   * drive's `DELETE_DOCUMENT`, or its `PURGE_DOCUMENT` once purged, and is
   * disconnected. That delivery is not awaited: it runs after this resolves,
   * so a processor that hangs on it does not hold the registration, nor a
   * later one: a drive whose deletion is still being delivered gets it from
   * the new registration only if that delivery leaves it owed. If processors
   * from an earlier registration under the same identifier are still
   * draining, or a call of the previous factory is still in flight, the
   * factory runs after they have settled, so awaiting a re-registration of
   * a factory from inside that factory or one of its processors'
   * `onOperations` waits on itself.
   */
  registerFactory(identifier: string, factory: ProcessorFactory): Promise<void>;

  /**
   * Unregisters a processor factory. Resolves once its processors receive no
   * new deliveries and their cursors are released; each one's in-flight
   * delivery finishes first, then `onDisconnect` runs. A released cursor no
   * longer positions a processor: a re-registration starts each one afresh,
   * per `startFrom`. It only records that the factory held a drive's data, so
   * that a drive deleted before the factory registers again still gets its
   * deletion delivered then. Safe to call from
   * inside a processor's own `onOperations`.
   */
  unregisterFactory(identifier: string): Promise<void>;

  /**
   * Replays a processor and resolves once the replay completes. With `clear`,
   * it and the processors sharing its clear scope are cleared, then replayed
   * from their floor; otherwise its cursor moves back to `fromOrdinal`, which
   * lies between its floor and its cursor, and the processor receives every
   * matching operation above it again. Rejects for an unknown processor, a
   * `clear` one of them cannot do, or an ordinal outside that range.
   */
  rerun(processorId: string, options: ProcessorRerunOptions): Promise<void>;

  /**
   * Gets a tracked processor by its ID.
   */
  get(processorId: string): TrackedProcessor | undefined;

  /**
   * Gets all tracked processors, including an errored entry for each
   * processor whose drive's deletion threw; its `retry()` delivers the
   * deletion again.
   */
  getAll(): TrackedProcessor[];
}

export type ProcessorApp = (typeof PROCESSOR_APPS)[number];

export type ProcessorApps = readonly ProcessorApp[];
