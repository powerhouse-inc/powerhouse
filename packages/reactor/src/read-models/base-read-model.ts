import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { childLogger, type ILogger } from "document-model";
import type { Kysely } from "kysely";
import type { IOperationIndex } from "../cache/operation-index-types.js";
import type { IWriteCache } from "../cache/write/interfaces.js";
import { ContiguousCursor } from "../catch-up/contiguous-cursor.js";
import {
  createKyselyWatermarkProbe,
  SettledWatermark,
} from "../catch-up/settled-watermark.js";
import {
  defaultCatchUpConfig,
  type ICatchUpConsumer,
  type ISettledWatermark,
  type SweepBlockedAt,
  type SweepResult,
} from "../catch-up/types.js";
import type { Unsubscribe } from "../events/types.js";
import type { IConsistencyTracker } from "../shared/consistency-tracker.js";
import { DocumentNotFoundError } from "../shared/errors.js";
import type {
  ConsistencyCoordinate,
  ConsistencyToken,
} from "../shared/types.js";
import { yieldToMain } from "../shared/utils.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import type { IReadModel } from "./interfaces.js";
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
  /** Rebuilds resultingState for boot replay and sweeps. */
  rebuildStateOnInit: boolean;
  /** Defaults to {@link defaultReadModelIndexingConfig}. */
  indexing?: ReadModelIndexingConfig;
  /** Where a first registration starts; defaults to "beginning". */
  startFrom?: "beginning" | "head";
  /** Re-applies the rest of a late operation's stream; defaults to true. */
  replayStreamSuffix?: boolean;
};

type StreamGroup = {
  documentId: string;
  scope: string;
  branch: string;
  lowest: number;
  late: OperationWithContext[];
};

function ordinalOf(item: OperationWithContext): number {
  return item.context.ordinal;
}

function isTracked(ordinal: number): boolean {
  return Number.isFinite(ordinal) && ordinal > 0;
}

function groupByStream(items: OperationWithContext[]): StreamGroup[] {
  const groups = new Map<string, StreamGroup>();
  for (const item of items) {
    const { documentId, scope, branch } = item.context;
    const key = `${documentId}\u0000${scope}\u0000${branch}`;
    let group = groups.get(key);
    if (group === undefined) {
      group = { documentId, scope, branch, lowest: ordinalOf(item), late: [] };
      groups.set(key, group);
    }
    group.lowest = Math.min(group.lowest, ordinalOf(item));
    group.late.push(item);
  }
  return [...groups.values()].sort((a, b) => a.lowest - b.lowest);
}

function mergeByOrdinal(
  ...lists: OperationWithContext[][]
): OperationWithContext[] {
  const byOrdinal = new Map<number, OperationWithContext>();
  for (const list of lists) {
    for (const item of list) byOrdinal.set(ordinalOf(item), item);
  }
  return [...byOrdinal.values()].sort((a, b) => ordinalOf(a) - ordinalOf(b));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** A read model whose cursor only sweeps and boot replay advance. */
export class BaseReadModel implements IReadModel, ICatchUpConsumer {
  readonly name: string;

  private readonly indexing: ReadModelIndexingConfig;
  private readonly catchUpLogger: ILogger;
  private cursor: ContiguousCursor;
  private persisted = 0;
  private watermark: ISettledWatermark | undefined;
  private maxTrackedAboveCursor = defaultCatchUpConfig.maxTrackedAboveCursor;
  private loggedFailure: number | undefined;
  private failedItem: OperationWithContext | undefined;
  private initialized = false;
  private readonly sweptListeners = new Set<
    (coordinates: ConsistencyCoordinate[]) => void
  >();

  constructor(
    protected db: Kysely<DocumentViewDatabase>,
    protected operationIndex: IOperationIndex,
    protected writeCache: IWriteCache,
    protected consistencyTracker: IConsistencyTracker,
    protected config: BaseReadModelConfig,
  ) {
    this.name = config.readModelId;
    this.catchUpLogger = childLogger([
      "reactor",
      "read-model",
      config.readModelId,
    ]);
    this.indexing = normalizeIndexingConfig(
      config.indexing ?? defaultReadModelIndexingConfig,
    );
    this.cursor = new ContiguousCursor(0, this.maxTrackedAboveCursor);
  }

  get consumerId(): string {
    return this.config.readModelId;
  }

  get appliedThrough(): number {
    return this.cursor.appliedThrough;
  }

  get trackedAbove(): number {
    return this.cursor.trackedAbove;
  }

  /** Shares a thread's watermark; otherwise boot probes through this db. */
  attachCatchUp(
    watermark: ISettledWatermark,
    maxTrackedAboveCursor: number,
  ): void {
    this.watermark = watermark;
    this.maxTrackedAboveCursor = maxTrackedAboveCursor;
    this.cursor.setLimit(maxTrackedAboveCursor);
  }

  /** Notified with the coordinates each sweep applied. */
  onSwept(
    listener: (coordinates: ConsistencyCoordinate[]) => void,
  ): Unsubscribe {
    this.sweptListeners.add(listener);
    return () => {
      this.sweptListeners.delete(listener);
    };
  }

  /** A chunk that throws ends the replay; sweeps continue from below it. */
  async init(): Promise<void> {
    // A repeat init replays from where this process is, keeping what it applied.
    if (this.initialized) {
      await this.replayFromCursor();
      return;
    }
    let stored = await this.loadState();

    if (stored === undefined) {
      if (this.config.startFrom === "head") {
        const head = await this.settledWatermark().refresh();
        await this.initializeState(head);
        this.resetCursor(head);
        this.initialized = true;
        return;
      }
      await this.initializeState(0);
      stored = 0;
    }

    this.resetCursor(stored);
    this.initialized = true;
    await this.replayFromCursor();
  }

  /** The live path: never moves the cursor. */
  indexOperations(items: OperationWithContext[]): Promise<void> {
    if (items.length === 0) return Promise.resolve();

    const owned = this.claimLive(items);
    if (owned.length === 0) return Promise.resolve();

    return this.applyChunked(owned);
  }

  async sweep(
    settledThrough: number,
    present: readonly number[],
    signal?: AbortSignal,
  ): Promise<SweepResult> {
    const startedAt = performance.now();
    const from = this.cursor.appliedThrough;
    const range = present.filter(
      (ordinal) => ordinal > from && ordinal <= settledThrough,
    );
    const mine = this.cursor.claim(this.cursor.missing(range));

    let replayed = 0;
    let reapplied = 0;
    let blockedAt: SweepBlockedAt | undefined;

    if (mine.size > 0) {
      let late: OperationWithContext[];
      try {
        late = await this.operationIndex.getByOrdinals([...mine], signal);
      } catch (error) {
        this.cursor.settle(mine, false);
        throw error;
      }

      const found = new Set(late.map(ordinalOf));
      this.cursor.settle(
        [...mine].filter((ordinal) => !found.has(ordinal)),
        true,
      );

      for (const group of groupByStream(late)) {
        const outcome = await this.sweepStream(group, signal);
        replayed += outcome.replayed;
        reapplied += outcome.reapplied;
        blockedAt ??= outcome.blockedAt;
      }

      if (replayed > 0) {
        this.catchUpLogger.warn(
          "@consumer applied @n operations its live path never received: ordinals @first..@last",
          this.consumerId,
          replayed,
          Math.min(...found),
          Math.max(...found),
        );
      }
    }

    const to = this.cursor.target(settledThrough, range);
    if (to > from) {
      await this.moveCursor(to);
    }
    this.cursor.enforceLimit();

    return {
      consumerId: this.consumerId,
      from,
      to: this.cursor.appliedThrough,
      durationMs: performance.now() - startedAt,
      replayed,
      reapplied,
      ...(blockedAt !== undefined ? { blockedAt } : {}),
    };
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

  /** The cursor, for subclasses: every present ordinal at or below it is applied. */
  protected get lastOrdinal(): number {
    return this.cursor.appliedThrough;
  }

  /** Called after the cursor advances. */
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  protected onCursorAdvanced(appliedThrough: number): void {}

  // Subclass does domain-specific work here (snapshots, relationships, processor routing, etc.).
  protected async commitOperations(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    items: OperationWithContext[],
  ): Promise<void> {}

  /** Rebuilds resultingState as the executor writes it: scopes plus header. */
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
          resultingState: JSON.stringify({
            ...document.state,
            header: document.header,
          }),
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
    const row = await this.db
      .selectFrom("ViewState")
      .select("lastOrdinal")
      .where("readModelId", "=", this.config.readModelId)
      .executeTakeFirst();

    return row?.lastOrdinal;
  }

  /**
   * Initializes the ViewState row for this read model.
   */
  protected async initializeState(lastOrdinal = 0): Promise<void> {
    await this.db
      .insertInto("ViewState")
      .values({
        readModelId: this.config.readModelId,
        lastOrdinal,
      })
      .onConflict((oc) => oc.column("readModelId").doNothing())
      .execute();
  }

  /**
   * Updates the consistency tracker with the processed operations.
   */
  protected updateConsistencyTracker(items: OperationWithContext[]): void {
    this.consistencyTracker.update(this.coordinatesOf(items));
  }

  private coordinatesOf(
    items: OperationWithContext[],
  ): ConsistencyCoordinate[] {
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
    return coordinates;
  }

  private settledWatermark(): ISettledWatermark {
    this.watermark ??= new SettledWatermark(
      createKyselyWatermarkProbe(this.db as unknown as Kysely<StorageDatabase>),
      this.catchUpLogger,
    );
    return this.watermark;
  }

  private resetCursor(appliedThrough: number): void {
    this.cursor = new ContiguousCursor(
      appliedThrough,
      this.maxTrackedAboveCursor,
    );
    this.persisted = appliedThrough;
  }

  /** Items this pass must apply; untracked ordinals always apply. */
  private claimLive(items: OperationWithContext[]): OperationWithContext[] {
    const mine = this.cursor.claim(items.map(ordinalOf));
    return items.filter((item) => {
      const ordinal = ordinalOf(item);
      return !isTracked(ordinal) || mine.has(ordinal);
    });
  }

  /** Commits in chunks, yielding with no transaction open. */
  private async applyChunked(items: OperationWithContext[]): Promise<void> {
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
        this.failedItem = chunk[0];
        const prefix = items.slice(0, committed);
        this.cursor.settle(prefix.map(ordinalOf), true);
        this.cursor.settle(items.slice(committed).map(ordinalOf), false);
        if (prefix.length > 0) this.updateConsistencyTracker(prefix);
        throw error;
      }

      committed += chunk.length;
    }

    this.cursor.settle(items.map(ordinalOf), true);
    this.cursor.enforceLimit();
    this.updateConsistencyTracker(items);
  }

  private async replayFromCursor(): Promise<void> {
    const settledAtBoot = await this.settledAtBoot();
    let page = await this.operationIndex.getSinceOrdinal(
      this.cursor.appliedThrough,
    );

    while (page.results.length > 0) {
      const ordinals = page.results.map(ordinalOf);
      const failed = await this.replayPage(page.results);

      const pageMax = Math.max(...ordinals);
      const to = this.cursor.target(Math.min(settledAtBoot, pageMax), ordinals);
      if (to > this.cursor.appliedThrough) {
        await this.moveCursor(to);
      }

      if (failed || !page.next) break;
      page = await page.next();
    }
  }

  /** Without a probe, boot replay applies but leaves the cursor to sweeps. */
  private async settledAtBoot(): Promise<number> {
    try {
      return await this.settledWatermark().refresh();
    } catch (error) {
      this.catchUpLogger.warn(
        "@consumer could not probe the settled watermark at boot; the cursor waits for a sweep: @error",
        this.consumerId,
        error,
      );
      return this.cursor.appliedThrough;
    }
  }

  /** Returns true when a chunk failed, which ends the replay. */
  private async replayPage(results: OperationWithContext[]): Promise<boolean> {
    const owned = this.claimLive(results);
    if (owned.length === 0) return false;

    let rebuilt: { items: OperationWithContext[]; absent: number[] };
    try {
      rebuilt = await this.rebuildIfConfigured(owned);
    } catch (error) {
      this.cursor.settle(owned.map(ordinalOf), false);
      this.block(owned[0]!, error);
      return true;
    }
    this.cursor.settle(rebuilt.absent, true);
    if (rebuilt.items.length === 0) return false;

    try {
      await this.applyChunked(rebuilt.items);
    } catch (error) {
      this.block(this.failedItem ?? rebuilt.items[0]!, error);
      return true;
    }
    return false;
  }

  private async sweepStream(
    group: StreamGroup,
    signal: AbortSignal | undefined,
  ): Promise<{
    replayed: number;
    reapplied: number;
    blockedAt?: SweepBlockedAt;
  }> {
    const owned = group.late.map(ordinalOf);
    const ownedSet = new Set(owned);

    let items = group.late;
    if (this.config.replayStreamSuffix ?? true) {
      let suffix: OperationWithContext[];
      try {
        suffix = await this.operationIndex.getStreamAfter(
          group,
          group.lowest,
          signal,
        );
      } catch (error) {
        this.cursor.settle(owned, false);
        return {
          replayed: 0,
          reapplied: 0,
          blockedAt: this.block(group.late[0]!, error),
        };
      }
      items = mergeByOrdinal(group.late, suffix);
    }

    let rebuilt: { items: OperationWithContext[]; absent: number[] };
    try {
      rebuilt = await this.rebuildIfConfigured(items);
    } catch (error) {
      this.cursor.settle(owned, false);
      return {
        replayed: 0,
        reapplied: 0,
        blockedAt: this.block(items[0]!, error),
      };
    }

    try {
      await this.commitOperations(rebuilt.items);
    } catch (error) {
      this.cursor.settle(owned, false);
      return {
        replayed: 0,
        reapplied: 0,
        blockedAt: this.block(rebuilt.items[0] ?? items[0]!, error),
      };
    }

    this.cursor.settle(owned, true);
    this.updateConsistencyTracker(rebuilt.items);
    this.notifySwept(rebuilt.items);

    let replayed = 0;
    for (const item of rebuilt.items) {
      if (ownedSet.has(ordinalOf(item))) replayed++;
    }
    return { replayed, reapplied: rebuilt.items.length - replayed };
  }

  /** A document gone from the write cache is absent, not a failure. */
  private async rebuildIfConfigured(
    items: OperationWithContext[],
  ): Promise<{ items: OperationWithContext[]; absent: number[] }> {
    if (!this.config.rebuildStateOnInit) {
      return { items, absent: [] };
    }

    const rebuilt: OperationWithContext[] = [];
    const absent: number[] = [];
    for (const item of items) {
      let result: OperationWithContext[];
      try {
        result = await this.rebuildStateForOperations([item]);
      } catch (error) {
        if (!(error instanceof DocumentNotFoundError)) throw error;
        this.catchUpLogger.warn(
          "@consumer dropped ordinal @ordinal: document @documentId is gone",
          this.consumerId,
          ordinalOf(item),
          item.context.documentId,
        );
        absent.push(ordinalOf(item));
        continue;
      }
      rebuilt.push(...result);
    }
    return { items: rebuilt, absent };
  }

  private block(item: OperationWithContext, error: unknown): SweepBlockedAt {
    const blockedAt: SweepBlockedAt = {
      ordinal: ordinalOf(item),
      documentId: item.context.documentId,
      scope: item.context.scope,
      branch: item.context.branch,
      type: item.operation.action.type,
      error: errorMessage(error),
    };
    if (this.loggedFailure !== blockedAt.ordinal) {
      this.loggedFailure = blockedAt.ordinal;
      this.catchUpLogger.error(
        "@consumer cursor held at @applied: ordinal @ordinal (@documentId/@scope/@branch, @type) failed: @error",
        this.consumerId,
        this.cursor.appliedThrough,
        blockedAt.ordinal,
        blockedAt.documentId,
        blockedAt.scope,
        blockedAt.branch,
        blockedAt.type,
        blockedAt.error,
      );
    }
    return blockedAt;
  }

  private notifySwept(items: OperationWithContext[]): void {
    if (this.sweptListeners.size === 0 || items.length === 0) return;
    const coordinates = this.coordinatesOf(items);
    for (const listener of this.sweptListeners) {
      listener(coordinates);
    }
  }

  /** Compare-and-set against the value this process last wrote. */
  private async moveCursor(to: number): Promise<void> {
    if (to <= this.persisted) {
      this.advanceCursor(to);
      return;
    }

    const expected = this.persisted;
    const result = await this.db
      .updateTable("ViewState")
      .set({ lastOrdinal: to, lastOperationTimestamp: new Date() })
      .where("readModelId", "=", this.config.readModelId)
      .where("lastOrdinal", "=", expected)
      .executeTakeFirst();

    if (Number(result.numUpdatedRows) > 0) {
      this.persisted = to;
      this.advanceCursor(to);
      return;
    }

    const stored = await this.loadState();
    if (stored === undefined) {
      await this.initializeState(0);
      this.lowered(0);
      return;
    }
    if (stored < this.cursor.appliedThrough) {
      this.lowered(stored);
      return;
    }
    this.persisted = stored;
    this.advanceCursor(Math.min(to, stored));
  }

  private advanceCursor(to: number): void {
    const before = this.cursor.appliedThrough;
    this.cursor.advance(to);
    if (this.cursor.appliedThrough > before) {
      this.onCursorAdvanced(this.cursor.appliedThrough);
    }
  }

  private lowered(to: number): void {
    this.catchUpLogger.info(
      "@consumer cursor lowered externally from @old to @new; replaying",
      this.consumerId,
      this.cursor.appliedThrough,
      to,
    );
    this.resetCursor(to);
  }
}
