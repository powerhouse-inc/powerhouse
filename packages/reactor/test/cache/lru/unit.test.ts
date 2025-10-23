import { describe, it, expect } from "vitest";
import { LRUTracker } from "../../../src/cache/lru/lru-tracker.js";

describe("LRUTracker", () => {
  it("should initialize with size 0", () => {
    const tracker = new LRUTracker<string>();
    expect(tracker.size).toBe(0);
  });

  it("should track most recently used items", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");

    expect(tracker.size).toBe(3);
  });

  it("should evict least recently used item", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");

    const evicted = tracker.evict();

    expect(evicted).toBe("a");
    expect(tracker.size).toBe(2);
  });

  it("should handle touch updating order", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");

    tracker.touch("a");

    const evicted = tracker.evict();

    expect(evicted).toBe("b");
    expect(tracker.size).toBe(2);
  });

  it("should handle removal of tracked items", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");

    tracker.remove("b");

    expect(tracker.size).toBe(2);

    const evicted1 = tracker.evict();
    expect(evicted1).toBe("a");

    const evicted2 = tracker.evict();
    expect(evicted2).toBe("c");
  });

  it("should handle removal of non-existent items", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.remove("b");

    expect(tracker.size).toBe(1);
  });

  it("should clear all tracked items", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");

    expect(tracker.size).toBe(3);

    tracker.clear();

    expect(tracker.size).toBe(0);
    expect(tracker.evict()).toBeUndefined();
  });

  it("should maintain correct size", () => {
    const tracker = new LRUTracker<string>();

    expect(tracker.size).toBe(0);

    tracker.touch("a");
    expect(tracker.size).toBe(1);

    tracker.touch("b");
    expect(tracker.size).toBe(2);

    tracker.touch("a");
    expect(tracker.size).toBe(2);

    tracker.remove("a");
    expect(tracker.size).toBe(1);

    tracker.clear();
    expect(tracker.size).toBe(0);
  });

  it("should handle edge case of empty tracker", () => {
    const tracker = new LRUTracker<string>();

    expect(tracker.evict()).toBeUndefined();
    tracker.remove("a");
    expect(tracker.size).toBe(0);
  });

  it("should handle edge case of single item", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");

    expect(tracker.size).toBe(1);

    tracker.touch("a");
    expect(tracker.size).toBe(1);

    const evicted = tracker.evict();
    expect(evicted).toBe("a");
    expect(tracker.size).toBe(0);
  });

  it("should handle removing head item", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");

    tracker.remove("c");

    expect(tracker.size).toBe(2);

    const evicted1 = tracker.evict();
    expect(evicted1).toBe("a");

    const evicted2 = tracker.evict();
    expect(evicted2).toBe("b");
  });

  it("should handle removing tail item", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");

    tracker.remove("a");

    expect(tracker.size).toBe(2);

    const evicted1 = tracker.evict();
    expect(evicted1).toBe("b");

    const evicted2 = tracker.evict();
    expect(evicted2).toBe("c");
  });

  it("should handle removing middle item", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");

    tracker.remove("b");

    expect(tracker.size).toBe(2);

    const evicted1 = tracker.evict();
    expect(evicted1).toBe("a");

    const evicted2 = tracker.evict();
    expect(evicted2).toBe("c");
  });

  it("should handle complex access pattern", () => {
    const tracker = new LRUTracker<string>();

    tracker.touch("a");
    tracker.touch("b");
    tracker.touch("c");
    tracker.touch("d");

    tracker.touch("b");
    tracker.touch("a");

    const evicted1 = tracker.evict();
    expect(evicted1).toBe("c");

    tracker.touch("e");

    const evicted2 = tracker.evict();
    expect(evicted2).toBe("d");

    const evicted3 = tracker.evict();
    expect(evicted3).toBe("b");

    const evicted4 = tracker.evict();
    expect(evicted4).toBe("a");

    const evicted5 = tracker.evict();
    expect(evicted5).toBe("e");

    expect(tracker.size).toBe(0);
  });

  it("should work with numeric keys", () => {
    const tracker = new LRUTracker<number>();

    tracker.touch(1);
    tracker.touch(2);
    tracker.touch(3);

    tracker.touch(1);

    const evicted = tracker.evict();
    expect(evicted).toBe(2);
  });

  it("should work with object keys", () => {
    const tracker = new LRUTracker<object>();

    const obj1 = { id: 1 };
    const obj2 = { id: 2 };
    const obj3 = { id: 3 };

    tracker.touch(obj1);
    tracker.touch(obj2);
    tracker.touch(obj3);

    tracker.touch(obj1);

    const evicted = tracker.evict();
    expect(evicted).toBe(obj2);
  });
});
