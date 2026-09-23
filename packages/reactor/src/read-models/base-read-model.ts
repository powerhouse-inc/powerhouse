import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type { Kysely, Transaction } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import type { PurgeDirective, PurgeOutcome } from "../shared/purge-types.js";
import { findPurgedIds } from "../storage/kysely/document-purge-gate.js";
import {
  readPurgeJournal,
  type PurgeJournalEntry,
} from "../storage/kysely/document-purger.js";
import type {
  ConsistencyCoordinate,
  ConsistencyToken,
} from "../shared/types.js";
import { yieldToMain } from "../shared/utils.js";
import type { IPurgeJournalReadModel } from "./interfaces.js";
import type { DocumentViewDatabase } from "./types.js";

/** Bounds on an indexing pass: one transaction, and the stall between yields. */
export type ReadModelIndexingConfig = {
  /** Maximum operations committed in a single transaction. */
  commitChunkSize: number;
  /** Maximum elapsed milliseconds before yielding between chunks. */
  yieldDeadlineMs: number;
};

/** Small enough that a chunk's transaction rarely outlasts the yield deadline. */
export const DEFAULT_COMMIT_CHUNK_SIZE = 50;

/** Matches the executor's own default, so both paths yield on the same cadence. */
export const DEFAULT_READ_MODEL_YIELD_DEADLINE_MS = 50;

export const defaultReadModelIndexingConfig: ReadModelIndexingConfig = {
  commitChunkSize: DEFAULT_COMMIT_CHUNK_SIZE,
  yieldDeadlineMs: DEFAULT_READ_MODEL_YIELD_DEADLINE_MS,
};

/** For read models whose callers can observe where a batch was split. */
export const unchunkedReadModelIndexingConfig: ReadModelIndexingConfig = {
  commitChunkSize: Number.MAX_SAFE_INTEGER,
  yieldDeadlineMs: DEFAULT_READ_MODEL_YIELD_DEADLINE_MS,
};

/**
 * Keeps the chunk size at one operation or more: a chunk of zero or less never
 * advances the indexing loop, so the pass would spin without ever resolving.
 */
function normalizeIndexingConfig(
  config: ReadModelIndexingConfig,
): ReadModelIndexingConfig {
  if (Number.isNaN(config.commitChunkSize)) {
    return { ...config, commitChunkSize: DEFAULT_COMMIT_CHUNK_SIZE };
  }

  return {
    ...config,
    commitChunkSize: Math.max(
      1,
      Math.min(Math.floor(config.commitChunkSize), Number.MAX_SAFE_INTEGER),
    ),
  };
}

export type BaseReadModelConfig = {
  readModelId: string;
  rebuildStateOnInit: boolean;
  /** Defaults to {@link defaultReadModelIndexingConfig}. */
  indexing?: ReadModelIndexingConfig;
};

/**
 * Base class for read models that provides catch-up/rewind functionality.
 * Handles initialization, state tracking via ViewState table, and consistency tracking.
 * Subclasses override commitOperations() with their specific domain logic.
 */
export class BaseReadModel implements IPurgeJournalReadModel {
  protected lastOrdinal: number = 0;

  readonly name: string;

  private readonly indexing: ReadModelIndexingConfig;

  /**
   * Lowest ordinal this model failed to commit and has not committed since, or
   * zero when there is none. The stored cursor is held below it so replay from
   * the cursor still reaches every operation the failed pass left out.
   */
  private uncommittedOrdinal: number = 0;

  private purgeChain: Promise<unknown> = Promise.resolve();

  constructor(
    protected db: Kysely<DocumentViewDatabase>,
    protected operationIndex: IOperationIndex,
    protected writeCache: IWriteCache,
    protected consistencyTracker: IConsistencyTracker,
    protected config: BaseReadModelConfig,
  ) {
    this.name = config.readModelId;
    this.indexing = normalizeIndexingConfig(
      config.indexing ?? defaultReadModelIndexingConfig,
    );
  }

  /**
   * Initializes the read model by loading state and catching up on missed operations.
   */
  async init(): Promise<void> {
    const viewState = await this.loadState();

    if (viewState !== undefined) {
      this.lastOrdinal = viewState;
    } else {
      await this.initializeState();
    }

    let page = await this.operationIndex.getSinceOrdinal(this.lastOrdinal);
    while (page.results.length > 0) {
      const ops = this.config.rebuildStateOnInit
        ? await this.rebuildStateForOperations(page.results)
        : page.results;
      await this.indexOperations(ops);

      if (!page.next) break;
      page = await page.next();
    }

    await this.reconcilePurges();
  }

  /** Removes this model's rows for the ids; the default reports uncovered. */
  purgeDocuments(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    ids: string[],
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    directive: PurgeDirective,
  ): Promise<PurgeOutcome> {
    return Promise.resolve({
      readModelId: this.name,
      rowsAffected: 0,
      covered: false,
    });
  }

  /** Applies journal rows above lastPurgeOrdinal in order, advancing it. */
  reconcilePurges(): Promise<PurgeOutcome[]> {
    const run = this.purgeChain.then(() => this.applyPurgeJournal());
    this.purgeChain = run.catch(() => undefined);
    return run;
  }

  /** An uncovered or failed hook stops here, leaving the cursor for a retry. */
  private async applyPurgeJournal(): Promise<PurgeOutcome[]> {
    const outcomes: PurgeOutcome[] = [];
    const failed = (error: unknown): PurgeOutcome[] => {
      outcomes.push({
        readModelId: this.name,
        rowsAffected: 0,
        covered: true,
        error: error instanceof Error ? error.message : String(error),
      });
      return outcomes;
    };

    let cursor: number | undefined;
    try {
      cursor = await this.loadPurgeCursor();
    } catch (error) {
      return failed(error);
    }
    // No ViewState row yet: init() reconciles once it writes one.
    if (cursor === undefined) return outcomes;

    for (;;) {
      let entries: PurgeJournalEntry[];
      try {
        entries = await readPurgeJournal(this.db, cursor);
      } catch (error) {
        return failed(error);
      }
      if (entries.length === 0) return outcomes;

      for (const group of groupByDirective(entries)) {
        let outcome: PurgeOutcome;
        try {
          outcome = await this.purgeDocuments(group.ids, group.directive);
        } catch (error) {
          return failed(error);
        }
        outcomes.push(outcome);
        if (!outcome.covered || outcome.error !== undefined) return outcomes;

        try {
          await this.db
            .updateTable("ViewState")
            .set({ lastPurgeOrdinal: group.lastOrdinal })
            .where("readModelId", "=", this.config.readModelId)
            .execute();
        } catch (error) {
          return failed(error);
        }
        cursor = group.lastOrdinal;
      }
    }
  }

  private async loadPurgeCursor(): Promise<number | undefined> {
    const row = await this.db
      .selectFrom("ViewState")
      .select("lastPurgeOrdinal")
      .where("readModelId", "=", this.config.readModelId)
      .executeTakeFirst();
    return row === undefined ? undefined : Number(row.lastPurgeOrdinal);
  }

  /**
   * Commits the batch in chunks, yielding between them with no transaction
   * open. A chunk that throws leaves the earlier chunks committed, so the pass
   * saves the cursor for that prefix and parks it below the operation it could
   * not commit before rethrowing.
   */
  async indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return;

    const { commitChunkSize, yieldDeadlineMs } = this.indexing;
    let lastYield = performance.now();
    let committed = 0;

    for (let start = 0; start < items.length; start += commitChunkSize) {
      if (start > 0 && performance.now() - lastYield > yieldDeadlineMs) {
        await yieldToMain();
        lastYield = performance.now();
      }

      const chunk = items.slice(start, start + commitChunkSize);

      try {
        await this.commitOperations(chunk);
      } catch (error) {
        this.park(items, committed);
        await this.recordCommittedPrefix(items.slice(0, committed));
        throw error;
      }

      committed += chunk.length;
    }

    this.liftParkIfCommitted(items);
    await this.persistCursor(items);
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

    // A page read just before a purge can name documents the cache cannot build.
    const purged = new Set(
      await findPurgedIds(
        this.db,
        operations.map((op) => op.context.documentId),
      ),
    );

    for (const op of operations) {
      const { documentId, scope, branch } = op.context;
      if (purged.has(documentId)) continue;
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
    let maxOrdinal = 0;
    for (const item of items) {
      maxOrdinal = Math.max(maxOrdinal, item.context.ordinal);
    }
    const next = Math.max(this.lastOrdinal, maxOrdinal);
    this.lastOrdinal = next;

    await trx
      .updateTable("ViewState")
      .set({
        lastOrdinal: next,
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

  /**
   * Saves the cursor for the chunks that did commit before a later chunk threw.
   * A failure here is swallowed: the cursor simply stays where the pass found
   * it, which is equally safe, and the commit error is the one worth raising.
   */
  private async recordCommittedPrefix(
    prefix: OperationWithContext[],
  ): Promise<void> {
    if (prefix.length === 0) return;

    try {
      await this.persistCursor(prefix);
    } catch {
      return;
    }

    this.updateConsistencyTracker(prefix);
  }

  /** Writes the cursor for the given items, never past a parked ordinal. */
  private async persistCursor(items: OperationWithContext[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await this.saveState(trx, items);
      await this.clampCursorToPark(trx);
    });
  }

  /**
   * Holds the cursor written by {@link saveState}, which subclasses may
   * override, below the lowest operation this model failed to commit.
   */
  private async clampCursorToPark(
    trx: Transaction<DocumentViewDatabase>,
  ): Promise<void> {
    if (this.uncommittedOrdinal === 0) return;

    const ceiling = this.uncommittedOrdinal - 1;
    if (this.lastOrdinal <= ceiling) return;

    this.lastOrdinal = ceiling;
    await trx
      .updateTable("ViewState")
      .set({
        lastOrdinal: ceiling,
        lastOperationTimestamp: new Date(),
      })
      .where("readModelId", "=", this.config.readModelId)
      .execute();
  }

  /** Remembers the lowest ordinal the failed pass left uncommitted. */
  private park(items: OperationWithContext[], committed: number): void {
    let lowest = 0;
    for (let i = committed; i < items.length; i++) {
      const ordinal = items[i]!.context.ordinal;
      if (lowest === 0 || ordinal < lowest) lowest = ordinal;
    }

    if (lowest === 0) return;
    if (this.uncommittedOrdinal === 0 || lowest < this.uncommittedOrdinal) {
      this.uncommittedOrdinal = lowest;
    }
  }

  /** The park lifts once a later pass commits the operation that failed. */
  private liftParkIfCommitted(items: OperationWithContext[]): void {
    if (this.uncommittedOrdinal === 0) return;

    for (const item of items) {
      if (item.context.ordinal === this.uncommittedOrdinal) {
        this.uncommittedOrdinal = 0;
        return;
      }
    }
  }
}

/** Consecutive journal rows of one directive, applied as one hook call. */
function groupByDirective(entries: PurgeJournalEntry[]): Array<{
  ids: string[];
  directive: PurgeDirective;
  lastOrdinal: number;
}> {
  const groups: Array<{
    ids: string[];
    directive: PurgeDirective;
    lastOrdinal: number;
  }> = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    if (last?.directive.directiveId === entry.directiveId) {
      last.ids.push(entry.documentId);
      last.lastOrdinal = entry.ordinal;
      continue;
    }
    groups.push({
      ids: [entry.documentId],
      directive: {
        directiveId: entry.directiveId,
        ...(entry.purgedBy !== null ? { purgedBy: entry.purgedBy } : {}),
      },
      lastOrdinal: entry.ordinal,
    });
  }
  return groups;
}
