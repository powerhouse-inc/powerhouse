import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFilter,
  TrackedProcessor,
} from "@powerhousedao/shared/processors";
import type { ILogger } from "document-model";
import type { PagedResults } from "../shared/types.js";
import { matchesFilter } from "./utils.js";

export type ProcessorCursorState = Pick<
  TrackedProcessor,
  "lastOrdinal" | "status" | "lastError" | "lastErrorTimestamp"
>;

export type ProcessorQueueOptions = {
  processorId: string;
  processor: IProcessor;
  filter: ProcessorFilter;
  /** Mutated in place: the tracked processor the manager exposes. */
  cursor: ProcessorCursorState;
  /** Ordinals at or below this are never delivered. */
  floor: number;
  readSince: (ordinal: number) => Promise<PagedResults<OperationWithContext>>;
  /** Highest ordinal routed so far; anything above it has yet to arrive live. */
  routedThrough: () => number;
  persist: (cursor: ProcessorCursorState) => Promise<void>;
  logger: ILogger;
};

type Delivery =
  | { kind: "live"; ops: OperationWithContext[]; done: () => void }
  | { kind: "advance"; through: number; done: () => void };

type Task =
  | Delivery
  | {
      kind: "backfill" | "retry" | "disconnect";
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

function highestOf(ops: OperationWithContext[]): number {
  let highest = 0;
  for (const op of ops) highest = Math.max(highest, op.context.ordinal);
  return highest;
}

// One task at a time per processor; task promises never reject.
export class ProcessorQueue {
  private readonly tasks: Task[] = [];
  private running = false;
  private closed = false;
  private replaysAhead = 0;
  // Ordinals a backfill delivered, open until the queue drains.
  private overlap: Set<number> | undefined;
  // Delivered by backfill before routing reached them; dropped once, live.
  private readonly unrouted = new Set<number>();

  constructor(private readonly options: ProcessorQueueOptions) {}

  get isClosed(): boolean {
    return this.closed;
  }

  /** Resolves at once behind a replay, so a pass never waits out a backfill. */
  live(ops: OperationWithContext[]): Promise<void> {
    const delivered = this.push((done) => ({ kind: "live", ops, done }));
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
    return disconnect;
  }

  private replay(
    kind: "backfill" | "retry",
    run: () => Promise<void>,
  ): Promise<void> {
    if (this.closed) return Promise.resolve();
    this.replaysAhead++;
    return this.enqueue(kind, async () => {
      try {
        await run();
      } finally {
        this.replaysAhead--;
      }
    });
  }

  private enqueue(
    kind: "backfill" | "retry" | "disconnect",
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
        let next = this.tasks[0];
        while (isDelivery(next)) {
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
    this.overlap = undefined;
    this.running = false;
  }

  private async deliverLive(batch: Delivery[]): Promise<void> {
    const { cursor, floor } = this.options;
    const overlap = this.overlap;
    const ops: OperationWithContext[] = [];
    let through = 0;
    for (const task of batch) {
      if (task.kind === "live") ops.push(...task.ops);
      else through = Math.max(through, task.through);
    }
    const fresh = ops.filter((op) => {
      const ordinal = op.context.ordinal;
      if (ordinal <= floor || overlap?.has(ordinal)) return false;
      return !this.unrouted.delete(ordinal);
    });
    if (fresh.length === 0) {
      await this.raiseCursor(through);
      return;
    }

    if (cursor.status !== "active") {
      await this.parkBelow(fresh);
      return;
    }

    if (!(await this.deliver(fresh))) {
      await this.parkBelow(fresh);
      return;
    }

    await this.raiseCursor(Math.max(highestOf(fresh), through));
  }

  private async runBackfill(): Promise<void> {
    const { cursor, filter, floor } = this.options;
    if (cursor.status !== "active") return;

    const overlap = (this.overlap ??= new Set());
    let page: PagedResults<OperationWithContext>;
    try {
      page = await this.options.readSince(cursor.lastOrdinal);
    } catch (error) {
      await this.fail(error, "reading backfill");
      return;
    }

    while (page.results.length > 0) {
      if (this.closed) return;

      const matching = page.results.filter(
        (op) => op.context.ordinal > floor && matchesFilter(op, filter),
      );
      if (matching.length > 0) {
        if (!(await this.deliver(matching))) {
          await this.persist();
          return;
        }
        const routed = this.options.routedThrough();
        for (const op of matching) {
          const ordinal = op.context.ordinal;
          (ordinal > routed ? this.unrouted : overlap).add(ordinal);
        }
      }

      await this.raiseCursor(highestOf(page.results));

      if (!page.next) break;
      try {
        page = await page.next();
      } catch (error) {
        await this.fail(error, "reading backfill");
        return;
      }
    }
  }

  private async deliver(ops: OperationWithContext[]): Promise<boolean> {
    try {
      await this.options.processor.onOperations(ops);
      return true;
    } catch (error) {
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
  }

  private async raiseCursor(through: number): Promise<void> {
    const { cursor } = this.options;
    if (cursor.status !== "active") return;
    if (through <= cursor.lastOrdinal) return;
    cursor.lastOrdinal = through;
    await this.persist();
  }

  // Retry and restart replay from the cursor, so it must stay below a miss.
  private async parkBelow(missed: OperationWithContext[]): Promise<void> {
    const { cursor } = this.options;
    cursor.lastOrdinal = Math.min(cursor.lastOrdinal, lowestOf(missed) - 1);
    await this.persist();
  }

  private async persist(): Promise<void> {
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
