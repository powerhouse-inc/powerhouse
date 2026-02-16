import type { IQueue } from "../../queue/interfaces.js";
import type { IPollTimer } from "./poll-timer.js";

export type PollTimerConfig = {
  intervalMs: number;
  maxQueueDepth: number;
  backpressureCheckIntervalMs: number;
  retryBaseDelayMs: number;
  retryMaxDelayMs: number;
};

const DEFAULT_CONFIG: PollTimerConfig = {
  intervalMs: 2000,
  maxQueueDepth: 100,
  backpressureCheckIntervalMs: 500,
  retryBaseDelayMs: 1000,
  retryMaxDelayMs: 300000,
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

/**
 * Default poll timer using setTimeout.
 * Waits for delegate completion before scheduling next tick.
 * Checks queue depth and defers polling when backpressure is detected.
 */
export class IntervalPollTimer implements IPollTimer {
  private delegate: (() => Promise<void>) | undefined;
  private timer: NodeJS.Timeout | undefined;
  private running: boolean;
  private paused: boolean;
  private consecutiveFailures: number;
  private readonly queue: IQueue;
  private readonly config: PollTimerConfig;

  constructor(queue: IQueue, config: Partial<PollTimerConfig> = {}) {
    this.queue = queue;
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.running = false;
    this.paused = false;
    this.consecutiveFailures = 0;
  }

  setDelegate(delegate: () => Promise<void>): void {
    this.delegate = delegate;
  }

  start(): void {
    this.running = true;
    this.consecutiveFailures = 0;
    this.tick();
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  private tick(): void {
    if (!this.delegate || !this.running) return;

    const delegate = this.delegate;

    void this.queue
      .totalSize()
      .then((size) => {
        if (!this.running) return;
        if (size > this.config.maxQueueDepth) {
          this.scheduleBackpressureRecheck();
        } else {
          void delegate()
            .then(() => {
              this.consecutiveFailures = 0;
              this.scheduleNext();
            })
            .catch(() => {
              this.consecutiveFailures++;
              this.scheduleRetry();
            });
        }
      })
      .catch(() => {
        // Fail-open: schedule next at normal interval when totalSize() throws
        this.scheduleNext();
      });
  }

  private scheduleNext(): void {
    if (!this.running || this.paused) return;
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
    this.timer = setTimeout(() => this.tick(), delay);
  }

  private scheduleBackpressureRecheck(): void {
    if (!this.running || this.paused) return;
    this.timer = setTimeout(
      () => this.tick(),
      this.config.backpressureCheckIntervalMs,
    );
  }

  pause(): void {
    this.paused = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = undefined;
    }
  }

  resume(): void {
    this.paused = false;
    if (this.running) {
      this.scheduleNext();
    }
  }

  triggerNow(): void {
    if (this.running && this.delegate) {
      this.tick();
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  isRunning(): boolean {
    return this.running;
  }
}
