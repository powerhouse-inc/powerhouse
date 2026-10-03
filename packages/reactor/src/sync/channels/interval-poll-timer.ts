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
  /**
   * How long one tick's delegate may run before the tick is CANCELLED - its
   * abort signal fired - and the next tick scheduled from its settlement.
   * Ticks are scheduled only from the delegate's settlement, so a delegate that
   * neither resolves nor rejects used to leave nothing pending at all: the loop
   * was dead forever, silently, with nothing but an external `triggerNow()`
   * able to revive it. Defaults to ten intervals, with a floor of
   * {@link DELEGATE_TIMEOUT_FLOOR_MS}; a channel passes its own bound,
   * comfortably above its request deadline, so a slow but live poll is never
   * cancelled. Zero or less disables the bound, which is what an unbounded
   * delegate - a channel whose own request deadline is off - asks for.
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
 * bounded: a tick that has not settled within `delegateTimeoutMs`, and a size
 * probe that has not answered within `queueProbeTimeoutMs`, are CANCELLED
 * through the tick's abort signal, and the next tick is scheduled from the
 * cancelled tick's settlement.
 *
 * Exactly one delegate runs at a time, under every path. The watchdog used to
 * invalidate the tick's token and schedule the next one while the old delegate
 * was still running and uncancelled: a second poll then ran alongside the
 * first, on a channel with no reentrancy guard, ingesting the same envelopes
 * twice and interleaving cursor writes. Cancelling and waiting is what makes
 * the bound safe, and it is why the delegate contract (see
 * {@link PollDelegate}) requires settling once aborted - a delegate that
 * ignores its signal stalls its own loop, which is the lesser of the two
 * failures. A `triggerNow()` during a tick is remembered and fires as soon as
 * it settles, rather than running a second delegate alongside it and orphaning
 * a timer.
 */
export class IntervalPollTimer implements IPollTimer {
  private delegate: PollDelegate | undefined;
  private timer: NodeJS.Timeout | undefined;
  private watchdog: NodeJS.Timeout | undefined;
  private running: boolean;
  private paused: boolean;
  private consecutiveFailures: number;
  /** Identifies the tick in flight; a stale settlement is ignored. */
  private tickToken = 0;
  private ticking = false;
  /** Cancels the tick in flight; the watchdog and `stop()` fire it. */
  private tickAbort: AbortController | undefined;
  /** The tick the watchdog cancelled, so its settlement counts as a failure. */
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

  /**
   * Stops the loop and cancels the tick in flight. The token is invalidated so
   * a late settlement from that tick cannot schedule anything, and `ticking` is
   * cleared so a later `start()` is not mistaken for a reentrant trigger.
   */
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
      // A second concurrent delegate would orphan this tick's timer and, for a
      // poll, re-fetch the same page. Remember the request instead.
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
        // The watchdog gave up on the probe; count it and move the loop on.
        this.settle(token, "failure");
        return;
      }
      if (size === "unknown") {
        // Depth unknown rather than low: polling risks adding work, while not
        // polling risks a channel that never ingests again. Poll.
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

  /**
   * `"unknown"` when the depth could not be established, whether the probe
   * timed out or rejected. Both fail open the same way: the delegate runs.
   * `"cancelled"` when the tick itself was cancelled while the probe was still
   * outstanding, which ends the tick rather than polling.
   *
   * A rejection used to settle the tick as a SUCCESS instead, which skipped the
   * delegate, reset `consecutiveFailures` and rescheduled at the normal
   * interval - so a probe that throws persistently (a wedged shared session
   * does exactly that to anything reading the queue) meant the channel never
   * polled again while its failure counters read clean. The outcome a tick
   * never ran cannot be "success"; and whatever the probe does, not polling is
   * the one choice that can strand a channel forever.
   */
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
    // A probe with no bound of its own - or one outlasting the tick's - must
    // still end when the tick is cancelled, or nothing is left pending.
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
      // A settlement from a tick `stop()` invalidated.
      return;
    }
    this.clearWatchdog();
    this.ticking = false;
    this.tickAbort = undefined;
    // A cancelled tick settles however the delegate chose to settle, but the
    // loop treats it as the failure it is: it did not finish its work.
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

  /**
   * Cancels the tick rather than abandoning it. Abandoning it - invalidating
   * the token, clearing `ticking` and scheduling the next tick while the old
   * delegate ran on, uncancelled - put two polls on one channel at once:
   * duplicate envelope ingestion and interleaved cursor writes, on a channel
   * with no reentrancy guard. The next tick is scheduled from this tick's
   * settlement, which the cancellation is there to bring about.
   */
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
