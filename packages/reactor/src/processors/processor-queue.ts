import {
  isPurgeMarker,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFilter,
  ProcessorPhase,
  ProcessorQueueDepth,
  ProcessorTimingPath,
  TrackedProcessor,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import type { PagedResults } from "../shared/types.js";
import {
  UNLIMITED_BACKFILL_SLOTS,
  yieldToEventLoop,
  type IBackfillSlots,
} from "./backfill-slots.js";
import type { ProcessorStats } from "./processor-stats.js";
import type { ReplayPage } from "./replay-state.js";
import { matchesFilter } from "./utils.js";

export type ProcessorCursorState = Pick<
  TrackedProcessor,
  "lastOrdinal" | "status" | "lastError" | "lastErrorTimestamp"
>;

/** Where the current replay began and the phase it leaves the processor in. */
export type ProcessorProgressState = {
  runFrom: number;
  phase: ProcessorPhase;
};

/** Operations delivered, summed over a manager's queues. */
export type ProcessorDeliveredOps = { live: number; replay: number };

/** One queue's sizes, for telemetry. */
export type ProcessorQueueStats = {
  processorId: string;
  tasks: number;
  liveTasks: number;
  /** Operations in queued live batches. */
  bufferedLiveOps: number;
  /** Replays queued or running. */
  replaying: number;
  unrouted: number;
};

export type ProcessorQueueOptions = {
  processorId: string;
  processor: IProcessor;
  filter: ProcessorFilter;
  /** Mutated in place: the tracked processor the manager exposes. */
  cursor: ProcessorCursorState;
  /** Mutated in place, like `cursor`. */
  progress: ProcessorProgressState;
  /** Ordinals at or below this are never delivered. */
  floor: number;
  /** Up to `limit` operations above `ordinal`; `next` set when more remain. */
  readSince: (
    ordinal: number,
    limit: number,
  ) => Promise<PagedResults<OperationWithContext>>;
  /** Highest ordinal routed so far; anything above it has yet to arrive live. */
  routedThrough: () => number;
  /** The manager's appliedThrough; the cursor never passes it. */
  confirmedThrough: () => number;
  persist: (cursor: ProcessorCursorState) => Promise<void>;
  /** Tombstoned ids among `ids`; takes no purge lock. */
  purged: (ids: string[]) => Promise<ReadonlySet<string>>;
  /** First wait before retrying a failed tombstone lookup; doubles per try. */
  lookupRetryMs?: number;
  /** Retries of a failed tombstone lookup before the processor parks. */
  lookupRetries?: number;
  /** Shared across a manager's queues; defaults to no limit. */
  backfillSlots?: IBackfillSlots;
  /** Starts one backfill scan's state filling; without it a replay delivers as read. */
  replayState?: () => ReplayPage | undefined;
  /**
   * Runs between backfill pages; defaults to yielding to the event loop.
   * `closing` aborts once the queue closes, so a long wait can end early.
   */
  betweenPages?: (closing: AbortSignal) => Promise<void>;
  /** Read before every backfill page; defaults to the index's page size. */
  pageSize?: () => number;
  /** Where its time goes; collects nothing while the level is off. */
  stats: ProcessorStats;
  /** Kept whatever the timing level: telemetry correlates memory with it. */
  delivered?: ProcessorDeliveredOps;
  logger: ILogger;
};

/** Tombstoned ids a live batch was checked against, as routing started it. */
export type LiveCheck = {
  purged: Promise<ReadonlySet<string>>;
  /** Ordinals delivered even when tombstoned. */
  keep?: ReadonlySet<number>;
};

type LiveDelivery = {
  kind: "live";
  ops: OperationWithContext[];
  check: LiveCheck | undefined;
  done: () => void;
};

type Delivery =
  | LiveDelivery
  | { kind: "advance"; through: number; done: () => void };

type EraseTask = {
  kind: "erase";
  ops: OperationWithContext[];
  deletion: OperationWithContext | undefined;
  check: LiveCheck;
  run: () => Promise<void>;
  done: () => void;
};

type Task =
  | Delivery
  | EraseTask
  | {
      kind: "backfill" | "retry" | "rewind" | "disconnect";
      run: () => Promise<void>;
      done: () => void;
    };

function isDelivery(task: Task | undefined): task is Delivery {
  return task?.kind === "live" || task?.kind === "advance";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function lowestOf(ops: OperationWithContext[]): number {
  let lowest = ops[0]!.context.ordinal;
  for (const op of ops) lowest = Math.min(lowest, op.context.ordinal);
  return lowest;
}

/** Drops operations of tombstoned ids; the marker always passes. */
export function withoutPurged(
  ops: OperationWithContext[],
  purged: ReadonlySet<string>,
  keep?: ReadonlySet<number>,
): OperationWithContext[] {
  if (purged.size === 0) return ops;
  return ops.filter(
    (op) =>
      isPurgeMarker(op.operation) ||
      !purged.has(op.context.documentId) ||
      keep?.has(op.context.ordinal) === true,
  );
}

/** The ids whose tombstone would drop an operation of `ops`. */
export function purgeCandidates(ops: OperationWithContext[]): string[] {
  const ids = new Set<string>();
  for (const op of ops) {
    if (!isPurgeMarker(op.operation)) ids.add(op.context.documentId);
  }
  return [...ids];
}

function highestOf(ops: OperationWithContext[]): number {
  let highest = 0;
  for (const op of ops) highest = Math.max(highest, op.context.ordinal);
  return highest;
}

/** Largest merged live call, matching the operation index's page size. */
export const MAX_MERGED_OPERATIONS = 500;

/** The operation index's default page size. */
export const DEFAULT_BACKFILL_PAGE_SIZE = 500;

const LOOKUP_RETRY_MS = 100;
const MAX_LOOKUP_RETRY_MS = 30_000;
const LOOKUP_RETRIES = 10;

// One task at a time per processor; task promises never reject.
export class ProcessorQueue {
  private readonly tasks: Task[] = [];
  private running = false;
  private closed = false;
  private replaysAhead = 0;
  // Delivered by backfill before routing reached them; dropped once, live.
  private readonly unrouted = new Set<number>();
  // Ends a lookup retry's wait early; set while one waits.
  private wake: (() => void) | undefined;
  // Set once a lookup exhausts its retries; nothing moves until one answers.
  private parked = false;
  // Aborted on close; waits listen on it and stop listening as they settle.
  private readonly closing = new AbortController();

  constructor(private readonly options: ProcessorQueueOptions) {}

  get isClosed(): boolean {
    return this.closed;
  }

  /** True while a backfill or retry is queued or running. */
  get replaying(): boolean {
    return this.replaysAhead > 0;
  }

  /** Sizes for telemetry, read when asked. */
  stats(): ProcessorQueueStats {
    let liveTasks = 0;
    for (const task of this.tasks) {
      if (task.kind === "live") liveTasks++;
    }
    return {
      processorId: this.options.processorId,
      tasks: this.tasks.length,
      liveTasks,
      bufferedLiveOps: this.depth.ops,
      replaying: this.replaysAhead,
      unrouted: this.unrouted.size,
    };
  }

  /** Read when asked, not kept: tasks waiting and operations in live ones. */
  get depth(): ProcessorQueueDepth {
    let ops = 0;
    for (const task of this.tasks) {
      if (task.kind === "live") ops += task.ops.length;
    }
    return { tasks: this.tasks.length, ops };
  }

  /**
   * Resolves at once behind a replay, so a pass never waits out a backfill.
   * Batches queued behind it wait in memory until it ends, which at level 0
   * is until the level rises; they are kept, not folded into the replay, so
   * each still arrives once and in order.
   */
  live(ops: OperationWithContext[], check?: LiveCheck): Promise<void> {
    const delivered = this.push((done) => ({ kind: "live", ops, check, done }));
    return this.replaysAhead > 0 ? Promise.resolve() : delivered;
  }

  /** Raises the cursor past a batch with nothing for this processor. */
  advance(through: number): Promise<void> {
    const last = this.tasks.at(-1);
    if (last?.kind === "advance") {
      last.through = Math.max(last.through, through);
      return Promise.resolve();
    }
    return this.push((done) => ({ kind: "advance", through, done }));
  }

  /** `share` if active, then `deletion` whatever the status; true once delivered. */
  erase(
    share: OperationWithContext[],
    deletion: OperationWithContext,
    check: LiveCheck,
  ): Promise<boolean> {
    if (this.closed) return Promise.resolve(false);
    let delivered = false;
    const task: Omit<EraseTask, "done"> = {
      kind: "erase",
      ops: share,
      deletion,
      check,
      run: async () => {
        delivered = await this.runErase(task);
      },
    };
    return this.push((done) => Object.assign(task, { done })).then(
      () => delivered,
    );
  }

  /** Replays from the cursor as it stands when the task runs. */
  backfill(): Promise<void> {
    return this.replay("backfill", () => this.runBackfill());
  }

  /** Clears an error and replays from the cursor. No-op when active. */
  retry(): Promise<void> {
    return this.replay("retry", async () => {
      const { cursor } = this.options;
      if (cursor.status !== "errored") return;
      cursor.status = "active";
      cursor.lastError = undefined;
      cursor.lastErrorTimestamp = undefined;
      await this.persist();
      await this.runBackfill();
    });
  }

  /**
   * Moves the cursor back to `toOrdinal` once `gate` resolves, clears any
   * error, and replays from there. Rejects with `gate`'s error, for an ordinal
   * below the floor or above the cursor, checked when the task runs, or once
   * closed.
   */
  rewind(toOrdinal: number, gate: () => Promise<void>): Promise<void> {
    if (this.closed) {
      return Promise.reject(
        new Error(
          `Processor ${JSON.stringify(this.options.processorId)} is closed`,
        ),
      );
    }
    let refused: Error | undefined;
    return this.replay("rewind", async () => {
      try {
        await gate();
      } catch (error) {
        refused = error instanceof Error ? error : new Error(String(error));
        return;
      }
      const { cursor, floor } = this.options;
      if (toOrdinal < floor || toOrdinal > cursor.lastOrdinal) {
        refused = new Error(
          `Processor ${JSON.stringify(this.options.processorId)} can replay from ordinal ${floor} to ${cursor.lastOrdinal}, not ${toOrdinal}`,
        );
        return;
      }
      cursor.lastOrdinal = toOrdinal;
      cursor.status = "active";
      cursor.lastError = undefined;
      cursor.lastErrorTimestamp = undefined;
      this.unrouted.clear();
      await this.persist();
      await this.runBackfill();
    }).then(() => {
      if (refused) throw refused;
    });
  }

  /** Stops cursor writes now; queued tasks still run before the disconnect. */
  close(): Promise<void> {
    if (this.closed) return Promise.resolve();
    const disconnect = this.enqueue("disconnect", async () => {
      try {
        await this.options.processor.onDisconnect();
      } catch (error) {
        this.options.logger.error(
          "Error disconnecting processor '@ProcessorId': @Error",
          this.options.processorId,
          error,
        );
      }
    });
    this.closed = true;
    this.closing.abort();
    this.wake?.();
    return disconnect;
  }

  private replay(
    kind: "backfill" | "retry" | "rewind",
    run: () => Promise<void>,
  ): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.replaysAhead++;
    this.syncProgress();
    return this.enqueue(kind, async () => {
      this.options.stats.startRun(this.options.cursor.lastOrdinal);
      try {
        await run();
      } finally {
        this.replaysAhead--;
        this.syncProgress();
        if (this.replaysAhead === 0) this.options.stats.endRun();
      }
    });
  }

  private enqueue(
    kind: "backfill" | "retry" | "rewind" | "disconnect",
    run: () => Promise<void>,
  ): Promise<void> {
    return this.push((done) => ({ kind, run, done }));
  }

  private push(task: (done: () => void) => Task): Promise<void> {
    if (this.closed) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.tasks.push(task(resolve));
      if (this.running) return;
      this.running = true;
      // Never start user code on the caller's stack.
      queueMicrotask(() => void this.drain());
    });
  }

  private async drain(): Promise<void> {
    while (this.tasks.length > 0) {
      const task = this.tasks.shift()!;
      // Consecutive deliveries go to the processor as one call.
      const batch: Delivery[] = [];
      if (isDelivery(task)) {
        batch.push(task);
        let size = task.kind === "live" ? task.ops.length : 0;
        let next = this.tasks[0];
        while (isDelivery(next) && size < MAX_MERGED_OPERATIONS) {
          if (next.kind === "live") size += next.ops.length;
          batch.push(next);
          this.tasks.shift();
          next = this.tasks[0];
        }
      }
      try {
        await (isDelivery(task) ? this.deliverLive(batch) : task.run());
      } catch (error) {
        this.options.logger.error(
          "Processor '@ProcessorId' task '@Kind' failed: @Error",
          this.options.processorId,
          task.kind,
          error,
        );
      } finally {
        task.done();
        for (const merged of batch.slice(1)) merged.done();
      }
    }
    this.running = false;
  }

  private async deliverLive(batch: Delivery[]): Promise<void> {
    const { cursor, floor } = this.options;
    const ops: OperationWithContext[] = [];
    let through = 0;
    for (const task of batch) {
      if (task.kind === "live") ops.push(...task.ops);
      else through = Math.max(through, task.through);
    }
    const fresh = ops.filter((op) => {
      const ordinal = op.context.ordinal;
      if (ordinal <= floor) return false;
      return !this.unrouted.delete(ordinal);
    });
    if (fresh.length === 0) {
      await this.raiseCursor(through);
      return;
    }
    this.options.stats.recordScanned("live", fresh.length);
    this.options.stats.recordMatched("live", fresh.length);

    if (cursor.status !== "active" || this.parked) {
      await this.parkBelow(fresh);
      return;
    }

    const live = await this.dropPurgedLive(batch, fresh);
    if (live === undefined) {
      await this.parkBelow(fresh);
      return;
    }

    if (live.length > 0 && !(await this.deliver(live, "live"))) {
      await this.parkBelow(fresh);
      return;
    }

    await this.raiseCursor(Math.max(highestOf(fresh), through));
  }

  /** Undefined once closed, or parked after the lookup's last retry. */
  private async dropPurgedLive(
    batch: Delivery[],
    fresh: OperationWithContext[],
  ): Promise<OperationWithContext[] | undefined> {
    const keep = new Set<number>();
    const checks: Promise<ReadonlySet<string>>[] = [];
    for (const task of batch) {
      if (task.kind !== "live" || !task.check) continue;
      checks.push(task.check.purged);
      for (const ordinal of task.check.keep ?? []) keep.add(ordinal);
    }
    let purged: ReadonlySet<string> | undefined;
    const mark = this.options.stats.mark();
    try {
      const sets = await Promise.all(checks);
      purged = new Set(sets.flatMap((set) => [...set]));
    } catch (error) {
      purged = await this.retryLookup(fresh, error);
    }
    this.options.stats.recordLookup("live", mark);
    return purged && withoutPurged(fresh, purged, keep);
  }

  // The cursor holds meanwhile: a transient failure costs a delay, not an error.
  private async retryLookup(
    ops: OperationWithContext[],
    error: unknown,
  ): Promise<ReadonlySet<string> | undefined> {
    const ids = purgeCandidates(ops);
    let wait = this.options.lookupRetryMs ?? LOOKUP_RETRY_MS;
    const retries = this.options.lookupRetries ?? LOOKUP_RETRIES;
    for (let attempt = 0; attempt < retries; attempt++) {
      this.options.logger.error(
        "Processor '@ProcessorId' failed checking tombstones, retrying in @Wait ms: @Error",
        this.options.processorId,
        wait,
        error,
      );
      await this.sleep(wait);
      if (this.closed) return undefined;
      try {
        return await this.options.purged(ids);
      } catch (retryError) {
        error = retryError;
        wait = Math.min(wait * 2, MAX_LOOKUP_RETRY_MS);
      }
    }
    await this.park(ops, ids, wait, error);
    return undefined;
  }

  // Active but held below `ops`; a replay retries every `wait` ms, then resumes.
  private async park(
    ops: OperationWithContext[],
    ids: string[],
    wait: number,
    error: unknown,
  ): Promise<void> {
    this.parked = true;
    this.noteLookupError(error);
    this.options.logger.error(
      "Processor '@ProcessorId' parked: tombstones unread after @Retries retries, retrying every @Wait ms: @Error",
      this.options.processorId,
      this.options.lookupRetries ?? LOOKUP_RETRIES,
      wait,
      error,
    );
    void this.replay("backfill", () => this.resume(ids, wait));
    await this.parkBelow(ops);
  }

  private async resume(ids: string[], wait: number): Promise<void> {
    for (;;) {
      if (this.closed) return;
      await this.sleep(wait);
      if (this.closed) return;
      try {
        await this.options.purged(ids);
        break;
      } catch (error) {
        this.noteLookupError(error);
        this.options.logger.error(
          "Processor '@ProcessorId' still parked, tombstones unread; retrying in @Wait ms: @Error",
          this.options.processorId,
          wait,
          error,
        );
      }
    }
    this.parked = false;
    const { cursor } = this.options;
    cursor.lastError = undefined;
    cursor.lastErrorTimestamp = undefined;
    await this.persist();
    this.options.logger.info(
      "Processor '@ProcessorId' resumed from ordinal @Ordinal",
      this.options.processorId,
      cursor.lastOrdinal,
    );
    await this.runBackfill();
  }

  private noteLookupError(error: unknown): void {
    const { cursor } = this.options;
    cursor.lastError = errorMessage(error);
    cursor.lastErrorTimestamp = new Date();
  }

  // Unref'd, and cut short by close(), so a retry never outlives the queue.
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.wake = undefined;
        resolve();
      };
      const timer = setTimeout(done, ms);
      (timer as { unref?: () => void }).unref?.();
      this.wake = done;
    });
  }

  private async runErase(task: Omit<EraseTask, "done">): Promise<boolean> {
    const { cursor, floor } = this.options;
    const fresh = task.ops.filter((op) => {
      const ordinal = op.context.ordinal;
      if (ordinal <= floor) return false;
      return !this.unrouted.delete(ordinal);
    });
    const deletion =
      task.deletion && !this.unrouted.delete(task.deletion.context.ordinal)
        ? task.deletion
        : undefined;

    let ops: OperationWithContext[] = [];
    if (cursor.status === "active" && !this.parked && fresh.length > 0) {
      try {
        ops = withoutPurged(fresh, await task.check.purged);
      } catch (error) {
        this.options.logger.error(
          "Processor '@ProcessorId' skipped its drive's last batch, tombstones unread: @Error",
          this.options.processorId,
          error,
        );
      }
    }
    if (deletion) ops.push(deletion);
    return ops.length === 0 || (await this.deliver(ops, "live"));
  }

  private async runBackfill(): Promise<void> {
    const { cursor } = this.options;
    if (cursor.status !== "active" || this.parked) return;
    const slots = this.options.backfillSlots ?? UNLIMITED_BACKFILL_SLOTS;
    const { stats } = this.options;
    const waiting = stats.mark();
    // Replaced when the scan gives its slot back between pages.
    const slot = { release: await slots.acquire(this.closing.signal) };
    stats.recordSlotWait(waiting);
    if (this.closed) {
      slot.release();
      return;
    }
    try {
      await this.scanBackfill(slots, slot);
    } finally {
      slot.release();
    }
  }

  private async scanBackfill(
    slots: IBackfillSlots,
    slot: { release: () => void },
  ): Promise<void> {
    const { cursor, filter, floor, stats } = this.options;
    if (cursor.status !== "active" || this.parked) return;
    this.options.progress.runFrom = cursor.lastOrdinal;
    const betweenPages = this.options.betweenPages ?? yieldToEventLoop;
    const pageSize =
      this.options.pageSize ?? (() => DEFAULT_BACKFILL_PAGE_SIZE);
    const fill = this.options.replayState?.();

    let page: PagedResults<OperationWithContext>;
    let reading = stats.mark();
    try {
      page = await this.options.readSince(cursor.lastOrdinal, pageSize());
    } catch (error) {
      await this.fail(error, "reading backfill");
      return;
    }
    stats.recordRead(reading, page.results.length);

    while (page.results.length > 0) {
      if (this.closed) return;

      const matching = page.results.filter(
        (op) => op.context.ordinal > floor && matchesFilter(op, filter),
      );
      stats.recordMatched("replay", matching.length);
      let live: OperationWithContext[] = matching;
      if (matching.length > 0) {
        const ids = purgeCandidates(matching);
        let purged: ReadonlySet<string> | undefined;
        const lookup = stats.mark();
        try {
          purged = await this.options.purged(ids);
        } catch (error) {
          purged = await this.retryLookup(matching, error);
        }
        stats.recordLookup("replay", lookup);
        if (purged === undefined) {
          await this.persist();
          return;
        }
        live = withoutPurged(matching, purged);
      }
      if (fill && live.length > 0) {
        const filling = stats.mark();
        try {
          live = await fill(live);
        } catch (error) {
          await this.fail(error, "reading replay state");
          return;
        }
        stats.recordFill(filling);
      }
      if (live.length > 0) {
        if (!(await this.deliver(live, "replay"))) {
          await this.persist();
          return;
        }
      }
      if (matching.length > 0) this.dedupeQueued(matching);

      await this.raiseCursor(highestOf(page.results));

      if (!page.next) break;
      // Re-read from where this page ended, so a new page size applies now.
      const scanned = highestOf(page.results);
      const pausing = stats.mark();
      await betweenPages(this.closing.signal);
      stats.recordPause(pausing);
      if (this.closed) return;
      // After a lower, scans over the new count queue again for a slot.
      if (slots.oversubscribed()) {
        slot.release();
        const waiting = stats.mark();
        slot.release = await slots.acquire(this.closing.signal);
        stats.recordSlotWait(waiting);
        if (this.closed) return;
      }
      reading = stats.mark();
      try {
        page = await this.options.readSince(scanned, pageSize());
      } catch (error) {
        await this.fail(error, "reading backfill");
        return;
      }
      stats.recordRead(reading, page.results.length);
    }
  }

  // Routing is synchronous: a routed ordinal is queued now, an unrouted one comes later.
  private dedupeQueued(delivered: OperationWithContext[]): void {
    const routed = this.options.routedThrough();
    const queued = new Set<number>();
    for (const op of delivered) {
      const ordinal = op.context.ordinal;
      if (ordinal > routed) this.unrouted.add(ordinal);
      else queued.add(ordinal);
    }
    if (queued.size === 0) return;
    for (const task of this.tasks) {
      if (task.kind === "erase") {
        const { deletion } = task;
        if (deletion && queued.has(deletion.context.ordinal)) {
          task.deletion = undefined;
        }
      } else if (task.kind !== "live") {
        continue;
      }
      task.ops = task.ops.filter((op) => !queued.has(op.context.ordinal));
    }
  }

  private async deliver(
    ops: OperationWithContext[],
    path: ProcessorTimingPath,
  ): Promise<boolean> {
    const { stats } = this.options;
    const mark = stats.mark();
    try {
      await this.options.processor.onOperations(ops);
      stats.recordBatch(path, mark, ops, false);
      if (this.options.delivered) this.options.delivered[path] += ops.length;
      return true;
    } catch (error) {
      stats.recordBatch(path, mark, ops, true);
      this.markErrored(error);
      this.options.logger.error(
        "Processor '@ProcessorId' failed at ordinal @Ordinal: @Error",
        this.options.processorId,
        lowestOf(ops),
        error,
      );
      return false;
    }
  }

  private async fail(error: unknown, during: string): Promise<void> {
    this.options.stats.recordError("replay");
    this.markErrored(error);
    await this.persist();
    this.options.logger.error(
      "Processor '@ProcessorId' failed @During: @Error",
      this.options.processorId,
      during,
      error,
    );
  }

  private markErrored(error: unknown): void {
    const { cursor } = this.options;
    cursor.status = "errored";
    cursor.lastError = errorMessage(error);
    cursor.lastErrorTimestamp = new Date();
    this.syncProgress();
  }

  // Outside a replay the run start follows the cursor, so a live processor reads as done.
  private syncProgress(): void {
    const { cursor, progress } = this.options;
    if (cursor.status === "errored") progress.phase = "errored";
    else progress.phase = this.replaysAhead > 0 ? "catching-up" : "live";
    if (this.replaysAhead === 0) progress.runFrom = cursor.lastOrdinal;
  }

  private async raiseCursor(through: number): Promise<void> {
    const { cursor } = this.options;
    const capped = Math.min(through, this.options.confirmedThrough());
    if (cursor.status !== "active" || this.parked) return;
    if (capped <= cursor.lastOrdinal) return;
    this.options.stats.recordAdvance(capped - cursor.lastOrdinal);
    cursor.lastOrdinal = capped;
    await this.persist();
  }

  // Retry and restart replay from the cursor, so it must stay below a miss.
  private async parkBelow(missed: OperationWithContext[]): Promise<void> {
    const { cursor } = this.options;
    cursor.lastOrdinal = Math.min(cursor.lastOrdinal, lowestOf(missed) - 1);
    await this.persist();
  }

  private async persist(): Promise<void> {
    this.syncProgress();
    if (this.closed) return;
    const { cursor } = this.options;
    try {
      await this.options.persist({
        lastOrdinal: cursor.lastOrdinal,
        status: cursor.status,
        lastError: cursor.lastError,
        lastErrorTimestamp: cursor.lastErrorTimestamp,
      });
    } catch (error) {
      this.options.logger.error(
        "Failed to persist cursor for '@ProcessorId': @Error",
        this.options.processorId,
        error,
      );
    }
  }
}
