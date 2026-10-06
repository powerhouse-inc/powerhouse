// `policy.concurrency`, enforced: how many runs of ONE workflow may execute
// at once, and what happens to a firing that arrives while the limit is full.
//
// Process-local, and correctly so: workflow execution is a singleton pinned to
// one reactor (see singleton-lease.ts), so this process IS the deployment's
// run set. A gate in the database would be a second claim on the same fact.
import type { EffectiveRunPolicy } from "./policy.js";
import { concurrencyLimit } from "./policy.js";

interface Lane {
  active: number;
  // Resolved true with the slot handed over, false when the gate closed.
  waiting: ((admitted: boolean) => void)[];
}

const CLOSED_REASON =
  "Skipped: the workflow runtime shut down while this firing waited";

/** What a firing may do. */
export type GateAdmission =
  // `waited`: it queued, so what it read before admission may be stale.
  | { admitted: true; waited: boolean; release: () => void }
  // SINGLETON, and a run is already going: this firing is dropped, not queued.
  // Or the queue is full: see MAX_QUEUED_FIRINGS. Or the runtime shut down.
  | {
      admitted: false;
      reason: string;
      refusal: "singleton" | "queue-full" | "closed";
    };

export const QUEUE_DEPTH_ENV = "PH_WORKFLOWS_MAX_QUEUED_FIRINGS";

/**
 * How many firings of ONE workflow may wait for a slot.
 *
 * QUEUE means latency, not failure — but an unbounded queue means neither. A
 * document-event trigger on a busy type can enqueue faster than the workflow
 * runs for as long as the reactor is up, and every waiter holds its trigger
 * payload, its promise and (once admitted) a worker slot. The lane grows
 * without bound until the process dies, and nothing in the journal says why:
 * each waiting firing is a PENDING run row nobody is executing.
 *
 * So the queue has a depth, and a firing that overflows it is journaled
 * CANCELLED exactly as a SINGLETON refusal is — visible, rather than the
 * process-killing backlog it was.
 */
export const DEFAULT_MAX_QUEUED_FIRINGS = 100;

export function maxQueuedFirings(env: NodeJS.ProcessEnv = process.env): number {
  const raw = Number(env[QUEUE_DEPTH_ENV]);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_MAX_QUEUED_FIRINGS;
}

export class WorkflowRunGate {
  private readonly lanes = new Map<string, Lane>();
  private closed = false;

  // Read once per gate: an operator sets it at boot, and a lane that changed
  // its bound mid-flight would admit and refuse on different rules.
  private readonly maxQueued: number;

  constructor(options: { maxQueued?: number } = {}) {
    this.maxQueued = options.maxQueued ?? maxQueuedFirings();
  }

  /** Runs of this workflow executing right now. */
  active(workflowId: string): number {
    return this.lanes.get(workflowId)?.active ?? 0;
  }

  /** Firings of this workflow waiting for a slot. */
  waiting(workflowId: string): number {
    return this.lanes.get(workflowId)?.waiting.length ?? 0;
  }

  /**
   * Takes a slot for one run.
   *
   * - **PARALLEL** with no `maxParallelRuns`, or no policy at all: no gate,
   *   so an unbounded workflow's hot path costs nothing. Not the default: a
   *   workflow document starts as QUEUE.
   * - **PARALLEL** with a bound, and **QUEUE**: waits, first come first
   *   served. Latency, not failure — which is what QUEUE means, up to
   *   {@link DEFAULT_MAX_QUEUED_FIRINGS} waiters. Past that the queue is full
   *   and the firing is refused, so the caller journals it CANCELLED rather
   *   than growing a backlog nothing bounds.
   * - **SINGLETON**: refused outright while a run is active. The caller
   *   journals the refusal rather than dropping it silently, because a firing
   *   that vanished is indistinguishable from a trigger that never fired.
   */
  async admit(
    workflowId: string,
    policy: EffectiveRunPolicy,
  ): Promise<GateAdmission> {
    if (this.closed)
      return { admitted: false, reason: CLOSED_REASON, refusal: "closed" };
    const limit = concurrencyLimit(policy);
    if (limit === null) {
      return { admitted: true, waited: false, release: () => undefined };
    }

    const lane = this.lanes.get(workflowId) ?? { active: 0, waiting: [] };
    this.lanes.set(workflowId, lane);
    let waited = false;

    if (lane.active >= limit) {
      if (policy.concurrency === "SINGLETON") {
        this.forgetIfIdle(workflowId, lane);
        return {
          admitted: false,
          refusal: "singleton",
          reason:
            "Skipped: this workflow's concurrency is SINGLETON and a run was " +
            "already executing",
        };
      }
      if (lane.waiting.length >= this.maxQueued) {
        return {
          admitted: false,
          refusal: "queue-full",
          reason:
            `Skipped: ${lane.waiting.length} firings of this workflow are ` +
            `already waiting for a slot, which is its queue depth ` +
            `(${this.maxQueued}; raise ${QUEUE_DEPTH_ENV} to allow more)`,
        };
      }
      // The release that wakes this counts the run in on its behalf, so the
      // slot is reserved across the await and a later arrival cannot take it.
      const handed = await new Promise<boolean>((resolve) =>
        lane.waiting.push(resolve),
      );
      if (!handed)
        return { admitted: false, reason: CLOSED_REASON, refusal: "closed" };
      waited = true;
    } else {
      lane.active += 1;
    }

    let released = false;
    return {
      admitted: true,
      waited,
      release: () => {
        if (released) return;
        released = true;
        lane.active -= 1;
        // Handed straight to the next waiter rather than counted down and up
        // again, so a slot freed with someone waiting cannot be taken by a
        // later arrival.
        const next = lane.waiting.shift();
        if (next) {
          lane.active += 1;
          next(true);
          return;
        }
        this.forgetIfIdle(workflowId, lane);
      },
    };
  }

  /** Refuses every waiting and later firing: a shut-down runtime runs none. */
  close(): void {
    this.closed = true;
    for (const lane of this.lanes.values()) {
      for (const waiter of lane.waiting.splice(0)) waiter(false);
    }
  }

  private forgetIfIdle(workflowId: string, lane: Lane): void {
    if (lane.active === 0 && lane.waiting.length === 0) {
      this.lanes.delete(workflowId);
    }
  }
}
