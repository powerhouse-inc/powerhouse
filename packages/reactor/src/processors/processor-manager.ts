import type {
  OperationWithContext,
  PHDocumentHeader,
} from "@powerhousedao/shared/document-model";
import type {
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
  ProcessorQueue,
  type ProcessorCursorState,
} from "./processor-queue.js";
import {
  createMinimalDriveHeader,
  extractDeletedDocumentId,
  extractDriveHeader,
  isDriveDeletion,
  matchesFilter,
  resolveProcessorSlots,
} from "./utils.js";

// A factory run in progress; batches routed meanwhile are left to backfill.
type PendingSlot = {
  factoryId: string;
  driveId: string;
  // Highest ordinal routed before the slot existed.
  reservedAt: number;
  lowestRoutedOrdinal: number | undefined;
};

type Bound = { tracked: TrackedProcessor; queue: ProcessorQueue };

type FactoryRun = () => Promise<void>;

export type ProcessorManagerOptions = {
  // Key cursors by array position (default). Off derives stable keys from
  // record id, namespace or class name, so reordering factories is safe.
  legacyProcessorIds?: boolean;
};

// Routing tables are only read or written synchronously; everything that
// touches a processor runs on that processor's queue.
export class ProcessorManager
  extends BaseReadModel
  implements IProcessorManager
{
  private factoryRegistry: Map<string, ProcessorFactory> = new Map();
  private processorsByDrive: Map<string, Bound[]> = new Map();
  private pendingSlots: Set<PendingSlot> = new Set();
  private knownDrives: Map<string, string> = new Map();
  private highestRoutedOrdinal = 0;
  private cursorCache: Map<string, ProcessorCursorRow> = new Map();
  // Serializes every cursor row write per processor id.
  private cursorWrites: Map<string, Promise<void>> = new Map();
  private logger: ILogger;
  private driveContainerTypes: ReadonlySet<string>;
  private legacyProcessorIds: boolean;

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

  override async init(): Promise<void> {
    await super.init();
    await this.loadAllCursors();
    await this.discoverExistingDrives();
  }

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    const { runs, reserved } = this.detectNewDrives(items);
    const disconnects = this.detectDeletedDrives(items);
    const deliveries = this.enqueueRouted(items, reserved);

    await Promise.all([
      ...runs.map((run) => run()),
      ...disconnects,
      ...deliveries,
    ]);
  }

  async registerFactory(
    identifier: string,
    factory: ProcessorFactory,
  ): Promise<void> {
    const removals = this.removeFactory(identifier);
    this.factoryRegistry.set(identifier, factory);

    // A late registration has no creation batch to anchor to: "current"
    // means from here on.
    const creationOrdinal = this.highWater() + 1;
    const runs: FactoryRun[] = [];
    for (const [driveId, documentType] of this.knownDrives) {
      runs.push(
        this.reserveSlot(
          identifier,
          factory,
          driveId,
          createMinimalDriveHeader(driveId, documentType),
          creationOrdinal,
          undefined,
          false,
        ).run,
      );
    }

    await Promise.all([...removals, ...runs.map((run) => run())]);
  }

  async unregisterFactory(identifier: string): Promise<void> {
    await Promise.all(this.removeFactory(identifier));
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

  /** Synchronous: reserves a slot per registered factory for each new drive. */
  protected detectNewDrives(items: OperationWithContext[]): {
    runs: FactoryRun[];
    reserved: Set<PendingSlot>;
  } {
    const runs: FactoryRun[] = [];
    const reserved = new Set<PendingSlot>();

    for (const op of items) {
      if (!this.isDriveCreation(op)) continue;

      const driveId = op.context.documentId;
      if (this.knownDrives.has(driveId)) continue;
      this.knownDrives.set(driveId, op.context.documentType);

      const driveHeader = extractDriveHeader(op);
      if (!driveHeader) continue;

      for (const [identifier, factory] of this.factoryRegistry) {
        const { slot, run } = this.reserveSlot(
          identifier,
          factory,
          driveId,
          driveHeader,
          op.context.ordinal,
          items,
          true,
        );
        reserved.add(slot);
        runs.push(run);
      }
    }

    return { runs, reserved };
  }

  /** Synchronous: drops a deleted drive's processors from the tables. */
  protected detectDeletedDrives(
    items: OperationWithContext[],
  ): Promise<void>[] {
    const pending: Promise<void>[] = [];

    for (const op of items) {
      if (!isDriveDeletion(op)) continue;

      const driveId = extractDeletedDocumentId(op);
      if (!driveId || !this.knownDrives.has(driveId)) continue;
      this.knownDrives.delete(driveId);

      for (const slot of this.pendingSlots) {
        if (slot.driveId === driveId) this.pendingSlots.delete(slot);
      }

      for (const { queue } of this.processorsByDrive.get(driveId) ?? []) {
        pending.push(queue.close());
      }
      this.processorsByDrive.delete(driveId);
      pending.push(...this.deleteCursors((row) => row.driveId === driveId));
    }

    return pending;
  }

  /** Synchronous: puts each processor's share of the batch on its queue. */
  protected enqueueRouted(
    items: OperationWithContext[],
    reserved: ReadonlySet<PendingSlot>,
  ): Promise<void>[] {
    if (items.length === 0) return [];

    let lowest = items[0]!.context.ordinal;
    let highest = 0;
    for (const item of items) {
      lowest = Math.min(lowest, item.context.ordinal);
      highest = Math.max(highest, item.context.ordinal);
    }
    this.highestRoutedOrdinal = Math.max(this.highestRoutedOrdinal, highest);

    for (const slot of this.pendingSlots) {
      if (reserved.has(slot)) continue;
      slot.lowestRoutedOrdinal = Math.min(
        slot.lowestRoutedOrdinal ?? lowest,
        lowest,
      );
    }

    const deliveries: Promise<void>[] = [];
    for (const { tracked, queue } of this.allBound()) {
      const matching = items.filter((op) =>
        matchesFilter(op, tracked.record.filter),
      );
      if (matching.length > 0) {
        deliveries.push(queue.live(matching));
      } else {
        // Not awaited: the pass waits only on processors it delivers to.
        void queue.advance(highest);
      }
    }
    return deliveries;
  }

  /** Synchronous: binds records, or discards them if the slot was cancelled. */
  protected bind(
    slot: PendingSlot,
    records: ProcessorRecord[],
    creationOrdinal: number,
    creationItems: OperationWithContext[] | undefined,
  ): { persisted: Promise<void>; delivered: Promise<void> } {
    if (!this.pendingSlots.delete(slot)) {
      const discarded = records.map((record) =>
        this.discard(
          slot,
          record.processor.onDisconnect.bind(record.processor),
        ),
      );
      const settled = Promise.all(discarded).then(() => undefined);
      return { persisted: settled, delivered: settled };
    }

    const { factoryId, driveId, lowestRoutedOrdinal } = slot;
    const ids = resolveProcessorSlots(records, this.legacyProcessorIds);
    const bound: Bound[] = records.map((record, i) =>
      this.track(
        slot,
        record,
        i,
        `${factoryId}:${driveId}:${ids[i]}`,
        creationOrdinal,
        lowestRoutedOrdinal,
      ),
    );

    const drive = this.processorsByDrive.get(driveId) ?? [];
    this.processorsByDrive.set(driveId, [...drive, ...bound]);

    // Cursors this factory no longer produces for the drive are orphans.
    const liveIds = new Set(bound.map((b) => b.tracked.processorId));
    const writes = this.deleteCursors(
      (row) =>
        row.factoryId === factoryId &&
        row.driveId === driveId &&
        !liveIds.has(row.processorId),
    );
    for (const { tracked } of bound) {
      writes.push(this.writeCursor(tracked, tracked));
    }

    const deliveries: Promise<void>[] = [];
    for (const { tracked, queue } of bound) {
      const missed =
        tracked.lastOrdinal < slot.reservedAt ||
        lowestRoutedOrdinal !== undefined;
      if (tracked.status === "active" && missed) {
        deliveries.push(queue.backfill());
      }
      const matching = creationItems?.filter((op) =>
        matchesFilter(op, tracked.record.filter),
      );
      if (matching && matching.length > 0) {
        deliveries.push(queue.live(matching));
      }
    }

    return {
      persisted: Promise.all(writes).then(() => undefined),
      delivered: Promise.all(deliveries).then(() => undefined),
    };
  }

  /** Synchronous: removes a factory's slots, processors and cursor rows. */
  protected removeFactory(identifier: string): Promise<void>[] {
    if (!this.factoryRegistry.delete(identifier)) return [];

    for (const slot of this.pendingSlots) {
      if (slot.factoryId === identifier) this.pendingSlots.delete(slot);
    }

    for (const [driveId, drive] of this.processorsByDrive) {
      const remaining: Bound[] = [];
      for (const b of drive) {
        if (b.tracked.factoryId === identifier) {
          // Not awaited: in-flight deliveries finish, then onDisconnect runs.
          void b.queue.close();
        } else {
          remaining.push(b);
        }
      }
      if (remaining.length > 0) {
        this.processorsByDrive.set(driveId, remaining);
      } else {
        this.processorsByDrive.delete(driveId);
      }
    }

    return this.deleteCursors((row) => row.factoryId === identifier);
  }

  private reserveSlot(
    factoryId: string,
    factory: ProcessorFactory,
    driveId: string,
    driveHeader: PHDocumentHeader,
    creationOrdinal: number,
    creationItems: OperationWithContext[] | undefined,
    awaitDelivery: boolean,
  ): { slot: PendingSlot; run: FactoryRun } {
    const slot: PendingSlot = {
      factoryId,
      driveId,
      reservedAt: this.highWater(),
      lowestRoutedOrdinal: undefined,
    };
    this.pendingSlots.add(slot);

    const run = async () => {
      const records = await this.runFactory(slot, factory, driveHeader);
      const { persisted, delivered } = this.bind(
        slot,
        records,
        creationOrdinal,
        creationItems,
      );
      await (awaitDelivery ? Promise.all([persisted, delivered]) : persisted);
    };

    return { slot, run };
  }

  private async runFactory(
    slot: PendingSlot,
    factory: ProcessorFactory,
    driveHeader: PHDocumentHeader,
  ): Promise<ProcessorRecord[]> {
    try {
      return await factory(driveHeader);
    } catch (error) {
      this.logger.error(
        "Factory '@FactoryId' failed for drive '@DriveId': @Error",
        slot.factoryId,
        slot.driveId,
        error,
      );
      return [];
    }
  }

  private track(
    slot: PendingSlot,
    record: ProcessorRecord,
    processorIndex: number,
    processorId: string,
    creationOrdinal: number,
    lowestRoutedOrdinal: number | undefined,
  ): Bound {
    const cached = this.cursorCache.get(processorId);
    let floor = 0;
    let cursor: ProcessorCursorState;
    if (cached) {
      cursor = {
        lastOrdinal: cached.lastOrdinal,
        status: cached.status as ProcessorCursorState["status"],
        lastError: cached.lastError ?? undefined,
        lastErrorTimestamp: cached.lastErrorTimestamp ?? undefined,
      };
    } else {
      if (record.startFrom === "current") floor = creationOrdinal - 1;
      cursor = {
        lastOrdinal: floor,
        status: "active",
        lastError: undefined,
        lastErrorTimestamp: undefined,
      };
    }
    if (lowestRoutedOrdinal !== undefined) {
      cursor.lastOrdinal = Math.max(
        floor,
        Math.min(cursor.lastOrdinal, lowestRoutedOrdinal - 1),
      );
    }

    const tracked: TrackedProcessor = {
      processorId,
      factoryId: slot.factoryId,
      driveId: slot.driveId,
      processorIndex,
      record,
      ...cursor,
      retry: () => queue.retry(),
    };
    const queue = new ProcessorQueue({
      processorId,
      processor: record.processor,
      filter: record.filter,
      cursor: tracked,
      floor,
      readSince: (ordinal) => this.operationIndex.getSinceOrdinal(ordinal),
      routedThrough: () => this.highWater(),
      persist: (state) => this.writeCursor(tracked, state),
      logger: this.logger,
    });
    return { tracked, queue };
  }

  private async discard(
    slot: PendingSlot,
    disconnect: () => Promise<void>,
  ): Promise<void> {
    try {
      await disconnect();
    } catch (error) {
      this.logger.error(
        "Error disconnecting discarded processor for '@FactoryId' on '@DriveId': @Error",
        slot.factoryId,
        slot.driveId,
        error,
      );
    }
  }

  private highWater(): number {
    return Math.max(this.lastOrdinal, this.highestRoutedOrdinal);
  }

  private *allBound(): Iterable<Bound> {
    for (const drive of this.processorsByDrive.values()) {
      yield* drive;
    }
  }

  private *allTrackedProcessors(): Iterable<TrackedProcessor> {
    for (const { tracked } of this.allBound()) {
      yield tracked;
    }
  }

  private isDriveCreation(op: OperationWithContext): boolean {
    return (
      op.operation.action.type === "CREATE_DOCUMENT" &&
      this.driveContainerTypes.has(op.context.documentType)
    );
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

  private async loadAllCursors(): Promise<void> {
    const rows = await this.db
      .selectFrom("ProcessorCursor")
      .selectAll()
      .execute();

    for (const row of rows) {
      this.cursorCache.set(row.processorId, row);
    }
  }

  private lane(
    processorId: string,
    write: () => Promise<unknown>,
  ): Promise<void> {
    const previous = this.cursorWrites.get(processorId) ?? Promise.resolve();
    const next = previous.then(write).then(
      () => undefined,
      (error: unknown) => {
        this.logger.error(
          "Failed to write cursor for '@ProcessorId': @Error",
          processorId,
          error,
        );
      },
    );
    this.cursorWrites.set(processorId, next);
    void next.then(() => {
      if (this.cursorWrites.get(processorId) === next) {
        this.cursorWrites.delete(processorId);
      }
    });
    return next;
  }

  private writeCursor(
    tracked: TrackedProcessor,
    state: ProcessorCursorState,
  ): Promise<void> {
    const now = new Date();
    const row: ProcessorCursorRow = {
      processorId: tracked.processorId,
      factoryId: tracked.factoryId,
      driveId: tracked.driveId,
      processorIndex: tracked.processorIndex,
      lastOrdinal: state.lastOrdinal,
      status: state.status,
      lastError: state.lastError ?? null,
      lastErrorTimestamp: state.lastErrorTimestamp ?? null,
      createdAt: now,
      updatedAt: now,
    };
    this.cursorCache.set(row.processorId, row);

    return this.lane(row.processorId, () =>
      this.db
        .insertInto("ProcessorCursor")
        .values({
          processorId: row.processorId,
          factoryId: row.factoryId,
          driveId: row.driveId,
          processorIndex: row.processorIndex,
          lastOrdinal: row.lastOrdinal,
          status: row.status,
          lastError: row.lastError,
          lastErrorTimestamp: row.lastErrorTimestamp,
          updatedAt: now,
        })
        .onConflict((oc) =>
          oc.column("processorId").doUpdateSet({
            lastOrdinal: row.lastOrdinal,
            status: row.status,
            lastError: row.lastError,
            lastErrorTimestamp: row.lastErrorTimestamp,
            updatedAt: now,
          }),
        )
        .execute(),
    );
  }

  private deleteCursors(
    matches: (row: ProcessorCursorRow) => boolean,
  ): Promise<void>[] {
    const deletes: Promise<void>[] = [];
    for (const [processorId, row] of this.cursorCache) {
      if (!matches(row)) continue;
      this.cursorCache.delete(processorId);
      deletes.push(
        this.lane(processorId, () =>
          this.db
            .deleteFrom("ProcessorCursor")
            .where("processorId", "=", processorId)
            .execute(),
        ),
      );
    }
    return deletes;
  }
}
