/** Limits how many processor backfills scan the operation log at once. */
export interface IBackfillSlots {
  /** Resolves with a release once a slot is free; release exactly once. */
  acquire(): Promise<() => void>;
}

/** Backfills beyond this wait for a slot, so live reads keep reaching the store. */
export const DEFAULT_MAX_CONCURRENT_BACKFILLS = 3;

/** A FIFO counting semaphore. */
export class BackfillSlots implements IBackfillSlots {
  private free: number;
  private readonly waiting: (() => void)[] = [];

  constructor(size: number = DEFAULT_MAX_CONCURRENT_BACKFILLS) {
    if (!Number.isInteger(size) || size < 1) {
      throw new Error(
        `Backfill slots must be a positive integer, not ${String(size)}`,
      );
    }
    this.free = size;
  }

  acquire(): Promise<() => void> {
    if (this.free > 0) {
      this.free--;
      return Promise.resolve(this.releaser());
    }
    return new Promise((resolve) => {
      this.waiting.push(() => resolve(this.releaser()));
    });
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      const next = this.waiting.shift();
      if (next) next();
      else this.free++;
    };
  }
}

/** No limit: every backfill gets a slot at once. */
export const UNLIMITED_BACKFILL_SLOTS: IBackfillSlots = {
  acquire: () => Promise.resolve(() => {}),
};

// Captured at load, so a test that fakes timers cannot freeze a backfill.
const realSetImmediate: ((run: () => void) => unknown) | undefined =
  typeof globalThis.setImmediate === "function"
    ? globalThis.setImmediate.bind(globalThis)
    : undefined;
const realSetTimeout = globalThis.setTimeout.bind(globalThis);

/** Lets timers and I/O run before the next backfill page. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (realSetImmediate) realSetImmediate(resolve);
    else realSetTimeout(resolve, 0);
  });
}
