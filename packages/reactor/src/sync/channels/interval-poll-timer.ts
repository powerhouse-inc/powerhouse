import type { IPollTimer } from "./poll-timer.js";

/**
 * Default poll timer using setTimeout.
 * Waits for delegate completion before scheduling next tick.
 */
export class IntervalPollTimer implements IPollTimer {
  private delegate: (() => Promise<void>) | undefined;
  private timer: NodeJS.Timeout | undefined;
  private running: boolean;

  constructor(private readonly intervalMs: number) {
    this.running = false;
  }

  setDelegate(delegate: () => Promise<void>): void {
    this.delegate = delegate;
  }

  start(): void {
    this.running = true;
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
    void this.delegate()
      .then(() => this.scheduleNext())
      .catch(() => {
        // Delegate errors are not propagated; timer stops on error
      });
  }

  private scheduleNext(): void {
    if (!this.running) return;
    this.timer = setTimeout(() => this.tick(), this.intervalMs);
  }
}
