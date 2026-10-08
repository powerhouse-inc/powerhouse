import { describe, expect, it } from "vitest";
import type { EventLoopReading } from "./event-loop.js";
import { RunDispatcher } from "./run-dispatcher.js";
import { WorkflowRuntimeClosedError } from "./shutdown.js";

// A loop the test sets, sampled when the test says.
function fakeLoop(start = 0) {
  let utilization = start;
  const listeners = new Set<() => void>();
  const loop: EventLoopReading = {
    utilization: () => utilization,
    onSample(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return {
    loop,
    sample: (value: number) => {
      utilization = value;
      for (const listener of listeners) listener();
    },
  };
}

function settled() {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("RunDispatcher", () => {
  it("admits up to its cap, then the earliest waiter as a run ends", async () => {
    const { loop } = fakeLoop();
    const dispatcher = new RunDispatcher({ maxInFlight: 2, loop });
    const order: string[] = [];

    const first = await dispatcher.admit("a");
    await dispatcher.admit("b");
    void dispatcher.admit("c").then(() => order.push("c"));
    void dispatcher.admit("d").then(() => order.push("d"));
    await settled();
    expect(dispatcher.stats()).toEqual({ inFlight: 2, waiting: 2 });

    first();
    first();
    await settled();
    expect(order).toEqual(["c"]);
    expect(dispatcher.stats()).toEqual({ inFlight: 2, waiting: 1 });
  });

  it("holds new runs while the loop is busy, and admits them as it eases", async () => {
    const { loop, sample } = fakeLoop(0.95);
    const dispatcher = new RunDispatcher({ maxInFlight: 8, maxElu: 0.8, loop });

    // None in flight: one gets in however busy the loop is.
    await dispatcher.admit("a");
    let admitted = false;
    void dispatcher.admit("b").then(() => {
      admitted = true;
    });
    await settled();
    expect(admitted).toBe(false);

    sample(0.5);
    await settled();
    expect(admitted).toBe(true);
  });

  it("says a run would wait exactly when admit would hold it back", async () => {
    const { loop } = fakeLoop();
    const dispatcher = new RunDispatcher({ maxInFlight: 1, loop });

    expect(dispatcher.wouldWait()).toBe(false);
    await dispatcher.admit("a");
    expect(dispatcher.wouldWait()).toBe(true);
  });

  it("refuses waiting and later runs once closed", async () => {
    const { loop } = fakeLoop();
    const dispatcher = new RunDispatcher({ maxInFlight: 1, loop });
    await dispatcher.admit("a");
    const waiting = dispatcher.admit("b");

    dispatcher.close();

    await expect(waiting).rejects.toBeInstanceOf(WorkflowRuntimeClosedError);
    await expect(dispatcher.admit("c")).rejects.toBeInstanceOf(
      WorkflowRuntimeClosedError,
    );
  });
});
