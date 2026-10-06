import type { IQueue } from "../../queue/interfaces.js";
import type { IPollTimer, PollDelegate } from "./poll-timer.js";

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
  /** How long a tick may run before it is cancelled; 0 disables the bound. */
  delegateTimeoutMs: number;
  /** How long the queue depth probe may take before the delegate runs anyway. */
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

type TickOutcome = "success" | "failure" | "backpressure" | "stopped";

/**
 * Default poll timer using setTimeout. One delegate runs at a time; a stuck
 * tick is cancelled through its signal and the next is scheduled from its
 * settlement, never alongside it.
 */
export class IntervalPollTimer implements IPollTimer {
  private delegate: PollDelegate | undefined;
  private timer: NodeJS.Timeout | undefined;
  private watchdog: NodeJS.Timeout | undefined;
  private running: boolean;
  private paused: boolean;
  private consecutiveFailures: number;
  private tickToken = 0;
  private ticking = false;
  private tickAbort: AbortController | undefined;
  private cancelledToken: number | undefined;
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

  setDelegate(delegate: PollDelegate): void {
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
    this.cancelTick(new Error("poll timer stopped"));
    this.tickToken++;
    this.cancelledToken = undefined;
    this.ticking = false;
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
      this.retriggerRequested = true;
      return;
    }

    const delegate = this.delegate;
    const token = ++this.tickToken;
    this.ticking = true;
    this.cancelledToken = undefined;
    const abort = new AbortController();
    this.tickAbort = abort;
    this.clearTimer();
    this.armWatchdog(token);

    void this.measureQueue(abort.signal).then((size) => {
      if (!this.running) {
        this.settle(token, "stopped");
        return;
      }
      if (size === "cancelled") {
        this.settle(token, "failure");
        return;
      }
      if (size === "unknown") {
        // Not polling is the one choice that can strand a channel forever.
        this.runDelegate(delegate, token, abort.signal);
        return;
      }
      if (size > this.config.maxQueueDepth) {
        this.settle(token, "backpressure");
        return;
      }
      this.runDelegate(delegate, token, abort.signal);
    });
  }

  private runDelegate(
    delegate: PollDelegate,
    token: number,
    signal: AbortSignal,
  ): void {
    void delegate(signal).then(
      () => this.settle(token, "success"),
      () => this.settle(token, "failure"),
    );
  }

  /** `"unknown"` when the probe timed out or rejected; `"cancelled"` when the tick was. */
  private async measureQueue(
    signal: AbortSignal,
  ): Promise<number | "unknown" | "cancelled"> {
    const timeoutMs = this.config.queueProbeTimeoutMs;
    let handle: NodeJS.Timeout | undefined;
    const expiry = new Promise<"unknown">((resolve) => {
      if (timeoutMs > 0) {
        handle = setTimeout(() => resolve("unknown"), timeoutMs);
      }
    });
    const cancelled = new Promise<"cancelled">((resolve) => {
      if (signal.aborted) {
        resolve("cancelled");
        return;
      }
      signal.addEventListener("abort", () => resolve("cancelled"), {
        once: true,
      });
    });

    try {
      return await Promise.race([this.queue.totalSize(), expiry, cancelled]);
    } catch {
      return "unknown";
    } finally {
      if (handle !== undefined) {
        clearTimeout(handle);
      }
    }
  }

  private settle(token: number, outcome: TickOutcome): void {
    if (token !== this.tickToken) {
      return;
    }
    this.clearWatchdog();
    this.ticking = false;
    this.tickAbort = undefined;
    const cancelled = this.cancelledToken === token;
    this.cancelledToken = undefined;
    const effective: TickOutcome =
      cancelled && outcome !== "stopped" ? "failure" : outcome;

    if (effective === "success") {
      this.consecutiveFailures = 0;
    } else if (effective === "failure") {
      this.consecutiveFailures++;
    }

    if (effective === "stopped" || !this.running) {
      return;
    }

    if (this.retriggerRequested) {
      this.retriggerRequested = false;
      this.tick();
      return;
    }

    if (effective === "backpressure") {
      this.scheduleBackpressureRecheck();
    } else if (effective === "failure") {
      this.scheduleRetry();
    } else {
      this.scheduleNext();
    }
  }

  /** Cancels rather than abandons the tick, so two delegates never overlap. */
  private armWatchdog(token: number): void {
    const timeoutMs = this.config.delegateTimeoutMs;
    if (timeoutMs <= 0) {
      return;
    }
    this.watchdog = setTimeout(() => {
      this.watchdog = undefined;
      if (token !== this.tickToken || !this.ticking) {
        return;
      }
      this.cancelledToken = token;
      this.cancelTick(
        new Error(`poll delegate exceeded its ${timeoutMs}ms bound`),
      );
    }, timeoutMs);
  }

  private cancelTick(reason: Error): void {
    const abort = this.tickAbort;
    if (abort === undefined || abort.signal.aborted) {
      return;
    }
    abort.abort(reason);
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
