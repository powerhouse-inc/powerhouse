import type { Kysely, Transaction } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type {
  ConsistencyCoordinate,
  ConsistencyToken,
} from "../shared/types.js";
import type { OperationWithContext } from "../storage/interfaces.js";
import type { IReadModel } from "./interfaces.js";
import type { DocumentViewDatabase } from "./types.js";

/**
 * Base class for read models that provides catch-up/rewind functionality.
 * Handles initialization, state tracking via ViewState table, and consistency tracking.
 * Subclasses should override indexOperations() with their specific indexing logic.
 */
export class BaseReadModel implements IReadModel {
  protected lastOrdinal: number = 0;

  constructor(
    protected db: Kysely<DocumentViewDatabase>,
    protected operationIndex: IOperationIndex,
    protected writeCache: IWriteCache,
    protected consistencyTracker: IConsistencyTracker,
    protected readModelId: string,
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
        const opsWithState = await this.rebuildStateForOperations(
          missedOperations.results,
        );
        await this.indexOperations(opsWithState);
      }
    } else {
      await this.initializeState();
      const allOperations = await this.operationIndex.getSinceOrdinal(0);

      if (allOperations.results.length > 0) {
        const opsWithState = await this.rebuildStateForOperations(
          allOperations.results,
        );
        await this.indexOperations(opsWithState);
      }
    }
  }

  /**
   * Indexes operations into the read model.
   * Subclasses should override this method to implement their specific indexing logic.
   * The overriding method should call saveState() and updateConsistencyTracker() at the end.
   */
  async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

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
      .where("readModelId", "=", this.readModelId)
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
        readModelId: this.readModelId,
        lastOrdinal: 0,
      })
      .execute();
  }

  /**
   * Saves the last processed ordinal to the ViewState table.
   * Should be called at the end of indexOperations() within a transaction.
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
      .where("readModelId", "=", this.readModelId)
      .execute();
  }

  /**
   * Updates the consistency tracker with the processed operations.
   * Should be called at the end of indexOperations() after the transaction commits.
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
