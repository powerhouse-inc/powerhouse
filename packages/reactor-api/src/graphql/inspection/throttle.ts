import { GraphQLError } from "graphql";

export type InspectionThrottleConfig = {
  /** Per caller, also the burst; admins exempt (PH_INSPECTION_CALLS_PER_MINUTE). */
  callsPerMinute: number;
};

export const DEFAULT_INSPECTION_THROTTLE: InspectionThrottleConfig = {
  callsPerMinute: 6,
};

const PRUNE_ABOVE = 10_000;

export class InspectionThrottledError extends GraphQLError {
  constructor(retryAfterMs: number) {
    super("Too many inspection reads; retry later", {
      extensions: { code: "TOO_MANY_REQUESTS", retryAfterMs },
    });
  }
}

export class InspectionThrottle {
  readonly #cap: number;
  readonly #buckets = new Map<string, { tokens: number; at: number }>();

  constructor(config: Partial<InspectionThrottleConfig> = {}) {
    const cap =
      config.callsPerMinute ?? DEFAULT_INSPECTION_THROTTLE.callsPerMinute;
    // Below 1 the bucket never holds a whole call.
    if (!Number.isFinite(cap) || cap < 1) {
      throw new Error(
        `Inspection throttle callsPerMinute must be a finite number >= 1, got ${cap}`,
      );
    }
    this.#cap = cap;
  }

  /** Callers with a bucket still refilling. */
  get trackedCallers(): number {
    return this.#buckets.size;
  }

  /** Spends one of the caller's calls; throws when none is left. */
  charge(caller: string): void {
    const cap = this.#cap;
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

  // A bucket refilled to capacity is the same as no bucket.
  #prune(now: number, cap: number, perMs: number): void {
    for (const [key, b] of this.#buckets) {
      if (b.tokens + (now - b.at) * perMs >= cap) this.#buckets.delete(key);
    }
  }
}
