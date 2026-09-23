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
  persist: (cursor: ProcessorCursorState) => Promise<void>;
  logger: ILogger;
};

type Task = {
  kind: "live" | "advance" | "backfill" | "retry" | "disconnect";
  run: () => Promise<void>;
  done: () => void;
};

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
  private pendingAdvance: { through: number } | undefined;
  // Ordinals a backfill delivered, open until the queue drains.
  private overlap: Set<number> | undefined;

  constructor(private readonly options: ProcessorQueueOptions) {}

  get isClosed(): boolean {
    return this.closed;
  }

  /** Delivers operations that already match the filter. */
  live(ops: OperationWithContext[]): Promise<void> {
    return this.enqueue("live", () => this.deliverLive(ops));
  }

  /** Raises the cursor past a batch with nothing for this processor. */
  advance(through: number): Promise<void> {
    const last = this.tasks.at(-1);
    if (last?.kind === "advance" && this.pendingAdvance) {
      this.pendingAdvance.through = Math.max(
        this.pendingAdvance.through,
        through,
      );
      return Promise.resolve();
    }

    const pending = { through };
    this.pendingAdvance = pending;
    return this.enqueue("advance", async () => {
      if (this.pendingAdvance === pending) this.pendingAdvance = undefined;
      await this.raiseCursor(pending.through);
    });
  }

  /** Replays from the cursor as it stands when the task runs. */
  backfill(): Promise<void> {
    return this.enqueue("backfill", () => this.runBackfill());
  }

  /** Clears an error and replays from the cursor. No-op when active. */
  retry(): Promise<void> {
    return this.enqueue("retry", async () => {
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

  private enqueue(kind: Task["kind"], run: () => Promise<void>): Promise<void> {
    if (this.closed) return Promise.resolve();

    return new Promise<void>((resolve) => {
      this.tasks.push({ kind, run, done: resolve });
      if (this.running) return;
      this.running = true;
      // Never start user code on the caller's stack.
      queueMicrotask(() => void this.drain());
    });
  }

  private async drain(): Promise<void> {
    while (this.tasks.length > 0) {
      const task = this.tasks.shift()!;
      try {
        await task.run();
      } catch (error) {
        this.options.logger.error(
          "Processor '@ProcessorId' task '@Kind' failed: @Error",
          this.options.processorId,
          task.kind,
          error,
        );
      } finally {
        task.done();
      }
    }
    this.overlap = undefined;
    this.running = false;
  }

  private async deliverLive(ops: OperationWithContext[]): Promise<void> {
    const { cursor, floor } = this.options;
    const overlap = this.overlap;
    const fresh = ops.filter(
      (op) => op.context.ordinal > floor && !overlap?.has(op.context.ordinal),
    );
    if (fresh.length === 0) return;

    if (cursor.status !== "active") {
      await this.parkBelow(fresh);
      return;
    }

    if (!(await this.deliver(fresh))) {
      await this.parkBelow(fresh);
      return;
    }

    await this.raiseCursor(highestOf(fresh));
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
        for (const op of matching) overlap.add(op.context.ordinal);
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
