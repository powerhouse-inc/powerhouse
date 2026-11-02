// One poller per owning runtime: wakes due DELAY waitpoints and expires
// overdue ones in batches, on a single timer armed for the next due time.
import type { ILogger } from "document-model";
import type { EndedWait, WorkflowRunStore } from "./store.js";

export const WAITPOINT_BATCH = 100;
// The timer never sleeps longer, so a missed nudge costs at most this.
export const WAITPOINT_POLL_MAX_MS = 5 * 60_000;
const WAITPOINT_RETRY_MS = 30_000;
// How stale the suspended-runs gauge may read before a scrape recounts.
const SUSPENDED_COUNT_MS = 30_000;

export interface WaitpointPollerDeps {
  store: () => Promise<WorkflowRunStore | undefined>;
  // Re-enters a run holding a COMPLETED waitpoint, through admission.
  resume: (runId: string) => Promise<void>;
  // Told of a WAITING run the store ended: its wait expired or is stranded.
  ended: (end: EndedWait) => Promise<void>;
  logger: Pick<ILogger, "warn">;
  // Rows per claim; WAITPOINT_BATCH by default.
  batch?: number;
}

export class WaitpointPoller {
  private running = false;
  private polling = false;
  private again = false;
  private timer?: ReturnType<typeof setTimeout>;
  private timerAt?: number;
  // A nudge that landed while a poll ran; the poll's own arm honours it.
  private nudged?: number;
  private suspended = 0;
  private suspendedAt = 0;
  private counting = false;

  constructor(private readonly deps: WaitpointPollerDeps) {}

  get active(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    void this.poll();
  }

  stop(): void {
    this.running = false;
    clearTimeout(this.timer);
    this.timer = undefined;
    this.timerAt = undefined;
    this.nudged = undefined;
  }

  // A waitpoint due sooner than the armed timer pulls it in.
  nudge(dueIso: string): void {
    if (!this.running) return;
    const due = Date.parse(dueIso);
    if (Number.isNaN(due)) return;
    if (this.polling) {
      this.nudged = Math.min(this.nudged ?? Infinity, due);
      return;
    }
    if (this.timerAt !== undefined && due >= this.timerAt) return;
    this.arm(due);
  }

  // WAITING runs as last counted; a stale count refreshes in the background.
  suspendedRuns(): number {
    if (Date.now() - this.suspendedAt > SUSPENDED_COUNT_MS) {
      void this.count();
    }
    return this.suspended;
  }

  async count(store?: WorkflowRunStore): Promise<number> {
    if (this.counting) return this.suspended;
    this.counting = true;
    try {
      const journal = store ?? (await this.deps.store());
      if (journal) {
        this.suspended = await journal.countWaitingRuns();
        this.suspendedAt = Date.now();
      }
    } catch (error) {
      this.deps.logger.warn("Counting suspended runs failed: @error", error);
    } finally {
      this.counting = false;
    }
    return this.suspended;
  }

  /** One pass: due delays and held resumes deliver, overdue waits expire, the
   * timer re-arms. */
  async poll(): Promise<void> {
    if (!this.running) return;
    if (this.polling) {
      this.again = true;
      return;
    }
    this.polling = true;
    let next = Date.now() + WAITPOINT_RETRY_MS;
    try {
      const store = await this.deps.store();
      if (!store) return;
      const batch = this.deps.batch ?? WAITPOINT_BATCH;
      do {
        this.again = false;
        const now = new Date().toISOString();
        const due = await store.claimDueDelayWaitpoints(now, batch);
        for (const runId of new Set(due.map((row) => row.run_id))) {
          await this.deps.resume(runId);
        }
        const { expired, ended } = await store.expireDueWaitpoints(now, batch);
        // A run whose wait closed without ending it, e.g. after a crash.
        const stranded = await store.endStrandedWaits(batch);
        for (const end of [...ended, ...stranded]) await this.deps.ended(end);
        if (
          due.length === batch ||
          expired.length === batch ||
          stranded.length === batch
        ) {
          this.again = true;
        }
      } while (this.again && this.active);
      // Redelivers a resume whose first delivery was skipped or failed; one
      // already in flight is a no-op, as the claim admits only one leg.
      for (const runId of await store.heldRunIds()) {
        await this.deps.resume(runId);
      }
      await this.count(store);
      const [delay, expiry] = await Promise.all([
        store.nextDelayDue(),
        store.nextExpiry(),
      ]);
      next = Math.min(
        delay ? Date.parse(delay) : Infinity,
        expiry ? Date.parse(expiry) : Infinity,
      );
    } catch (error) {
      this.deps.logger.warn("Waitpoint poll failed: @error", error);
    } finally {
      this.polling = false;
      if (this.nudged !== undefined) next = Math.min(next, this.nudged);
      this.nudged = undefined;
      if (this.active) this.arm(next);
    }
  }

  private arm(due: number): void {
    clearTimeout(this.timer);
    const delay = Math.min(
      Math.max(Number.isFinite(due) ? due - Date.now() : Infinity, 0),
      WAITPOINT_POLL_MAX_MS,
    );
    this.timerAt = Date.now() + delay;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.timerAt = undefined;
      void this.poll();
    }, delay);
    this.timer.unref();
  }
}
