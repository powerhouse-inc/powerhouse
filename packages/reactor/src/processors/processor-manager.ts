import {
  isPurgeMarker,
  type OperationWithContext,
  type PHDocumentHeader,
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
import {
  RELEASED_CURSOR_STATUS,
  type DocumentViewDatabase,
  type ProcessorCursorRow,
} from "../read-models/types.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import { findPurged } from "../storage/kysely/document-purges.js";
import {
  ProcessorQueue,
  purgeCandidates,
  type LiveCheck,
  type ProcessorCursorState,
} from "./processor-queue.js";
import {
  createMinimalDriveHeader,
  extractCreationHeader,
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
  // Resolves once the factory call is bound or its records discarded.
  settled: Promise<void> | undefined;
};

type Bound = { tracked: TrackedProcessor; queue: ProcessorQueue };

type FactoryRun = () => Promise<void>;

/** What a cursor row write needs of its processor. */
type CursorOwner = Pick<
  TrackedProcessor,
  "processorId" | "factoryId" | "driveId" | "processorIndex" | "lastOrdinal"
>;

/** Drives a batch deletes, each with its first deletion in the batch. */
type DriveDeletions = ReadonlyMap<string, OperationWithContext>;

const DRIVE_STREAM_PAGE = 500;

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
  // lastOrdinal each processor's row holds, as this process last read or wrote it.
  private persistedOrdinals: Map<string, number> = new Map();
  private advancing: Promise<void> = Promise.resolve();
  // Serializes every cursor row write per processor id.
  private cursorWrites: Map<string, Promise<void>> = new Map();
  // Removed processors per factory id, until each has disconnected.
  private draining: Map<string, Promise<void>> = new Map();
  // Deleted drives some cursor row still owes the deletion, with that deletion.
  private deletedDrives: Map<string, OperationWithContext> = new Map();
  // Deletions in delivery per factory id, until each processor has disconnected.
  private erasures: Map<string, Promise<void>> = new Map();
  // factoryId:driveId pairs whose owed deletion is being delivered.
  private erasing: Set<string> = new Set();
  // Creation headers of known and owed drives; a purge drops a drive's.
  private driveHeaders: Map<string, PHDocumentHeader> = new Map();
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
      // A lock held across processor delivery would block purges behind it.
      purgeFence: "none",
    });
    this.logger = logger;
    this.driveContainerTypes = driveContainerTypes;
    this.legacyProcessorIds = options.legacyProcessorIds ?? true;
  }

  override async init(): Promise<void> {
    await this.loadAllCursors();
    await super.init();
    await this.discoverExistingDrives();
    await this.discoverDeletedDrives();
    // Not awaited: a hung processor must not hold the reactor's start.
    for (const [identifier, factory] of this.factoryRegistry) {
      this.eraseOwed(identifier, factory);
    }
  }

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    const { runs, reserved } = this.detectNewDrives(items);
    const deletions = this.findDriveDeletions(items);
    const deliveries = this.enqueueRouted(items, reserved, deletions);
    this.detectDeletedDrives(items);
    this.forgetPurgedHeaders(items);

    await Promise.all([...runs.map((run) => run()), ...deliveries]);
  }

  async registerFactory(
    identifier: string,
    factory: ProcessorFactory,
  ): Promise<void> {
    const removals = this.removeFactory(identifier);
    this.factoryRegistry.set(identifier, factory);
    const previous = this.draining.get(identifier);

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
          this.headerOf(driveId, documentType),
          creationOrdinal,
          undefined,
          false,
          previous,
        ).run,
      );
    }

    // Not awaited, like a live deletion: tracked for the next (un)registration.
    this.eraseOwed(identifier, factory, previous);
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
      this.driveHeaders.set(driveId, driveHeader);

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

  /** Synchronous: drops a deleted drive's processors; their rows stay owed. */
  protected detectDeletedDrives(items: OperationWithContext[]): void {
    for (const op of items) {
      if (!isDriveDeletion(op)) continue;

      const driveId = extractDeletedDocumentId(op);
      if (!driveId || !this.knownDrives.has(driveId)) continue;
      this.knownDrives.delete(driveId);
      // Rows without a live processor are paid when their factory next runs.
      this.deletedDrives.set(driveId, op);

      for (const slot of this.pendingSlots) {
        if (slot.driveId === driveId) this.pendingSlots.delete(slot);
      }

      for (const { tracked, queue } of this.processorsByDrive.get(driveId) ??
        []) {
        // Not awaited: the pass must not wait out the drive's queues.
        this.trackErasure(tracked.factoryId, queue.close());
      }
      this.processorsByDrive.delete(driveId);
      this.pruneDeletedDrive(driveId);
    }
  }

  /** Synchronous: a purged drive's header is erased data. */
  private forgetPurgedHeaders(items: OperationWithContext[]): void {
    for (const op of items) {
      if (isPurgeMarker(op.operation)) {
        this.driveHeaders.delete(op.context.documentId);
      }
    }
  }

  /** A drive's creation header; minimal once the drive's stream is purged. */
  private async headerOf(
    driveId: string,
    documentType: string,
  ): Promise<PHDocumentHeader> {
    const cached = this.driveHeaders.get(driveId);
    if (cached) return cached;
    let first: OperationWithContext | undefined;
    try {
      [first] = await this.operationIndex.getStreamAfter(
        { documentId: driveId, scope: "document", branch: "main" },
        0,
        undefined,
        1,
      );
    } catch (error) {
      this.logger.error(
        "Failed reading drive '@DriveId' header: @Error",
        driveId,
        error,
      );
    }
    const header = first && extractCreationHeader(first);
    if (!header) return createMinimalDriveHeader(driveId, documentType);
    this.driveHeaders.set(driveId, header);
    return header;
  }

  /** Synchronous: the known drives this batch deletes. */
  protected findDriveDeletions(items: OperationWithContext[]): DriveDeletions {
    const deletions = new Map<string, OperationWithContext>();
    for (const op of items) {
      if (!isDriveDeletion(op)) continue;
      const driveId = extractDeletedDocumentId(op);
      if (!driveId || !this.knownDrives.has(driveId)) continue;
      const first = deletions.get(driveId);
      if (!first || op.context.ordinal < first.context.ordinal) {
        deletions.set(driveId, op);
      }
    }
    return deletions;
  }

  /** Synchronous: puts each processor's share of the batch on its queue. */
  protected enqueueRouted(
    items: OperationWithContext[],
    reserved: ReadonlySet<PendingSlot>,
    deletions: DriveDeletions = new Map(),
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

    let check: LiveCheck | undefined;
    const checkOf = () => (check ??= this.checkPurged(items));

    const deliveries: Promise<void>[] = [];
    for (const { tracked, queue } of this.allBound()) {
      const deletion = deletions.get(tracked.driveId);
      if (deletion) {
        deliveries.push(
          this.deliverDeletion(tracked, queue, items, deletion, checkOf()),
        );
        continue;
      }
      const matching = items.filter((op) =>
        matchesFilter(op, tracked.record.filter),
      );
      if (matching.length > 0) {
        deliveries.push(queue.live(matching, checkOf()));
      } else {
        // Not awaited: the pass waits only on processors it delivers to.
        void queue.advance(highest);
      }
    }
    return deliveries;
  }

  // The batch through the deletion, then the deletion whatever the filter.
  private deliverDeletion(
    tracked: TrackedProcessor,
    queue: ProcessorQueue,
    items: OperationWithContext[],
    deletion: OperationWithContext,
    check: LiveCheck,
  ): Promise<void> {
    const through = deletion.context.ordinal;
    const share = items.filter(
      (op) =>
        op.context.ordinal < through &&
        matchesFilter(op, tracked.record.filter),
    );
    // Like live(): a pass never waits out a backfill; the row holds meanwhile.
    const behindReplay = queue.replaying;
    const settled = queue
      .erase(share, deletion, check)
      .then((delivered) => this.settleErased(tracked, delivered, deletion));
    this.trackErasure(tracked.factoryId, settled);
    return behindReplay ? Promise.resolve() : settled;
  }

  /** A delivered deletion deletes the row; a failed one keeps it, errored. */
  private settleErased(
    tracked: TrackedProcessor,
    delivered: boolean,
    deletion: OperationWithContext,
  ): Promise<void> {
    if (!delivered) {
      this.deletedDrives.set(tracked.driveId, deletion);
      return this.writeCursor(tracked, tracked);
    }
    const deleted = this.deleteCursors(
      (row) => row.processorId === tracked.processorId,
    );
    this.pruneDeletedDrive(tracked.driveId);
    return Promise.all(deleted).then(() => undefined);
  }

  /** Forgets a deleted drive once no cursor row owes its deletion. */
  private pruneDeletedDrive(driveId: string): void {
    for (const row of this.cursorCache.values()) {
      if (row.driveId === driveId) return;
    }
    this.deletedDrives.delete(driveId);
    if (!this.knownDrives.has(driveId)) this.driveHeaders.delete(driveId);
  }

  /** Delivers each deleted drive's deletion its rows of `factoryId` still owe. */
  private eraseOwed(
    factoryId: string,
    factory: ProcessorFactory,
    previous?: Promise<void>,
  ): void {
    const owesAny = [...this.cursorCache.values()].some(
      (row) =>
        row.factoryId === factoryId && this.deletedDrives.has(row.driveId),
    );
    if (!owesAny) return;

    const erasure = (async () => {
      // A re-registered factory starts once its previous instance is gone.
      await previous;
      if (this.factoryRegistry.get(factoryId) !== factory) return;
      const owed = new Map<string, OperationWithContext>();
      for (const row of this.cursorCache.values()) {
        const deletion = this.deletedDrives.get(row.driveId);
        if (row.factoryId === factoryId && deletion) {
          owed.set(row.driveId, deletion);
        }
      }
      await Promise.all(
        [...owed].map(([driveId, deletion]) =>
          this.eraseDrive(factoryId, factory, driveId, deletion),
        ),
      );
    })().catch((error: unknown) => {
      this.logger.error(
        "Owed deletions of '@FactoryId' failed: @Error",
        factoryId,
        error,
      );
    });
    this.trackErasure(factoryId, erasure);
  }

  /** A re-registration or unregistration of `factoryId` waits for `erasure`. */
  private trackErasure(factoryId: string, erasure: Promise<void>): void {
    const tracked = Promise.all([this.erasures.get(factoryId), erasure]).then(
      () => undefined,
    );
    this.erasures.set(factoryId, tracked);
    void tracked.then(() => {
      if (this.erasures.get(factoryId) === tracked) {
        this.erasures.delete(factoryId);
      }
    });
  }

  /** Runs `erase` unless the pair's deletion is already being delivered. */
  private async claimErasure(
    factoryId: string,
    driveId: string,
    erase: () => Promise<void>,
  ): Promise<boolean> {
    const key = `${factoryId}:${driveId}`;
    if (this.erasing.has(key)) return false;
    this.erasing.add(key);
    try {
      await erase();
    } finally {
      this.erasing.delete(key);
    }
    return true;
  }

  private async eraseDrive(
    factoryId: string,
    factory: ProcessorFactory,
    driveId: string,
    deletion: OperationWithContext,
  ): Promise<void> {
    await this.claimErasure(factoryId, driveId, async () => {
      const header = await this.headerOf(
        driveId,
        deletion.context.documentType,
      );
      const slot = { factoryId, driveId };
      const records = await this.runFactory(slot, factory, header);
      // A failed run leaves the rows owed until the factory runs again.
      if (!records) return;
      await this.eraseRecords(factoryId, driveId, deletion, records);
    });
  }

  /** The deletion to each record a row owes it to, then every disconnect. */
  private async eraseRecords(
    factoryId: string,
    driveId: string,
    deletion: OperationWithContext,
    records: ProcessorRecord[],
  ): Promise<void> {
    const ids = resolveProcessorSlots(records, this.legacyProcessorIds);
    const delivered = new Set<string>();
    const failed = new Map<string, unknown>();
    await Promise.all(
      records.map(async (record, i) => {
        const processorId = `${factoryId}:${driveId}:${ids[i]}`;
        if (this.cursorCache.has(processorId)) {
          try {
            await record.processor.onOperations([deletion]);
            delivered.add(processorId);
          } catch (error) {
            failed.set(processorId, error);
            this.logger.error(
              "Processor '@ProcessorId' failed on its drive's deletion: @Error",
              processorId,
              error,
            );
          }
        }
        await this.discard(
          { factoryId, driveId },
          record.processor.onDisconnect.bind(record.processor),
        );
      }),
    );

    const writes: Promise<void>[] = [];
    for (const row of this.cursorCache.values()) {
      if (row.factoryId !== factoryId || row.driveId !== driveId) continue;
      if (delivered.has(row.processorId)) continue;
      if (!failed.has(row.processorId)) {
        // A run that threw inside a wrapper reads as no records: stay owed.
        this.logger.warn(
          "Factory '@FactoryId' made no processor '@ProcessorId' for deleted drive '@DriveId'; its deletion stays owed",
          factoryId,
          row.processorId,
          driveId,
        );
        continue;
      }
      const error = failed.get(row.processorId);
      writes.push(
        this.writeCursor(row, {
          lastOrdinal: row.lastOrdinal,
          status: "errored",
          lastError: error instanceof Error ? error.message : String(error),
          lastErrorTimestamp: new Date(),
        }),
      );
    }
    writes.push(...this.deleteCursors((row) => delivered.has(row.processorId)));
    this.pruneDeletedDrive(driveId);
    await Promise.all(writes);
  }

  /** Started at routing; takes no purge lock, since processors hold none. */
  private checkPurged(items: OperationWithContext[]): LiveCheck {
    const ids = purgeCandidates(items);
    const purged =
      ids.length === 0
        ? Promise.resolve<ReadonlySet<string>>(new Set())
        : findPurged(this.db, ids);
    // Observed here: a closed queue drops the task that would await it.
    purged.catch(() => undefined);
    return { purged };
  }

  /** Synchronous: binds records, or discards them if the slot was cancelled. */
  protected bind(
    slot: PendingSlot,
    records: ProcessorRecord[] | undefined,
    creationOrdinal: number,
    creationItems: OperationWithContext[] | undefined,
  ): { persisted: Promise<void>; delivered: Promise<void> } {
    const released = this.pendingSlots.delete(slot);
    // A failed or empty run leaves the factory's cursors for the drive alone.
    if (!records || records.length === 0) {
      const settled = Promise.resolve();
      return { persisted: settled, delivered: settled };
    }
    if (!released) {
      const settled = this.discardRecords(slot, records);
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
        deliveries.push(queue.live(matching, this.checkPurged(matching)));
      }
    }

    return {
      persisted: Promise.all(writes).then(() => undefined),
      delivered: Promise.all(deliveries).then(() => undefined),
    };
  }

  /** A cancelled slot's records; on a deleted drive they pay what rows owe. */
  private async discardRecords(
    slot: PendingSlot,
    records: ProcessorRecord[],
  ): Promise<void> {
    const { factoryId, driveId } = slot;
    const deletion = this.deletedDrives.get(driveId);
    const erased =
      deletion !== undefined &&
      (await this.claimErasure(factoryId, driveId, () =>
        this.eraseRecords(factoryId, driveId, deletion, records),
      ));
    if (erased) return;
    await Promise.all(
      records.map((record) =>
        this.discard(
          slot,
          record.processor.onDisconnect.bind(record.processor),
        ),
      ),
    );
  }

  /** Synchronous: removes a factory's slots and processors; releases its rows. */
  protected removeFactory(identifier: string): Promise<void>[] {
    if (!this.factoryRegistry.delete(identifier)) return [];

    const closing: Promise<void>[] = [];
    const erasure = this.erasures.get(identifier);
    if (erasure) closing.push(erasure);
    for (const slot of this.pendingSlots) {
      if (slot.factoryId !== identifier) continue;
      this.pendingSlots.delete(slot);
      if (slot.settled) closing.push(slot.settled);
    }

    for (const [driveId, drive] of this.processorsByDrive) {
      const remaining: Bound[] = [];
      for (const b of drive) {
        if (b.tracked.factoryId === identifier) {
          closing.push(b.queue.close());
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

    if (closing.length > 0) {
      const drained = Promise.all([
        this.draining.get(identifier),
        ...closing,
      ]).then(() => undefined);
      this.draining.set(identifier, drained);
      void drained.then(() => {
        if (this.draining.get(identifier) === drained) {
          this.draining.delete(identifier);
        }
      });
    }

    return this.releaseCursors(identifier);
  }

  // A drive deleted before the factory's next registration still owes its rows.
  private releaseCursors(factoryId: string): Promise<void>[] {
    const writes: Promise<void>[] = [];
    for (const row of this.cursorCache.values()) {
      if (row.factoryId !== factoryId) continue;
      if (row.status === RELEASED_CURSOR_STATUS) continue;
      if (this.deletedDrives.has(row.driveId)) continue;
      const released = { ...row, status: RELEASED_CURSOR_STATUS };
      this.cursorCache.set(row.processorId, released);
      writes.push(
        this.lane(row.processorId, () =>
          this.db
            .updateTable("ProcessorCursor")
            .set({ status: RELEASED_CURSOR_STATUS, updatedAt: new Date() })
            .where("processorId", "=", row.processorId)
            .execute(),
        ),
      );
    }
    return writes;
  }

  private reserveSlot(
    factoryId: string,
    factory: ProcessorFactory,
    driveId: string,
    driveHeader: PHDocumentHeader | Promise<PHDocumentHeader>,
    creationOrdinal: number,
    creationItems: OperationWithContext[] | undefined,
    awaitDelivery: boolean,
    previous?: Promise<void>,
  ): { slot: PendingSlot; run: FactoryRun } {
    const slot: PendingSlot = {
      factoryId,
      driveId,
      reservedAt: this.highWater(),
      lowestRoutedOrdinal: undefined,
      settled: undefined,
    };
    this.pendingSlots.add(slot);

    const run = async () => {
      const bound = (async () => {
        // A re-registered factory starts once its previous instance is gone.
        await previous;
        const header = await driveHeader;
        const records = await this.runFactory(slot, factory, header);
        return this.bind(slot, records, creationOrdinal, creationItems);
      })();
      slot.settled = bound.then(({ persisted }) => persisted);
      const { persisted, delivered } = await bound;
      await (awaitDelivery ? Promise.all([persisted, delivered]) : persisted);
    };

    return { slot, run };
  }

  private async runFactory(
    slot: Pick<PendingSlot, "factoryId" | "driveId">,
    factory: ProcessorFactory,
    driveHeader: PHDocumentHeader,
  ): Promise<ProcessorRecord[] | undefined> {
    try {
      return await factory(driveHeader);
    } catch (error) {
      this.logger.error(
        "Factory '@FactoryId' failed for drive '@DriveId': @Error",
        slot.factoryId,
        slot.driveId,
        error,
      );
      return undefined;
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
    // A released row starts the processor afresh, as if it had none.
    if (cached && cached.status !== RELEASED_CURSOR_STATUS) {
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
      confirmedThrough: () => this.lastOrdinal,
      persist: (state) => this.writeCursor(tracked, state),
      purged: (ids) => findPurged(this.db, ids),
      logger: this.logger,
    });
    return { tracked, queue };
  }

  /** Resolves once every queue has taken the latest cursor advance. */
  whenCursorsAdvanced(): Promise<void> {
    return this.advancing;
  }

  /** Every bound processor may now move up to the manager's cursor. */
  protected override onCursorAdvanced(appliedThrough: number): void {
    const advances: Promise<void>[] = [];
    for (const { queue } of this.allBound()) {
      advances.push(queue.advance(appliedThrough));
    }
    this.advancing = Promise.all(advances).then(() => undefined);
  }

  private async discard(
    slot: Pick<PendingSlot, "factoryId" | "driveId">,
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

  /** Cursor rows of a drive that is gone: find the deletion they still owe. */
  private async discoverDeletedDrives(): Promise<void> {
    const driveIds = new Set<string>();
    for (const row of this.cursorCache.values()) {
      if (!this.knownDrives.has(row.driveId)) driveIds.add(row.driveId);
    }
    for (const driveId of driveIds) {
      try {
        await this.discoverDeletedDrive(driveId);
      } catch (error) {
        this.logger.error(
          "Failed reading deleted drive '@DriveId': @Error",
          driveId,
          error,
        );
      }
    }
  }

  private async discoverDeletedDrive(driveId: string): Promise<void> {
    const key = { documentId: driveId, scope: "document", branch: "main" };
    let header: PHDocumentHeader | undefined;
    let deletion: OperationWithContext | undefined;
    let after = 0;
    for (;;) {
      const page = await this.operationIndex.getStreamAfter(
        key,
        after,
        undefined,
        DRIVE_STREAM_PAGE,
      );
      for (const op of page) {
        header ??= extractCreationHeader(op);
        if (
          !deletion &&
          isDriveDeletion(op) &&
          extractDeletedDocumentId(op) === driveId
        ) {
          deletion = op;
        }
      }
      if (page.length < DRIVE_STREAM_PAGE) break;
      after = page.at(-1)!.context.ordinal;
    }
    if (!deletion) return;
    this.deletedDrives.set(driveId, deletion);
    if (header) this.driveHeaders.set(driveId, header);
  }

  private async loadAllCursors(): Promise<void> {
    const rows = await this.db
      .selectFrom("ProcessorCursor")
      .selectAll()
      .execute();

    for (const row of rows) {
      this.cursorCache.set(row.processorId, row);
      this.persistedOrdinals.set(row.processorId, row.lastOrdinal);
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
    tracked: CursorOwner,
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

    return this.lane(row.processorId, async () => {
      const expected = this.persistedOrdinals.get(row.processorId);
      if (expected === undefined) {
        await this.insertCursor(row, now);
        return;
      }
      const result = await this.db
        .updateTable("ProcessorCursor")
        .set({
          lastOrdinal: row.lastOrdinal,
          status: row.status,
          lastError: row.lastError,
          lastErrorTimestamp: row.lastErrorTimestamp,
          updatedAt: now,
        })
        .where("processorId", "=", row.processorId)
        .where("lastOrdinal", "=", expected)
        .executeTakeFirst();
      if (Number(result.numUpdatedRows) > 0) {
        this.persistedOrdinals.set(row.processorId, row.lastOrdinal);
        return;
      }
      await this.reconcileCursor(tracked, row, now);
    });
  }

  private async insertCursor(
    row: ProcessorCursorRow,
    now: Date,
  ): Promise<void> {
    await this.db
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
      .execute();
    this.persistedOrdinals.set(row.processorId, row.lastOrdinal);
  }

  /** A failed compare-and-set: a lowered row resets the cursor and backfills. */
  private async reconcileCursor(
    tracked: CursorOwner,
    row: ProcessorCursorRow,
    now: Date,
  ): Promise<void> {
    const stored = await this.db
      .selectFrom("ProcessorCursor")
      .select("lastOrdinal")
      .where("processorId", "=", row.processorId)
      .executeTakeFirst();
    if (stored === undefined) {
      await this.insertCursor(row, now);
      return;
    }
    this.persistedOrdinals.set(row.processorId, stored.lastOrdinal);
    if (stored.lastOrdinal >= row.lastOrdinal) return;

    this.logger.info(
      "Processor '@ProcessorId' cursor lowered externally from @Old to @New; replaying",
      row.processorId,
      row.lastOrdinal,
      stored.lastOrdinal,
    );
    tracked.lastOrdinal = stored.lastOrdinal;
    row.lastOrdinal = stored.lastOrdinal;
    for (const bound of this.allBound()) {
      if (bound.tracked.processorId === row.processorId) {
        void bound.queue.backfill();
      }
    }
  }

  private deleteCursors(
    matches: (row: ProcessorCursorRow) => boolean,
  ): Promise<void>[] {
    const deletes: Promise<void>[] = [];
    for (const [processorId, row] of this.cursorCache) {
      if (!matches(row)) continue;
      this.cursorCache.delete(processorId);
      this.persistedOrdinals.delete(processorId);
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
