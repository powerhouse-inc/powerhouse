import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely, Transaction } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type {
  ConsistencyCoordinate,
  ConsistencyToken,
} from "../shared/types.js";
import type { IReadModel } from "./interfaces.js";
import type { DocumentViewDatabase } from "./types.js";

export type BaseReadModelConfig = {
  readModelId: string;
  rebuildStateOnInit: boolean;
};

/**
 * Base class for read models that provides catch-up/rewind functionality.
 * Handles initialization, state tracking via ViewState table, and consistency tracking.
 * Subclasses override commitOperations() with their specific domain logic.
 */
export class BaseReadModel implements IReadModel {
  protected lastOrdinal: number = 0;

  constructor(
    protected db: Kysely<DocumentViewDatabase>,
    protected operationIndex: IOperationIndex,
    protected writeCache: IWriteCache,
    protected consistencyTracker: IConsistencyTracker,
    protected config: BaseReadModelConfig,
  ) {}

  /**
   * Initializes the read model by loading state and catching up on missed operations.
   */
  async init(): Promise<void> {
    const viewState = await this.loadState();

    if (viewState !== undefined) {
      this.lastOrdinal = viewState;
      const missedOperations = await this.operationIndex.getSinceOrdinal(
        this.lastOrdinal,
      );

      if (missedOperations.results.length > 0) {
        const ops = this.config.rebuildStateOnInit
          ? await this.rebuildStateForOperations(missedOperations.results)
          : missedOperations.results;
        await this.indexOperations(ops);
      }
    } else {
      await this.initializeState();
      const allOperations = await this.operationIndex.getSinceOrdinal(0);

      if (allOperations.results.length > 0) {
        const ops = this.config.rebuildStateOnInit
          ? await this.rebuildStateForOperations(allOperations.results)
          : allOperations.results;
        await this.indexOperations(ops);
      }
    }
  }

  /**
   * Template method: runs domain-specific commitOperations, then persists
   * state and updates consistency tracking.
   */
  async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

    await this.commitOperations(items);

    await this.db.transaction().execute(async (trx) => {
      await this.saveState(trx, items);
    });

    this.updateConsistencyTracker(items);
  }

  /**
   * Waits for the read model to reach the specified consistency level.
   */
  async waitForConsistency(
    token: ConsistencyToken,
    timeoutMs?: number,
    signal?: AbortSignal,
  ): Promise<void> {
    if (token.coordinates.length === 0) {
      return;
    }
    await this.consistencyTracker.waitFor(token.coordinates, timeoutMs, signal);
  }

  // Subclass does domain-specific work here (snapshots, relationships, processor routing, etc.).
  protected async commitOperations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    items: OperationWithContext[],
  ): Promise<void> {}

  /**
   * Rebuilds document state for each operation using the write cache.
   */
  protected async rebuildStateForOperations(
    operations: OperationWithContext[],
  ): Promise<OperationWithContext[]> {
    const result: OperationWithContext[] = [];

    for (const op of operations) {
      const { documentId, scope, branch } = op.context;
      const targetRevision = op.operation.index;

      const document = await this.writeCache.getState(
        documentId,
        scope,
        branch,
        targetRevision,
      );

      result.push({
        operation: op.operation,
        context: {
          ...op.context,
          resultingState: JSON.stringify(document),
        },
      });
    }

    return result;
  }

  /**
   * Loads the last processed ordinal from the ViewState table.
   * Returns undefined if no state exists for this read model.
   */
  protected async loadState(): Promise<number | undefined> {
    const viewStateDb = this.db as unknown as Kysely<DocumentViewDatabase>;
    const row = await viewStateDb
      .selectFrom("ViewState")
      .select("lastOrdinal")
      .where("readModelId", "=", this.config.readModelId)
      .executeTakeFirst();

    return row?.lastOrdinal;
  }

  /**
   * Initializes the ViewState row for this read model.
   */
  protected async initializeState(): Promise<void> {
    const viewStateDb = this.db as unknown as Kysely<DocumentViewDatabase>;
    await viewStateDb
      .insertInto("ViewState")
      .values({
        readModelId: this.config.readModelId,
        lastOrdinal: 0,
      })
      .execute();
  }

  /**
   * Saves the last processed ordinal to the ViewState table.
   */
  protected async saveState(
    trx: Transaction<DocumentViewDatabase>,
    items: OperationWithContext[],
  ): Promise<void> {
    const maxOrdinal = Math.max(...items.map((item) => item.context.ordinal));
    this.lastOrdinal = maxOrdinal;

    await trx
      .updateTable("ViewState")
      .set({
        lastOrdinal: maxOrdinal,
        lastOperationTimestamp: new Date(),
      })
      .where("readModelId", "=", this.config.readModelId)
      .execute();
  }

  /**
   * Updates the consistency tracker with the processed operations.
   */
  protected updateConsistencyTracker(items: OperationWithContext[]): void {
    const coordinates: ConsistencyCoordinate[] = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i]!;
      coordinates.push({
        documentId: item.context.documentId,
        scope: item.context.scope,
        branch: item.context.branch,
        operationIndex: item.operation.index,
      });
    }

    this.consistencyTracker.update(coordinates);
  }
}
