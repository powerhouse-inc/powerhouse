import type { Action } from "@powerhousedao/shared/document-model";
import { describe, expect, it } from "vitest";
import { ActionTracker } from "../../src/remote-controller/action-tracker.js";

function makeAction(type: string, scope = "global"): Action {
  return {
    id: `action-${type}`,
    type,
    timestampUtcMs: Date.now().toString(),
    input: { name: type },
    scope,
  };
}

describe("ActionTracker", () => {
  it("starts with zero count", () => {
    const tracker = new ActionTracker();
    expect(tracker.count).toBe(0);
  });

  it("tracks actions with operation context", () => {
    const tracker = new ActionTracker();
    const action = makeAction("SET_NAME");

    tracker.track(action, "hash-abc", 0);

    expect(tracker.count).toBe(1);
  });

  it("flushes all tracked actions and clears the queue", () => {
    const tracker = new ActionTracker();
    const a1 = makeAction("SET_NAME");
    const a2 = makeAction("SET_APP_NAME");

    tracker.track(a1, "", -1);
    tracker.track(a2, "hash-1", 0);

    const flushed = tracker.flush();

    expect(flushed).toHaveLength(2);
    expect(flushed[0]).toEqual({
      action: a1,
      prevOpHash: "",
      prevOpIndex: -1,
    });
    expect(flushed[1]).toEqual({
      action: a2,
      prevOpHash: "hash-1",
      prevOpIndex: 0,
    });

    // Queue is cleared after flush
    expect(tracker.count).toBe(0);
    expect(tracker.flush()).toHaveLength(0);
  });

  it("clear() empties the queue without returning", () => {
    const tracker = new ActionTracker();
    tracker.track(makeAction("A"), "h", 0);
    tracker.track(makeAction("B"), "h2", 1);

    tracker.clear();

    expect(tracker.count).toBe(0);
    expect(tracker.flush()).toHaveLength(0);
  });

  it("restore() prepends actions back to the queue", () => {
    const tracker = new ActionTracker();
    tracker.track(makeAction("C"), "hash-c", 2);

    const restored = [
      { action: makeAction("A"), prevOpHash: "hash-a", prevOpIndex: 0 },
      { action: makeAction("B"), prevOpHash: "hash-b", prevOpIndex: 1 },
    ];
    tracker.restore(restored);

    expect(tracker.count).toBe(3);

    const flushed = tracker.flush();
    expect(flushed[0].action.type).toBe("A");
    expect(flushed[1].action.type).toBe("B");
    expect(flushed[2].action.type).toBe("C");
  });

  it("restore() works on empty tracker", () => {
    const tracker = new ActionTracker();
    const restored = [
      { action: makeAction("A"), prevOpHash: "", prevOpIndex: 0 },
    ];
    tracker.restore(restored);

    expect(tracker.count).toBe(1);
    expect(tracker.flush()[0].action.type).toBe("A");
  });

  it("tracks multiple actions independently", () => {
    const tracker = new ActionTracker();

    tracker.track(makeAction("A", "global"), "hash-0", 0);
    tracker.track(makeAction("B", "local"), "hash-1", 1);
    tracker.track(makeAction("C", "global"), "hash-2", 2);

    const flushed = tracker.flush();

    expect(flushed).toHaveLength(3);
    expect(flushed[0].prevOpHash).toBe("hash-0");
    expect(flushed[1].prevOpHash).toBe("hash-1");
    expect(flushed[2].prevOpHash).toBe("hash-2");
  });
});
