// Admits runs across all workflows, after each workflow's own run gate (ADR
// 0007 §5): a cap on runs in flight, and a hold while the main thread is busy.
import type { EventLoopReading } from "./event-loop.js";
import { WorkflowRuntimeClosedError } from "./shutdown.js";

export const DEFAULT_ADMIT_MAX_ELU = 0.8;

export interface RunDispatcherOptions {
  maxInFlight: number;
  // Event-loop utilization above which no new run is admitted.
  maxElu?: number;
  loop: EventLoopReading;
}

export interface RunDispatcherStats {
  inFlight: number;
  waiting: number;
}

interface Waiter {
  workflowId: string;
  resolve: (release: () => void) => void;
  reject: (error: unknown) => void;
}

export class RunDispatcher {
  private readonly maxInFlight: number;
  private readonly maxElu: number;
  private readonly loop: EventLoopReading;
  private readonly waiters: Waiter[] = [];
  private inFlight = 0;
  private closed = false;
  private readonly unsubscribe: () => void;

  constructor(options: RunDispatcherOptions) {
    this.maxInFlight = Math.max(1, Math.trunc(options.maxInFlight));
    this.maxElu = options.maxElu ?? DEFAULT_ADMIT_MAX_ELU;
    this.loop = options.loop;
    // A busy loop that eases admits whoever waited on it.
    this.unsubscribe = this.loop.onSample(() => this.drain());
  }

  // Resolves with the release once the run may start, in arrival order.
  // `onQueue` runs synchronously when the run has to wait.
  admit(workflowId: string, onQueue?: () => void): Promise<() => void> {
    if (this.closed) {
      return Promise.reject(new WorkflowRuntimeClosedError(workflowId));
    }
    if (this.waiters.length === 0 && this.room()) {
      return Promise.resolve(this.take());
    }
    onQueue?.();
    return new Promise((resolve, reject) => {
      this.waiters.push({ workflowId, resolve, reject });
    });
  }

  stats(): RunDispatcherStats {
    return { inFlight: this.inFlight, waiting: this.waiters.length };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.unsubscribe();
    for (const waiter of this.waiters.splice(0)) {
      waiter.reject(new WorkflowRuntimeClosedError(waiter.workflowId));
    }
  }

  // A run always gets in when none is running, so a loop that never eases
  // (PGlite flushing on it) still makes progress.
  private room(): boolean {
    if (this.inFlight === 0) return true;
    return (
      this.inFlight < this.maxInFlight && this.loop.utilization() <= this.maxElu
    );
  }

  private take(): () => void {
    this.inFlight++;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.inFlight--;
      this.drain();
    };
  }

  private drain(): void {
    while (this.waiters.length > 0 && !this.closed && this.room()) {
      this.waiters.shift()!.resolve(this.take());
    }
  }
}
