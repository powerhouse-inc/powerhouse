import type {
  OperationWithContext,
  PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  IProcessorManager,
  ProcessorFactory,
  ProcessorRecord,
  TrackedProcessor,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import type { Kysely } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import {
  BaseReadModel,
  unchunkedReadModelIndexingConfig,
} from "../read-models/base-read-model.js";
import type {
  DocumentViewDatabase,
  ProcessorCursorRow,
} from "../read-models/types.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import {
  createMinimalDriveHeader,
  extractDeletedDocumentId,
  extractDriveHeader,
  isDriveDeletion,
  matchesFilter,
  resolveProcessorSlots,
} from "./utils.js";

// Live-versus-backfill bookkeeping for one processor.
type DeliveryState = {
  // Ordinal through which a backfill has delivered. Live routing dedupes
  // against this, not against lastOrdinal: batches reach the manager out of
  // ordinal order across documents, and lastOrdinal is the high-water mark a
  // restart replays from.
  backfilledThrough: number;
  // Live batches held while a backfill runs; undefined when none is running.
  pending: OperationWithContext[] | undefined;
  backfill: Promise<void> | undefined;
  retired: boolean;
};

// Batches from init span documents; they take every key.
const MIXED_KEY = "*";

function reentrantCall(method: string): Error {
  return new Error(
    `ProcessorManager.${method} was called from inside a processor or factory callback while the manager held its lock for that callback; the call would wait on itself. Make it after the callback returns.`,
  );
}

function keyOf(items: OperationWithContext[]): string {
  const first = items[0]!.context.documentId;
  for (const item of items) {
    if (item.context.documentId !== first) return MIXED_KEY;
  }
  return first;
}

export type ProcessorManagerOptions = {
  // Key cursors by array position (default). Off derives stable keys from
  // record id, namespace or class name, so reordering factories is safe.
  legacyProcessorIds?: boolean;
};

/**
 * Manages processor lifecycle based on operations.
 * Extends BaseReadModel to receive operations from ReadModelCoordinator.
 *
 * Responsibilities:
 * 1. Detect drive creation from CREATE_DOCUMENT operations
 * 2. Create processors for each drive using registered factories
 * 3. Route operations to matching processors based on filters
 * 4. Clean up processors when drives are deleted or factories are unregistered
 * 5. Track per-processor cursors for failure recovery and backfill
 */
export class ProcessorManager
  extends BaseReadModel
  implements IProcessorManager
{
  private factoryRegistry: Map<string, ProcessorFactory> = new Map();
  private processorsByDrive: Map<string, TrackedProcessor[]> = new Map();
  private factoryToProcessors: Map<string, Map<string, TrackedProcessor[]>> =
    new Map();
  private knownDrives: Map<string, string> = new Map();
  private cursorCache: Map<string, ProcessorCursorRow> = new Map();
  private delivery = new WeakMap<TrackedProcessor, DeliveryState>();
  private logger: ILogger;
  private driveContainerTypes: ReadonlySet<string>;
  private legacyProcessorIds: boolean;
  // One pass at a time per document; registry mutations take every key.
  private tails = new Map<string, Promise<void>>();
  private registry: Promise<void> = Promise.resolve();
  // Backfills a pass started, awaited by that pass once its key is released.
  private spawned = new Map<string, Promise<void>[]>();
  // True only for the synchronous part of a callback made under a key.
  private inCallback = false;

  constructor(
    db: Kysely<DocumentViewDatabase>,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
    logger: ILogger,
    driveContainerTypes: ReadonlySet<string>,
    options: ProcessorManagerOptions = {},
  ) {
    super(db, operationIndex, writeCache, consistencyTracker, {
      readModelId: "processor-manager",
      rebuildStateOnInit: true,
      indexing: unchunkedReadModelIndexingConfig,
    });
    this.logger = logger;
    this.driveContainerTypes = driveContainerTypes;
    this.legacyProcessorIds = options.legacyProcessorIds ?? true;
  }

  // Takes no key: it indexes through indexOperations, which does.
  override async init(): Promise<void> {
    await super.init();
    await this.loadAllCursors();
    await this.discoverExistingDrives();
  }

  // The lock keeps a document's batches one at a time and in arrival order,
  // and keeps the processor tables still while a pass reads them: a drive's
  // processors are created before or after a pass over its own operations,
  // never during one. Delivery to a processor that is backfilling, and the
  // backfill itself, run outside it. A method holding a key must never wait
  // on another keyed or exclusive call: it would wait on itself.
  private keyed<T>(
    key: string,
    method: string,
    work: () => Promise<T>,
  ): Promise<T> {
    if (this.inCallback) return Promise.reject(reentrantCall(method));

    const previous = Promise.all([
      this.tails.get(key) ?? Promise.resolve(),
      this.registry,
    ]);
    const run = previous.then(work);
    const settled = run.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, settled);
    void settled.then(() => {
      if (this.tails.get(key) === settled) this.tails.delete(key);
    });
    return run;
  }

  private exclusive<T>(method: string, work: () => Promise<T>): Promise<T> {
    if (this.inCallback) return Promise.reject(reentrantCall(method));

    const previous = Promise.all([...this.tails.values(), this.registry]);
    const run = previous.then(work);
    this.registry = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  // A call into the manager from the synchronous part of a callback would
  // wait on the key the callback holds; it is rejected instead. One made
  // after the callback's first await looks like any concurrent caller and is
  // not detected: see the precondition on IProcessorManager.
  private callback<T>(fn: () => Promise<T> | T): Promise<T> {
    this.inCallback = true;
    try {
      return Promise.resolve(fn());
    } finally {
      this.inCallback = false;
    }
  }

  override async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

    const key = keyOf(items);
    const section = () => super.indexOperations(items);
    try {
      await (key === MIXED_KEY
        ? this.exclusive("indexOperations", section)
        : this.keyed(key, "indexOperations", section));
    } finally {
      await this.awaitSpawned(key);
    }
  }

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    await this.detectAndRegisterNewDrives(items);
    await this.detectAndCleanupDeletedDrives(items);
    await this.routeOperationsToProcessors(items);
  }

  async registerFactory(
    identifier: string,
    factory: ProcessorFactory,
  ): Promise<void> {
    const backfills = await this.exclusive("registerFactory", () =>
      this.registerFactoryUnlocked(identifier, factory),
    );
    await Promise.all(backfills);
  }

  unregisterFactory(identifier: string): Promise<void> {
    return this.exclusive("unregisterFactory", () =>
      this.unregisterFactoryUnlocked(identifier),
    );
  }

  private async registerFactoryUnlocked(
    identifier: string,
    factory: ProcessorFactory,
  ): Promise<Promise<void>[]> {
    if (this.factoryRegistry.has(identifier)) {
      await this.unregisterFactoryUnlocked(identifier);
    }

    this.factoryRegistry.set(identifier, factory);
    this.factoryToProcessors.set(identifier, new Map());

    // A late registration has no creation batch to anchor to: "current"
    // means from here on.
    const creationOrdinal = this.lastOrdinal + 1;
    const backfills: Promise<void>[] = [];
    for (const [driveId, documentType] of this.knownDrives) {
      const driveHeader = createMinimalDriveHeader(driveId, documentType);
      backfills.push(
        ...(await this.createProcessorsForDrive(
          driveId,
          identifier,
          factory,
          driveHeader,
          creationOrdinal,
        )),
      );
    }
    return backfills;
  }

  private async unregisterFactoryUnlocked(identifier: string): Promise<void> {
    const factoryProcessors = this.factoryToProcessors.get(identifier);
    if (!factoryProcessors) return;

    for (const [driveId, tracked] of factoryProcessors) {
      for (const t of tracked) {
        await this.retire(t);
        await this.safeDisconnect(t.record.processor);
      }

      const driveProcessors = this.processorsByDrive.get(driveId);
      if (driveProcessors) {
        const remaining = driveProcessors.filter((p) => !tracked.includes(p));
        if (remaining.length > 0) {
          this.processorsByDrive.set(driveId, remaining);
        } else {
          this.processorsByDrive.delete(driveId);
        }
      }
    }

    await this.deleteProcessorCursors({ factoryId: identifier });
    this.factoryToProcessors.delete(identifier);
    this.factoryRegistry.delete(identifier);
  }

  get(processorId: string): TrackedProcessor | undefined {
    for (const tracked of this.allTrackedProcessors()) {
      if (tracked.processorId === processorId) return tracked;
    }
    return undefined;
  }

  getAll(): TrackedProcessor[] {
    return Array.from(this.allTrackedProcessors());
  }

  private *allTrackedProcessors(): Iterable<TrackedProcessor> {
    for (const tracked of this.processorsByDrive.values()) {
      yield* tracked;
    }
  }

  private async detectAndRegisterNewDrives(
    operations: OperationWithContext[],
  ): Promise<void> {
    for (const op of operations) {
      if (!this.isDriveCreation(op)) continue;

      const driveId = op.context.documentId;
      if (this.knownDrives.has(driveId)) continue;

      this.knownDrives.set(driveId, op.context.documentType);

      const driveHeader = extractDriveHeader(op);
      if (!driveHeader) continue;

      const key = keyOf(operations);
      const backfills = this.spawned.get(key) ?? [];
      this.spawned.set(key, backfills);
      for (const [identifier, factory] of this.factoryRegistry) {
        backfills.push(
          ...(await this.createProcessorsForDrive(
            driveId,
            identifier,
            factory,
            driveHeader,
            op.context.ordinal,
          )),
        );
      }
    }
  }

  private async awaitSpawned(key: string): Promise<void> {
    const backfills = this.spawned.get(key);
    if (!backfills) return;
    this.spawned.delete(key);
    await Promise.all(backfills);
  }

  private isDriveCreation(op: OperationWithContext): boolean {
    return (
      op.operation.action.type === "CREATE_DOCUMENT" &&
      this.driveContainerTypes.has(op.context.documentType)
    );
  }

  private async detectAndCleanupDeletedDrives(
    operations: OperationWithContext[],
  ): Promise<void> {
    for (const op of operations) {
      if (!isDriveDeletion(op)) continue;

      const driveId = extractDeletedDocumentId(op);
      if (!driveId || !this.knownDrives.has(driveId)) continue;

      if (!this.isDeletedDocumentADrive(driveId)) continue;

      await this.cleanupDriveProcessors(driveId);
      this.knownDrives.delete(driveId);
    }
  }

  private async discoverExistingDrives(): Promise<void> {
    const drives = await this.db
      .selectFrom("DocumentSnapshot")
      .select(["documentId", "documentType"])
      .where("documentType", "in", [...this.driveContainerTypes])
      .where("isDeleted", "=", false)
      .execute();

    for (const drive of drives) {
      this.knownDrives.set(drive.documentId, drive.documentType);
    }
  }

  private isDeletedDocumentADrive(documentId: string): boolean {
    return this.knownDrives.has(documentId);
  }

  private async createProcessorsForDrive(
    driveId: string,
    identifier: string,
    factory: ProcessorFactory,
    driveHeader: PHDocumentHeader,
    creationOrdinal: number,
  ): Promise<Promise<void>[]> {
    let records: ProcessorRecord[];

    try {
      records = await this.callback(() => factory(driveHeader));
    } catch (error) {
      this.logger.error(
        "Factory '@FactoryId' failed for drive '@DriveId': @Error",
        identifier,
        driveId,
        error,
      );
      return [];
    }

    if (records.length === 0) return [];

    const trackedList: TrackedProcessor[] = [];
    const slots = resolveProcessorSlots(records, this.legacyProcessorIds);

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;
      const processorId = `${identifier}:${driveId}:${slots[i]}`;

      const cached = this.cursorCache.get(processorId);
      let lastOrdinal: number;
      let status: "active" | "errored";
      let lastError: string | undefined;
      let lastErrorTimestamp: Date | undefined;

      if (cached) {
        lastOrdinal = cached.lastOrdinal;
        status = cached.status as "active" | "errored";
        lastError = cached.lastError ?? undefined;
        lastErrorTimestamp = cached.lastErrorTimestamp ?? undefined;
      } else {
        const startFrom = record.startFrom ?? "beginning";
        lastOrdinal = startFrom === "current" ? creationOrdinal - 1 : 0;
        status = "active";
        lastError = undefined;
        lastErrorTimestamp = undefined;
      }

      const tracked: TrackedProcessor = {
        processorId,
        factoryId: identifier,
        driveId,
        processorIndex: i,
        record,
        lastOrdinal,
        status,
        lastError,
        lastErrorTimestamp,
        retry: () => this.retryProcessor(tracked),
      };

      trackedList.push(tracked);
      this.stateOf(tracked).backfilledThrough = lastOrdinal;

      await this.saveProcessorCursor(tracked);
    }

    // Cursors this factory no longer produces for the drive are orphans.
    const liveIds = new Set(trackedList.map((t) => t.processorId));
    await this.db
      .deleteFrom("ProcessorCursor")
      .where("factoryId", "=", identifier)
      .where("driveId", "=", driveId)
      .where("processorId", "not in", [...liveIds])
      .execute();

    for (const [id, row] of this.cursorCache) {
      if (
        row.factoryId === identifier &&
        row.driveId === driveId &&
        !liveIds.has(id)
      ) {
        this.cursorCache.delete(id);
      }
    }

    const factoryProcessors = this.factoryToProcessors.get(identifier);
    if (factoryProcessors) {
      factoryProcessors.set(driveId, trackedList);
    }

    const existingDriveProcessors = this.processorsByDrive.get(driveId) ?? [];
    this.processorsByDrive.set(driveId, [
      ...existingDriveProcessors,
      ...trackedList,
    ]);

    const backfills: Promise<void>[] = [];
    for (const tracked of trackedList) {
      if (
        tracked.status === "active" &&
        tracked.lastOrdinal < this.lastOrdinal
      ) {
        backfills.push(this.runBackfill(tracked));
      }
    }
    return backfills;
  }

  private stateOf(tracked: TrackedProcessor): DeliveryState {
    let state = this.delivery.get(tracked);
    if (!state) {
      state = {
        backfilledThrough: 0,
        pending: undefined,
        backfill: undefined,
        retired: false,
      };
      this.delivery.set(tracked, state);
    }
    return state;
  }

  // Holds live batches from this synchronous point until the backfill and
  // the held batches have both been delivered.
  private runBackfill(tracked: TrackedProcessor): Promise<void> {
    const state = this.stateOf(tracked);
    if (state.backfill) return state.backfill;

    state.pending = [];
    state.backfill = this.backfillThenDrain(tracked, state).finally(() => {
      state.pending = undefined;
      state.backfill = undefined;
    });
    return state.backfill;
  }

  private async backfillThenDrain(
    tracked: TrackedProcessor,
    state: DeliveryState,
  ): Promise<void> {
    await this.backfillProcessor(tracked, state);

    while (state.pending !== undefined && state.pending.length > 0) {
      const held = state.pending;
      state.pending = [];
      await this.route(tracked, held, true);
    }
  }

  // Read through a call: the flag flips while a delivery is awaited.
  private isRetired(tracked: TrackedProcessor): boolean {
    return this.stateOf(tracked).retired;
  }

  private async retire(tracked: TrackedProcessor): Promise<void> {
    const state = this.stateOf(tracked);
    state.retired = true;
    try {
      await state.backfill;
    } catch {
      // Reported to whoever started the backfill.
    }
  }

  private async backfillProcessor(
    tracked: TrackedProcessor,
    state: DeliveryState,
  ): Promise<void> {
    let page = await this.operationIndex.getSinceOrdinal(tracked.lastOrdinal);

    while (page.results.length > 0) {
      if (this.isRetired(tracked)) return;

      const matching = page.results.filter((op) =>
        matchesFilter(op, tracked.record.filter),
      );

      if (matching.length > 0) {
        try {
          await tracked.record.processor.onOperations(matching);
        } catch (error) {
          tracked.status = "errored";
          tracked.lastError =
            error instanceof Error ? error.message : String(error);
          tracked.lastErrorTimestamp = new Date();
          await this.safeSaveProcessorCursor(tracked);
          this.logger.error(
            "Processor '@ProcessorId' failed during backfill at ordinal @Ordinal: @Error",
            tracked.processorId,
            tracked.lastOrdinal,
            error,
          );
          return;
        }
      }

      if (this.isRetired(tracked)) return;
      const lastResult = page.results[page.results.length - 1]!;
      tracked.lastOrdinal = lastResult.context.ordinal;
      state.backfilledThrough = tracked.lastOrdinal;
      await this.safeSaveProcessorCursor(tracked);

      if (!page.next) break;
      page = await page.next();
    }
  }

  private async retryProcessor(tracked: TrackedProcessor): Promise<void> {
    if (tracked.status !== "errored") return;
    tracked.status = "active";
    tracked.lastError = undefined;
    tracked.lastErrorTimestamp = undefined;
    const backfill = this.runBackfill(tracked);
    await this.saveProcessorCursor(tracked);
    await backfill;
  }

  private async cleanupDriveProcessors(driveId: string): Promise<void> {
    const processors = this.processorsByDrive.get(driveId);
    if (!processors) return;

    for (const tracked of processors) {
      await this.retire(tracked);
      await this.safeDisconnect(tracked.record.processor);
    }

    this.processorsByDrive.delete(driveId);

    for (const factoryProcessors of this.factoryToProcessors.values()) {
      factoryProcessors.delete(driveId);
    }

    await this.deleteProcessorCursors({ driveId });
  }

  private async safeDisconnect(processor: IProcessor): Promise<void> {
    try {
      await this.callback(() => processor.onDisconnect());
    } catch (error) {
      this.logger.error("Error disconnecting processor: @Error", error);
    }
  }

  private async routeOperationsToProcessors(
    operations: OperationWithContext[],
  ): Promise<void> {
    const allTracked = Array.from(this.allTrackedProcessors());
    await Promise.all(
      allTracked.map((tracked) => this.route(tracked, operations, false)),
    );
  }

  private async route(
    tracked: TrackedProcessor,
    operations: OperationWithContext[],
    fromHold: boolean,
  ): Promise<void> {
    const state = this.stateOf(tracked);
    if (state.retired) return;

    if (!fromHold && state.pending !== undefined) {
      state.pending.push(...operations);
      return;
    }

    const matching = operations.filter(
      (op) =>
        op.context.ordinal > state.backfilledThrough &&
        matchesFilter(op, tracked.record.filter),
    );

    if (tracked.status !== "active") {
      if (matching.length > 0) await this.parkBelow(tracked, matching);
      return;
    }

    if (matching.length > 0) {
      const deliver = () => tracked.record.processor.onOperations(matching);
      try {
        await (fromHold ? deliver() : this.callback(deliver));
      } catch (error) {
        tracked.status = "errored";
        tracked.lastError =
          error instanceof Error ? error.message : String(error);
        tracked.lastErrorTimestamp = new Date();
        await this.parkBelow(tracked, matching);
        this.logger.error(
          "Processor '@ProcessorId' failed at ordinal @Ordinal: @Error",
          tracked.processorId,
          tracked.lastOrdinal,
          error,
        );
        return;
      }
    }

    let maxOrdinal = 0;
    for (const op of operations) {
      maxOrdinal = Math.max(maxOrdinal, op.context.ordinal);
    }
    tracked.lastOrdinal = Math.max(tracked.lastOrdinal, maxOrdinal);
    await this.safeSaveProcessorCursor(tracked);
  }

  // A batch the processor did not take must stay ahead of both cursors, or
  // retry and restart would resume past it.
  private async parkBelow(
    tracked: TrackedProcessor,
    missed: OperationWithContext[],
  ): Promise<void> {
    let lowest = missed[0]!.context.ordinal;
    for (const op of missed) lowest = Math.min(lowest, op.context.ordinal);

    tracked.lastOrdinal = Math.min(tracked.lastOrdinal, lowest - 1);
    const state = this.stateOf(tracked);
    state.backfilledThrough = Math.min(state.backfilledThrough, lowest - 1);
    await this.safeSaveProcessorCursor(tracked);
  }

  private async loadAllCursors(): Promise<void> {
    const rows = await this.db
      .selectFrom("ProcessorCursor")
      .selectAll()
      .execute();

    for (const row of rows) {
      this.cursorCache.set(row.processorId, row);
    }
  }

  private async safeSaveProcessorCursor(
    tracked: TrackedProcessor,
  ): Promise<void> {
    try {
      await this.saveProcessorCursor(tracked);
    } catch (error) {
      this.logger.error(
        "Failed to persist cursor for '@ProcessorId': @Error",
        tracked.processorId,
        error,
      );
    }
  }

  private async saveProcessorCursor(tracked: TrackedProcessor): Promise<void> {
    await this.db
      .insertInto("ProcessorCursor")
      .values({
        processorId: tracked.processorId,
        factoryId: tracked.factoryId,
        driveId: tracked.driveId,
        processorIndex: tracked.processorIndex,
        lastOrdinal: tracked.lastOrdinal,
        status: tracked.status,
        lastError: tracked.lastError ?? null,
        lastErrorTimestamp: tracked.lastErrorTimestamp ?? null,
        updatedAt: new Date(),
      })
      .onConflict((oc) =>
        oc.column("processorId").doUpdateSet({
          lastOrdinal: tracked.lastOrdinal,
          status: tracked.status,
          lastError: tracked.lastError ?? null,
          lastErrorTimestamp: tracked.lastErrorTimestamp ?? null,
          updatedAt: new Date(),
        }),
      )
      .execute();

    this.cursorCache.set(tracked.processorId, {
      processorId: tracked.processorId,
      factoryId: tracked.factoryId,
      driveId: tracked.driveId,
      processorIndex: tracked.processorIndex,
      lastOrdinal: tracked.lastOrdinal,
      status: tracked.status,
      lastError: tracked.lastError ?? null,
      lastErrorTimestamp: tracked.lastErrorTimestamp ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  private async deleteProcessorCursors(
    filter: { factoryId: string } | { driveId: string },
  ): Promise<void> {
    if ("factoryId" in filter) {
      await this.db
        .deleteFrom("ProcessorCursor")
        .where("factoryId", "=", filter.factoryId)
        .execute();
      for (const [id, row] of this.cursorCache) {
        if (row.factoryId === filter.factoryId) this.cursorCache.delete(id);
      }
    } else {
      await this.db
        .deleteFrom("ProcessorCursor")
        .where("driveId", "=", filter.driveId)
        .execute();
      for (const [id, row] of this.cursorCache) {
        if (row.driveId === filter.driveId) this.cursorCache.delete(id);
      }
    }
  }
}
