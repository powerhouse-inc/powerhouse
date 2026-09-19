/**
 * Holds new claude processes while the account's five-hour window is nearly
 * spent. The CLI reports utilisation in `rate_limit_event` records, which the
 * driver surfaces at the end of each outcome, so the reading is always one
 * process stale: a wait only ends early when a concurrent process finishes
 * with a lower reading, otherwise it runs out after maxWaitMs.
 */
import { setTimeout as sleep } from "node:timers/promises";
import type { RateLimitUtilization } from "./schemas.js";

export interface ThrottleOptions {
  /** Five-hour utilisation at or above which new processes wait; 0 disables. */
  threshold: number;
  pollMs?: number;
  maxWaitMs?: number;
  log?: (line: string) => void;
  sleep?: (ms: number) => Promise<unknown>;
  now?: () => number;
}

export const THROTTLE_POLL_MS = 60_000;
export const THROTTLE_MAX_WAIT_MS = 15 * 60_000;

export class UtilizationThrottle {
  readonly threshold: number;
  readonly #pollMs: number;
  readonly #maxWaitMs: number;
  readonly #log: (line: string) => void;
  readonly #sleep: (ms: number) => Promise<unknown>;
  readonly #now: () => number;
  #last: RateLimitUtilization = { fiveHour: null, sevenDay: null };
  #waits = 0;

  constructor(opts: ThrottleOptions) {
    this.threshold = opts.threshold;
    this.#pollMs = opts.pollMs ?? THROTTLE_POLL_MS;
    this.#maxWaitMs = opts.maxWaitMs ?? THROTTLE_MAX_WAIT_MS;
    this.#log = opts.log ?? (() => undefined);
    this.#sleep = opts.sleep ?? sleep;
    this.#now = opts.now ?? Date.now;
  }

  get last(): RateLimitUtilization {
    return this.#last;
  }

  /** How many waits have started; for logs and tests. */
  get waits(): number {
    return this.#waits;
  }

  observe(u: RateLimitUtilization): void {
    if (u.fiveHour === null && u.sevenDay === null) return;
    this.#last = {
      fiveHour: u.fiveHour ?? this.#last.fiveHour,
      sevenDay: u.sevenDay ?? this.#last.sevenDay,
    };
  }

  shouldWait(): boolean {
    return (
      this.threshold > 0 &&
      this.#last.fiveHour !== null &&
      this.#last.fiveHour >= this.threshold
    );
  }

  /** Resolves when utilisation drops below the threshold or maxWaitMs passes. */
  async wait(): Promise<number> {
    if (!this.shouldWait()) return 0;
    this.#waits += 1;
    const startedAt = this.#now();
    this.#log(
      `throttle: five-hour window at ${pct(this.#last.fiveHour)} >= ${pct(this.threshold)}; waiting up to ${Math.round(this.#maxWaitMs / 60_000)} min`,
    );
    while (this.shouldWait()) {
      const elapsed = this.#now() - startedAt;
      if (elapsed >= this.#maxWaitMs) break;
      await this.#sleep(Math.min(this.#pollMs, this.#maxWaitMs - elapsed));
    }
    const waited = this.#now() - startedAt;
    this.#log(
      `throttle: resuming after ${Math.round(waited / 1000)}s (five-hour window at ${pct(this.#last.fiveHour)})`,
    );
    return waited;
  }
}

function pct(v: number | null): string {
  return v === null ? "?" : `${Math.round(v * 100)}%`;
}
