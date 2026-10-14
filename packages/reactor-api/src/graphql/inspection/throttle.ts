import { GraphQLError } from "graphql";

export type InspectionThrottleConfig = {
  /** Per caller, also the burst; admins exempt (PH_INSPECTION_CALLS_PER_MINUTE). */
  callsPerMinute: number;
};

export const DEFAULT_INSPECTION_THROTTLE: InspectionThrottleConfig = {
  callsPerMinute: 6,
};

const MAX_TRACKED_CALLERS = 10_000;

// Absorbs float error so waiting exactly retryAfterMs refills a whole call.
const EPSILON = 1e-9;

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

  /** Callers with a bucket, at most the 10,000 most recently seen. */
  get trackedCallers(): number {
    return this.#buckets.size;
  }

  /** Spends one of the caller's calls; throws when none is left. */
  charge(caller: string): void {
    const cap = this.#cap;
    const perMs = cap / 60_000;
    const now = performance.now();
    const bucket = this.#buckets.get(caller);
    const tokens = bucket
      ? Math.min(cap, bucket.tokens + (now - bucket.at) * perMs)
      : cap;
    // Re-inserted so the map's first key is the least recently seen caller.
    this.#buckets.delete(caller);
    if (tokens < 1 - EPSILON) {
      this.#buckets.set(caller, { tokens, at: now });
      throw new InspectionThrottledError(Math.ceil((1 - tokens) / perMs));
    }
    this.#buckets.set(caller, { tokens: Math.max(0, tokens - 1), at: now });
    if (this.#buckets.size > MAX_TRACKED_CALLERS) {
      // Evicting resets that caller to a full bucket.
      this.#buckets.delete(this.#buckets.keys().next().value!);
    }
  }
}
