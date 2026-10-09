// The concurrency gate in isolation: the modes, the bound, and that a slot is
// handed to the next waiter rather than left for a later arrival.
import { describe, expect, it } from "vitest";
import { effectiveRunPolicy, UNENFORCED_POLICY } from "./policy.js";
import {
  DEFAULT_MAX_QUEUED_FIRINGS,
  maxQueuedFirings,
  QUEUE_DEPTH_ENV,
  WorkflowRunGate,
} from "./run-gate.js";

const policyOf = (policy: Record<string, unknown>) =>
  effectiveRunPolicy({ policy } as never);

// One macrotask, so a waiter resolved by a release has actually continued.
const settled = () => new Promise((resolve) => setImmediate(resolve));

describe("the workflow run gate", () => {
  it("does not gate a definition that declares no policy", async () => {
    const gate = new WorkflowRunGate();

    const first = await gate.admit("w", UNENFORCED_POLICY);
    const second = await gate.admit("w", UNENFORCED_POLICY);

    expect(first.admitted).toBe(true);
    expect(second.admitted).toBe(true);
    // No lane is kept for a workflow that was never gated.
    expect(gate.active("w")).toBe(0);
  });

  it("refuses the second firing under SINGLETON", async () => {
    const gate = new WorkflowRunGate();
    const policy = policyOf({ concurrency: "SINGLETON" });

    const held = await gate.admit("w", policy);
    const refused = await gate.admit("w", policy);

    expect(held.admitted).toBe(true);
    expect(refused.admitted).toBe(false);
    if (!refused.admitted) expect(refused.reason).toContain("SINGLETON");
  });

  it("admits again once the held run releases", async () => {
    const gate = new WorkflowRunGate();
    const policy = policyOf({ concurrency: "SINGLETON" });
    const held = await gate.admit("w", policy);
    if (held.admitted) held.release();

    expect((await gate.admit("w", policy)).admitted).toBe(true);
  });

  it("queues under QUEUE and hands the slot on in order", async () => {
    const gate = new WorkflowRunGate();
    const policy = policyOf({ concurrency: "QUEUE" });
    const first = await gate.admit("w", policy);
    const order: number[] = [];
    const second = gate.admit("w", policy).then((a) => {
      order.push(2);
      return a;
    });
    const third = gate.admit("w", policy).then((a) => {
      order.push(3);
      return a;
    });

    expect(gate.waiting("w")).toBe(2);
    if (first.admitted) first.release();
    const admittedSecond = await second;
    expect(order).toEqual([2]);
    // The slot the release handed over is held, not up for grabs.
    expect(gate.active("w")).toBe(1);
    if (admittedSecond.admitted) admittedSecond.release();
    await third;
    expect(order).toEqual([2, 3]);
  });

  it("bounds PARALLEL at maxParallelRuns", async () => {
    const gate = new WorkflowRunGate();
    const policy = policyOf({ concurrency: "PARALLEL", maxParallelRuns: 2 });

    const a = await gate.admit("w", policy);
    const b = await gate.admit("w", policy);
    let third = false;
    void gate.admit("w", policy).then(() => (third = true));

    expect([a.admitted, b.admitted]).toEqual([true, true]);
    await settled();
    expect(third).toBe(false);
    if (a.admitted) a.release();
    await settled();
    expect(third).toBe(true);
  });

  it("keeps lanes per workflow", async () => {
    const gate = new WorkflowRunGate();
    const policy = policyOf({ concurrency: "SINGLETON" });
    await gate.admit("one", policy);

    expect((await gate.admit("two", policy)).admitted).toBe(true);
  });

  // An unbounded QUEUE lane grows for as long as the reactor is up: a busy
  // document-event trigger enqueues faster than the workflow runs, and every
  // waiter holds a payload and a promise until the process dies.
  it("refuses a firing past the queue depth, rather than growing the lane", async () => {
    const gate = new WorkflowRunGate({ maxQueued: 2 });
    const policy = policyOf({ concurrency: "QUEUE" });
    const held = await gate.admit("w", policy);
    const waiting = [gate.admit("w", policy), gate.admit("w", policy)];
    await settled();
    expect(gate.waiting("w")).toBe(2);

    const overflow = await gate.admit("w", policy);

    expect(overflow.admitted).toBe(false);
    if (!overflow.admitted) {
      expect(overflow.reason).toContain("queue depth");
      // Named, so an operator can raise it.
      expect(overflow.reason).toContain("PH_WORKFLOWS_MAX_QUEUED_FIRINGS");
    }
    // The refusal did not disturb the queue it declined to join.
    expect(gate.waiting("w")).toBe(2);

    // And the lane still drains in order once the slot frees up.
    if (held.admitted) held.release();
    const first = await waiting[0];
    if (first.admitted) first.release();
    await waiting[1];
    expect(gate.waiting("w")).toBe(0);
  });

  it("bounds the PARALLEL queue too, past its maxParallelRuns", async () => {
    const gate = new WorkflowRunGate({ maxQueued: 1 });
    const policy = policyOf({ concurrency: "PARALLEL", maxParallelRuns: 1 });
    await gate.admit("w", policy);
    void gate.admit("w", policy);
    await settled();

    expect((await gate.admit("w", policy)).admitted).toBe(false);
  });

  it("reads the depth off the environment, falling back on the default", () => {
    expect(maxQueuedFirings({})).toBe(DEFAULT_MAX_QUEUED_FIRINGS);
    expect(maxQueuedFirings({ [QUEUE_DEPTH_ENV]: "7" })).toBe(7);
    for (const raw of ["", "nope", "0", "-5"]) {
      expect(maxQueuedFirings({ [QUEUE_DEPTH_ENV]: raw })).toBe(
        DEFAULT_MAX_QUEUED_FIRINGS,
      );
    }
  });

  it("releases only once, however often a caller asks", async () => {
    const gate = new WorkflowRunGate();
    const policy = policyOf({ concurrency: "QUEUE" });
    const held = await gate.admit("w", policy);
    if (held.admitted) {
      held.release();
      held.release();
    }

    expect(gate.active("w")).toBe(0);
  });
});
