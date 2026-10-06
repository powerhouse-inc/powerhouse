// `policy.concurrency`, enforced: how many runs of ONE workflow may execute
// at once, and what happens to a firing that arrives while the limit is full.
//
// Process-local, and correctly so: workflow execution is a singleton pinned to
// one reactor, so this process IS the deployment's
// run set. A gate in the database would be a second claim on the same fact.
import type { EffectiveRunPolicy } from "./policy.js";
import { concurrencyLimit } from "./policy.js";

interface Lane {
  active: number;
  waiting: (() => void)[];
}

/** What a firing may do. */
export type GateAdmission =
  | { admitted: true; release: () => void }
  // SINGLETON, and a run is already going: this firing is dropped, not queued.
  | { admitted: false; reason: string };

export class WorkflowRunGate {
  private readonly lanes = new Map<string, Lane>();

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
   * - **PARALLEL** with no `maxParallelRuns`: no gate at all, so the hot path
   *   of a workflow that asked for nothing costs nothing.
   * - **PARALLEL** with a bound, and **QUEUE**: waits, first come first
   *   served. Latency, not failure — which is what QUEUE means.
   * - **SINGLETON**: refused outright while a run is active. The caller
   *   journals the refusal rather than dropping it silently, because a firing
   *   that vanished is indistinguishable from a trigger that never fired.
   */
  async admit(
    workflowId: string,
    policy: EffectiveRunPolicy,
  ): Promise<GateAdmission> {
    const limit = concurrencyLimit(policy);
    if (limit === null) return { admitted: true, release: () => undefined };

    const lane = this.lanes.get(workflowId) ?? { active: 0, waiting: [] };
    this.lanes.set(workflowId, lane);

    if (lane.active >= limit) {
      if (policy.concurrency === "SINGLETON") {
        this.forgetIfIdle(workflowId, lane);
        return {
          admitted: false,
          reason:
            "Skipped: this workflow's concurrency is SINGLETON and a run was " +
            "already executing",
        };
      }
      // The release that wakes this counts the run in on its behalf, so the
      // slot is reserved across the await and a later arrival cannot take it.
      await new Promise<void>((resolve) => lane.waiting.push(resolve));
    } else {
      lane.active += 1;
    }

    let released = false;
    return {
      admitted: true,
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
          next();
          return;
        }
        this.forgetIfIdle(workflowId, lane);
      },
    };
  }

  private forgetIfIdle(workflowId: string, lane: Lane): void {
    if (lane.active === 0 && lane.waiting.length === 0) {
      this.lanes.delete(workflowId);
    }
  }
}
