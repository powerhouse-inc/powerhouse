import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  IProcessorManager,
  ProcessorFactory,
  ProcessorRecord,
  TrackedProcessor,
} from "@powerhousedao/shared/processors";
import type { PHDocumentHeader } from "document-model";
import type { Kysely } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { ILogger } from "../logging/types.js";
import { BaseReadModel } from "../read-models/base-read-model.js";
import type {
  DocumentViewDatabase,
  ProcessorCursorRow,
} from "../read-models/types.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import {
  DRIVE_DOCUMENT_TYPE,
  createMinimalDriveHeader,
  extractDeletedDocumentId,
  extractDriveHeader,
  isDriveCreation,
  isDriveDeletion,
  matchesFilter,
} from "./utils.js";

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
  private knownDriveIds: Set<string> = new Set();
  private cursorCache: Map<string, ProcessorCursorRow> = new Map();
  private logger: ILogger;

  constructor(
    db: Kysely<DocumentViewDatabase>,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
    logger: ILogger,
  ) {
    super(db, operationIndex, writeCache, consistencyTracker, {
      readModelId: "processor-manager",
      rebuildStateOnInit: true,
    });
    this.logger = logger;
  }

  override async init(): Promise<void> {
    await super.init();
    await this.loadAllCursors();
    await this.discoverExistingDrives();
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
    if (this.factoryRegistry.has(identifier)) {
      await this.unregisterFactory(identifier);
    }

    this.factoryRegistry.set(identifier, factory);
    this.factoryToProcessors.set(identifier, new Map());

    for (const driveId of this.knownDriveIds) {
      const driveHeader = createMinimalDriveHeader(driveId);
      await this.createProcessorsForDrive(
        driveId,
        identifier,
        factory,
        driveHeader,
      );
    }
  }

  async unregisterFactory(identifier: string): Promise<void> {
    const factoryProcessors = this.factoryToProcessors.get(identifier);
    if (!factoryProcessors) return;

    for (const [driveId, tracked] of factoryProcessors) {
      for (const t of tracked) {
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
      if (!isDriveCreation(op)) continue;

      const driveId = op.context.documentId;
      if (this.knownDriveIds.has(driveId)) continue;

      this.knownDriveIds.add(driveId);

      const driveHeader = extractDriveHeader(op);
      if (!driveHeader) continue;

      for (const [identifier, factory] of this.factoryRegistry) {
        await this.createProcessorsForDrive(
          driveId,
          identifier,
          factory,
          driveHeader,
        );
      }
    }
  }

  private async detectAndCleanupDeletedDrives(
    operations: OperationWithContext[],
  ): Promise<void> {
    for (const op of operations) {
      if (!isDriveDeletion(op)) continue;

      const driveId = extractDeletedDocumentId(op);
      if (!driveId || !this.knownDriveIds.has(driveId)) continue;

      if (!this.isDeletedDocumentADrive(driveId)) continue;

      await this.cleanupDriveProcessors(driveId);
      this.knownDriveIds.delete(driveId);
    }
  }

  private async discoverExistingDrives(): Promise<void> {
    const drives = await this.db
      .selectFrom("DocumentSnapshot")
      .select("documentId")
      .where("documentType", "=", DRIVE_DOCUMENT_TYPE)
      .where("isDeleted", "=", false)
      .execute();

    for (const drive of drives) {
      this.knownDriveIds.add(drive.documentId);
    }
  }

  private isDeletedDocumentADrive(documentId: string): boolean {
    return this.knownDriveIds.has(documentId);
  }

  private async createProcessorsForDrive(
    driveId: string,
    identifier: string,
    factory: ProcessorFactory,
    driveHeader: PHDocumentHeader,
  ): Promise<void> {
    let records: ProcessorRecord[] = [];

    try {
      records = await factory(driveHeader);
    } catch (error) {
      this.logger.error(
        "Factory '@FactoryId' failed for drive '@DriveId': @Error",
        identifier,
        driveId,
        error,
      );
      return;
    }

    if (records.length === 0) return;

    const trackedList: TrackedProcessor[] = [];

    for (let i = 0; i < records.length; i++) {
      const record = records[i]!;
      const processorId = `${identifier}:${driveId}:${i}`;

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
        lastOrdinal = startFrom === "current" ? this.lastOrdinal : 0;
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

      await this.saveProcessorCursor(tracked);
    }

    // Clean up orphaned cursor rows from previous runs with more processors
    await this.db
      .deleteFrom("ProcessorCursor")
      .where("factoryId", "=", identifier)
      .where("driveId", "=", driveId)
      .where("processorIndex", ">=", records.length)
      .execute();

    for (const [id, row] of this.cursorCache) {
      if (
        row.factoryId === identifier &&
        row.driveId === driveId &&
        row.processorIndex >= records.length
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

    for (const tracked of trackedList) {
      if (
        tracked.status === "active" &&
        tracked.lastOrdinal < this.lastOrdinal
      ) {
        await this.backfillProcessor(tracked);
      }
    }
  }

  private async backfillProcessor(tracked: TrackedProcessor): Promise<void> {
    let page = await this.operationIndex.getSinceOrdinal(tracked.lastOrdinal);

    while (page.results.length > 0) {
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

      const maxOrdinal = Math.max(
        ...page.results.map((op) => op.context.ordinal),
      );
      tracked.lastOrdinal = maxOrdinal;
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
    await this.saveProcessorCursor(tracked);
    await this.backfillProcessor(tracked);
  }

  private async cleanupDriveProcessors(driveId: string): Promise<void> {
    const processors = this.processorsByDrive.get(driveId);
    if (!processors) return;

    for (const tracked of processors) {
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
      await processor.onDisconnect();
    } catch (error) {
      this.logger.error("Error disconnecting processor: @Error", error);
    }
  }

  private async routeOperationsToProcessors(
    operations: OperationWithContext[],
  ): Promise<void> {
    const maxOrdinal = Math.max(...operations.map((op) => op.context.ordinal));
    const allTracked = Array.from(this.allTrackedProcessors());

    await Promise.all(
      allTracked.map(async (tracked) => {
        if (tracked.status !== "active") return;

        const unseen = operations.filter(
          (op) => op.context.ordinal > tracked.lastOrdinal,
        );
        const matching = unseen.filter((op) =>
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
              "Processor '@ProcessorId' failed at ordinal @Ordinal: @Error",
              tracked.processorId,
              tracked.lastOrdinal,
              error,
            );
            return;
          }
        }

        tracked.lastOrdinal = maxOrdinal;
        await this.safeSaveProcessorCursor(tracked);
      }),
    );
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
