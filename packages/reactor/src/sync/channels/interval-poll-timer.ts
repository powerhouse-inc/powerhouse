import type { IQueue } from "../../queue/interfaces.js";
import type { IPollTimer } from "./poll-timer.js";

export type PollTimerConfig = {
  intervalMs: number;
  maxQueueDepth: number;
  backpressureCheckIntervalMs: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
  /**
   * If true, start() puts the timer into a paused state — running but not ticking.
   * Use resume() to begin scheduling ticks, or triggerNow() to fire a single tick
   * without leaving the paused state. Defaults to false (auto-tick on start).
   */
  startPaused: boolean;
  /**
   * How long one tick's delegate may run before the tick is abandoned and the
   * next one scheduled. Ticks are scheduled only from the delegate's
   * settlement, so a delegate that neither resolves nor rejects used to leave
   * nothing pending at all: the loop was dead forever, silently, with nothing
   * but an external `triggerNow()` able to revive it. Defaults to ten
   * intervals, with a floor of {@link DELEGATE_TIMEOUT_FLOOR_MS}; a channel
   * passes its own bound, comfortably above its request deadline, so a slow
   * but live poll is never abandoned.
   */
  delegateTimeoutMs: number;
  /**
   * How long `queue.totalSize()` may take before the depth is treated as
   * unknown and the delegate run anyway. A size probe that hangs - which is
   * what a wedged shared database session does to anything that reads it -
   * otherwise killed the loop exactly as a hung delegate did.
   */
  queueProbeTimeoutMs: number;
};

/** Lower bound on the derived {@link PollTimerConfig.delegateTimeoutMs}. */
export const DELEGATE_TIMEOUT_FLOOR_MS = 30_000;

const DEFAULT_CONFIG: PollTimerConfig = {
  intervalMs: 2000,
  maxQueueDepth: 100,
  backpressureCheckIntervalMs: 500,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 300000,
  startPaused: false,
  delegateTimeoutMs: DELEGATE_TIMEOUT_FLOOR_MS,
  queueProbeTimeoutMs: 10_000,
};

export function calculateBackoffDelay(
  consecutiveFailures: number,
  retryBaseDelayMs: number,
  retryMaxDelayMs: number,
  random: number,
): number {
  const backoff = Math.min(
    retryMaxDelayMs,
    retryBaseDelayMs * Math.pow(2, consecutiveFailures - 1),
  );
  return backoff / 2 + random * (backoff / 2);
}

/** What ended a tick, and therefore how the next one is scheduled. */
type TickOutcome = "success" | "failure" | "backpressure" | "stopped";

/**
 * Default poll timer using setTimeout.
 *
 * Waits for delegate completion before scheduling the next tick, and checks
 * queue depth so polling defers under backpressure. Both of those waits are
 * bounded: a tick that does not settle within `delegateTimeoutMs`, and a size
 * probe that does not answer within `queueProbeTimeoutMs`, are abandoned so the
 * loop always has a next tick pending. Only one tick runs at a time; a
 * `triggerNow()` during a tick is remembered and fires as soon as it settles,
 * rather than running a second delegate alongside it and orphaning a timer.
 */
export class IntervalPollTimer implements IPollTimer {
  private delegate: (() => Promise<void>) | undefined;
  private timer: NodeJS.Timeout | undefined;
  private watchdog: NodeJS.Timeout | undefined;
  private running: boolean;
  private paused: boolean;
  private consecutiveFailures: number;
  /** Identifies the tick in flight; a stale settlement is ignored. */
  private tickToken = 0;
  private ticking = false;
  private retriggerRequested = false;
  private readonly queue: IQueue;
  private readonly config: PollTimerConfig;

  constructor(queue: IQueue, config: Partial<PollTimerConfig> = {}) {
    this.queue = queue;
    const intervalMs = config.intervalMs ?? DEFAULT_CONFIG.intervalMs;
    this.config = {
      ...DEFAULT_CONFIG,
      delegateTimeoutMs: Math.max(DELEGATE_TIMEOUT_FLOOR_MS, intervalMs * 10),
      ...config,
    };
    this.running = false;
    this.paused = this.config.startPaused;
    this.consecutiveFailures = 0;
  }

  setDelegate(delegate: () => Promise<void>): void {
    this.delegate = delegate;
  }

  start(): void {
    this.running = true;
    this.consecutiveFailures = 0;
    if (!this.paused) {
      this.tick();
    }
  }

  stop(): void {
    this.running = false;
    this.retriggerRequested = false;
    this.clearTimer();
    this.clearWatchdog();
  }

  pause(): void {
    this.paused = true;
    this.clearTimer();
  }

  resume(): void {
    this.paused = false;
    if (this.running) {
      this.scheduleNext();
    }
  }

  triggerNow(): void {
    if (!this.running || !this.delegate) {
      return;
    }
    this.tick();
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }

  getIntervalMs(): number {
    return this.config.intervalMs;
  }

  setIntervalMs(ms: number): void {
    this.config.intervalMs = ms;
  }

  private tick(): void {
    if (!this.delegate || !this.running) return;
    if (this.ticking) {
      // A second concurrent delegate would orphan this tick's timer and, for a
      // poll, re-fetch the same page. Remember the request instead.
      this.retriggerRequested = true;
      return;
    }

    const delegate = this.delegate;
    const token = ++this.tickToken;
    this.ticking = true;
    this.clearTimer();
    this.armWatchdog(token);

    void this.measureQueue().then((size) => {
      if (!this.running) {
        this.settle(token, "stopped");
        return;
      }
      if (size === "unmeasured") {
        this.settle(token, "success");
        return;
      }
      if (size === "unknown") {
        // Depth unknown rather than low: polling risks adding work, while not
        // polling risks a channel that never ingests again. Poll.
        this.runDelegate(delegate, token);
        return;
      }
      if (size > this.config.maxQueueDepth) {
        this.settle(token, "backpressure");
        return;
      }
      this.runDelegate(delegate, token);
    });
  }

  private runDelegate(delegate: () => Promise<void>, token: number): void {
    void delegate().then(
      () => this.settle(token, "success"),
      () => this.settle(token, "failure"),
    );
  }

  /**
   * `"unknown"` when the probe did not answer in time - poll anyway;
   * `"unmeasured"` when it rejected - keep the historical fail-open, which
   * skips the delegate and retries at the normal interval.
   */
  private async measureQueue(): Promise<number | "unknown" | "unmeasured"> {
    const timeoutMs = this.config.queueProbeTimeoutMs;
    let handle: NodeJS.Timeout | undefined;
    const expiry = new Promise<"unknown">((resolve) => {
      if (timeoutMs > 0) {
        handle = setTimeout(() => resolve("unknown"), timeoutMs);
      }
    });

    try {
      return await Promise.race([this.queue.totalSize(), expiry]);
    } catch {
      return "unmeasured";
    } finally {
      if (handle !== undefined) {
        clearTimeout(handle);
      }
    }
  }

  private settle(token: number, outcome: TickOutcome): void {
    if (token !== this.tickToken) {
      // The watchdog already abandoned this tick and moved the loop on.
      return;
    }
    this.clearWatchdog();
    this.ticking = false;

    if (outcome === "success") {
      this.consecutiveFailures = 0;
    } else if (outcome === "failure") {
      this.consecutiveFailures++;
    }

    if (outcome === "stopped" || !this.running) {
      return;
    }

    if (this.retriggerRequested) {
      this.retriggerRequested = false;
      this.tick();
      return;
    }

    if (outcome === "backpressure") {
      this.scheduleBackpressureRecheck();
    } else if (outcome === "failure") {
      this.scheduleRetry();
    } else {
      this.scheduleNext();
    }
  }

  private armWatchdog(token: number): void {
    const timeoutMs = this.config.delegateTimeoutMs;
    if (timeoutMs <= 0) {
      return;
    }
    this.watchdog = setTimeout(() => {
      this.watchdog = undefined;
      if (token !== this.tickToken) {
        return;
      }
      // Invalidate the tick in flight so its eventual settlement cannot
      // schedule a second next tick on top of this one.
      this.tickToken++;
      this.ticking = false;
      this.consecutiveFailures++;
      if (this.running) {
        this.scheduleRetry();
      }
    }, timeoutMs);
  }

  private clearWatchdog(): void {
    if (this.watchdog) {
      clearTimeout(this.watchdog);
      this.watchdog = undefined;
    }
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private scheduleNext(): void {
    if (!this.running || this.paused) return;
    this.clearTimer();
    this.timer = setTimeout(() => this.tick(), this.config.intervalMs);
  }

  private scheduleRetry(): void {
    if (!this.running || this.paused) return;
    const delay = calculateBackoffDelay(
      this.consecutiveFailures,
      this.config.retryBaseDelayMs,
      this.config.retryMaxDelayMs,
      Math.random(),
    );
    this.clearTimer();
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private scheduleBackpressureRecheck(): void {
    if (!this.running || this.paused) return;
    this.clearTimer();
    this.timer = setTimeout(
      () => this.tick(),
      this.config.backpressureCheckIntervalMs,
    );
  }
}
