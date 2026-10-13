import { GraphQLError } from "graphql";

export type InspectionThrottleConfig = {
  /** Replays and drive checks running at once (PH_INSPECTION_MAX_CONCURRENT). */
  maxConcurrent: number;
  /** Waiting calls past which non-admins are refused (PH_INSPECTION_MAX_QUEUED). */
  maxQueued: number;
  /** Per caller, also the burst; admins exempt (PH_INSPECTION_CALLS_PER_MINUTE). */
  callsPerMinute: number;
};

export const DEFAULT_INSPECTION_THROTTLE: InspectionThrottleConfig = {
  maxConcurrent: 2,
  maxQueued: 8,
  callsPerMinute: 6,
};

const QUEUE_FULL_RETRY_MS = 1000;
const PRUNE_ABOVE = 10_000;

export class InspectionThrottledError extends GraphQLError {
  constructor(retryAfterMs: number) {
    super("Too many inspection reads; retry later", {
      extensions: { code: "TOO_MANY_REQUESTS", retryAfterMs },
    });
  }
}

function refused<T>(): Promise<T> {
  return Promise.reject(new InspectionThrottledError(QUEUE_FULL_RETRY_MS));
}

export type InspectionSlotOptions = {
  /** Waits past `maxQueued` instead of being refused. */
  unbounded?: boolean;
};

export class InspectionThrottle {
  readonly #config: InspectionThrottleConfig;
  #running = 0;
  readonly #waiting: (() => void)[] = [];
  readonly #buckets = new Map<string, { tokens: number; at: number }>();
  readonly #inFlight = new Map<string, Promise<unknown>>();

  constructor(config: Partial<InspectionThrottleConfig> = {}) {
    this.#config = { ...DEFAULT_INSPECTION_THROTTLE, ...config };
  }

  /** Callers with a bucket still refilling. */
  get trackedCallers(): number {
    return this.#buckets.size;
  }

  /** Spends one of the caller's calls; throws when none is left. */
  charge(caller: string): void {
    const cap = this.#config.callsPerMinute;
    const perMs = cap / 60_000;
    const now = Date.now();
    const bucket = this.#buckets.get(caller);
    const tokens = bucket
      ? Math.min(cap, bucket.tokens + (now - bucket.at) * perMs)
      : cap;
    if (tokens < 1) {
      throw new InspectionThrottledError(Math.ceil((1 - tokens) / perMs));
    }
    this.#buckets.set(caller, { tokens: tokens - 1, at: now });
    if (this.#buckets.size > PRUNE_ABOVE) this.#prune(now, cap, perMs);
  }

  /** Concurrent calls with one key share one run; a refused call is not shared. */
  shared<T>(
    key: string,
    run: () => Promise<T>,
    options: InspectionSlotOptions = {},
  ): Promise<T> {
    const existing = this.#inFlight.get(key) as Promise<T> | undefined;
    if (existing) return existing;
    const slot = this.#acquire(options);
    if (!slot) return refused();
    const pending = this.#runIn(slot, run).finally(() =>
      this.#inFlight.delete(key),
    );
    this.#inFlight.set(key, pending);
    return pending;
  }

  limited<T>(
    run: () => Promise<T>,
    options: InspectionSlotOptions = {},
  ): Promise<T> {
    const slot = this.#acquire(options);
    return slot ? this.#runIn(slot, run) : refused();
  }

  async #runIn<T>(slot: Promise<void>, run: () => Promise<T>): Promise<T> {
    await slot;
    try {
      return await run();
    } finally {
      this.#release();
    }
  }

  // Decided synchronously, so a refused call never enters #inFlight.
  #acquire(options: InspectionSlotOptions): Promise<void> | undefined {
    if (this.#running < this.#config.maxConcurrent) {
      this.#running++;
      return Promise.resolve();
    }
    if (!options.unbounded && this.#waiting.length >= this.#config.maxQueued) {
      return undefined;
    }
    return new Promise((resolve) => this.#waiting.push(resolve));
  }

  #release(): void {
    const next = this.#waiting.shift();
    if (next) next();
    else this.#running--;
  }

  // A bucket refilled to capacity is the same as no bucket.
  #prune(now: number, cap: number, perMs: number): void {
    for (const [key, b] of this.#buckets) {
      if (b.tokens + (now - b.at) * perMs >= cap) this.#buckets.delete(key);
    }
  }
}
