/** Limits how many processor backfills scan the operation log at once. */
export interface IBackfillSlots {
  /**
   * Resolves with a release once a slot is free; release exactly once. When
   * `cancel` aborts first, the wait ends with a no-op release and no slot.
   */
  acquire(cancel?: AbortSignal): Promise<() => void>;
  /** True while more slots are held than the size allows, after a lower. */
  oversubscribed(): boolean;
}

/** Backfills beyond this wait for a slot, so live reads keep reaching the store. */
export const DEFAULT_MAX_CONCURRENT_BACKFILLS = 3;

type Waiter = (release: () => void) => void;

function assertSize(size: number): void {
  if (!Number.isInteger(size) || size < 0) {
    throw new Error(
      `Backfill slots must be a non-negative integer, not ${String(size)}`,
    );
  }
}

/**
 * A FIFO counting semaphore whose size can change. A raise hands slots to
 * waiters at once; a lower lets holders keep theirs until they release, so new
 * acquires wait, and `oversubscribed` tells holders to give theirs back. At
 * size 0 nothing acquires.
 */
export class BackfillSlots implements IBackfillSlots {
  private limit: number;
  private held = 0;
  private readonly waiting: Waiter[] = [];

  constructor(size: number = DEFAULT_MAX_CONCURRENT_BACKFILLS) {
    assertSize(size);
    this.limit = size;
  }

  get size(): number {
    return this.limit;
  }

  get inUse(): number {
    return this.held;
  }

  get waiters(): number {
    return this.waiting.length;
  }

  oversubscribed(): boolean {
    return this.held > this.limit;
  }

  acquire(cancel?: AbortSignal): Promise<() => void> {
    if (this.waiting.length === 0 && this.held < this.limit) {
      this.held++;
      return Promise.resolve(this.releaser());
    }
    if (cancel?.aborted) return Promise.resolve(() => {});
    return new Promise((resolve) => {
      // The listener goes with the wait, so a long-lived signal collects none.
      const onAbort = () => {
        const index = this.waiting.indexOf(waiter);
        if (index === -1) return;
        this.waiting.splice(index, 1);
        resolve(() => {});
      };
      const waiter: Waiter = (release) => {
        cancel?.removeEventListener("abort", onAbort);
        resolve(release);
      };
      this.waiting.push(waiter);
      cancel?.addEventListener("abort", onAbort, { once: true });
    });
  }

  resize(size: number): void {
    assertSize(size);
    this.limit = size;
    this.grant();
  }

  private grant(): void {
    while (this.held < this.limit && this.waiting.length > 0) {
      this.held++;
      this.waiting.shift()!(this.releaser());
    }
  }

  private releaser(): () => void {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.held--;
      this.grant();
    };
  }
}

/** No limit: every backfill gets a slot at once. */
export const UNLIMITED_BACKFILL_SLOTS: IBackfillSlots = {
  acquire: () => Promise.resolve(() => {}),
  oversubscribed: () => false,
};

// Captured at load, so a test that fakes timers cannot freeze a backfill.
const realSetImmediate: ((run: () => void) => unknown) | undefined =
  typeof globalThis.setImmediate === "function"
    ? globalThis.setImmediate.bind(globalThis)
    : undefined;
const realSetTimeout = globalThis.setTimeout.bind(globalThis);
const realClearTimeout = globalThis.clearTimeout.bind(globalThis);

/** Lets timers and I/O run before the next backfill page. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (realSetImmediate) realSetImmediate(resolve);
    else realSetTimeout(resolve, 0);
  });
}

/** Waits `ms` on the real clock, or until `cancel` aborts. */
export function pauseFor(ms: number, cancel?: AbortSignal): Promise<void> {
  if (cancel?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const onAbort = () => {
      realClearTimeout(timer);
      resolve();
    };
    const timer = realSetTimeout(() => {
      cancel?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    cancel?.addEventListener("abort", onAbort, { once: true });
  });
}
