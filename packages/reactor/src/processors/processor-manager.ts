import type { PHDocumentHeader } from "document-model";
import type { Kysely, Transaction } from "kysely";
import type { OperationWithContext } from "shared/document-model";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import { BaseReadModel } from "../read-models/base-read-model.js";
import type { DocumentViewDatabase } from "../read-models/types.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type {
  IProcessor,
  IProcessorManager,
  ProcessorFactory,
  ProcessorRecord,
} from "shared/processors";
import {
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
 */
export class ProcessorManager
  extends BaseReadModel
  implements IProcessorManager
{
  private factoryRegistry: Map<string, ProcessorFactory> = new Map();
  private processorsByDrive: Map<string, ProcessorRecord[]> = new Map();
  private factoryToProcessors: Map<string, Map<string, ProcessorRecord[]>> =
    new Map();
  private knownDriveIds: Set<string> = new Set();

  constructor(
    db: Kysely<DocumentViewDatabase>,
    operationIndex: IOperationIndex,
    writeCache: IWriteCache,
    consistencyTracker: IConsistencyTracker,
  ) {
    super(
      db,
      operationIndex,
      writeCache,
      consistencyTracker,
      "processor-manager",
    );
  }

  override async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

    await this.detectAndRegisterNewDrives(items);
    await this.detectAndCleanupDeletedDrives(items);
    await this.routeOperationsToProcessors(items);

    await this.db.transaction().execute(async (trx) => {
      await this.saveState(
        trx as unknown as Transaction<DocumentViewDatabase>,
        items,
      );
    });

    this.updateConsistencyTracker(items);
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

    for (const [driveId, records] of factoryProcessors) {
      for (const record of records) {
        await this.safeDisconnect(record.processor);
      }

      const driveProcessors = this.processorsByDrive.get(driveId);
      if (driveProcessors) {
        const remaining = driveProcessors.filter((p) => !records.includes(p));
        if (remaining.length > 0) {
          this.processorsByDrive.set(driveId, remaining);
        } else {
          this.processorsByDrive.delete(driveId);
        }
      }
    }

    this.factoryToProcessors.delete(identifier);
    this.factoryRegistry.delete(identifier);
  }

  getFactoryIdentifiers(): string[] {
    return Array.from(this.factoryRegistry.keys());
  }

  getProcessorsForDrive(driveId: string): ProcessorRecord[] {
    return this.processorsByDrive.get(driveId) ?? [];
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
      console.error(
        `ProcessorManager: Factory '${identifier}' failed for drive '${driveId}':`,
        error,
      );
      return;
    }

    if (records.length === 0) return;

    const factoryProcessors = this.factoryToProcessors.get(identifier);
    if (factoryProcessors) {
      factoryProcessors.set(driveId, records);
    }

    const existingDriveProcessors = this.processorsByDrive.get(driveId) ?? [];
    this.processorsByDrive.set(driveId, [
      ...existingDriveProcessors,
      ...records,
    ]);
  }

  private async cleanupDriveProcessors(driveId: string): Promise<void> {
    const processors = this.processorsByDrive.get(driveId);
    if (!processors) return;

    for (const record of processors) {
      await this.safeDisconnect(record.processor);
    }

    this.processorsByDrive.delete(driveId);

    for (const factoryProcessors of this.factoryToProcessors.values()) {
      factoryProcessors.delete(driveId);
    }
  }

  private async safeDisconnect(processor: IProcessor): Promise<void> {
    try {
      await processor.onDisconnect();
    } catch (error) {
      console.error("ProcessorManager: Error disconnecting processor:", error);
    }
  }

  private async routeOperationsToProcessors(
    operations: OperationWithContext[],
  ): Promise<void> {
    const processorOperations = new Map<IProcessor, OperationWithContext[]>();

    for (const [, records] of this.processorsByDrive) {
      for (const { processor, filter } of records) {
        const matching = operations.filter((op) => matchesFilter(op, filter));

        if (matching.length === 0) continue;

        const existing = processorOperations.get(processor) ?? [];
        processorOperations.set(processor, [...existing, ...matching]);
      }
    }

    await Promise.all(
      Array.from(processorOperations.entries()).map(
        async ([processor, ops]) => {
          try {
            await processor.onOperations(ops);
          } catch (error) {
            console.error(
              "ProcessorManager: Error in processor.onOperations:",
              error,
            );
          }
        },
      ),
    );
  }
}
