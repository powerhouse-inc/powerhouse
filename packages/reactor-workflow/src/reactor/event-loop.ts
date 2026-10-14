// The host main thread's event-loop utilization, sampled each second. It is
// what bounds throughput (ADR 0007), so the run dispatcher admits against it.
import { performance } from "node:perf_hooks";

const SAMPLE_MS = 1_000;

export interface EventLoopReading {
  // Share of the last sample the loop was busy, 0 to 1.
  utilization(): number;
  // Called after each sample; returns the unsubscribe.
  onSample(listener: () => void): () => void;
}

export class EventLoopMonitor implements EventLoopReading {
  private last = performance.eventLoopUtilization();
  private current = 0;
  private timer: NodeJS.Timeout | undefined;
  private readonly listeners = new Set<() => void>();

  start(): void {
    if (this.timer) return;
    this.last = performance.eventLoopUtilization();
    this.timer = setInterval(() => this.sample(), SAMPLE_MS);
    this.timer.unref();
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }

  utilization(): number {
    return this.current;
  }

  onSample(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private sample(): void {
    const now = performance.eventLoopUtilization();
    this.current = performance.eventLoopUtilization(now, this.last).utilization;
    this.last = now;
    for (const listener of this.listeners) listener();
  }
}
