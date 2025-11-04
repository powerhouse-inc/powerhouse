import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConsistencyTracker,
  makeConsistencyKey,
} from "../../src/shared/consistency-tracker.js";
import type {
  ConsistencyCoordinate,
  ConsistencyKey,
} from "../../src/shared/types.js";

describe("ConsistencyTracker", () => {
  let tracker: ConsistencyTracker;

  beforeEach(() => {
    vi.useFakeTimers();
    tracker = new ConsistencyTracker();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe("makeConsistencyKey", () => {
    it("should create a key in the correct format", () => {
      const key = makeConsistencyKey("doc1", "scope1", "main");
      expect(key).toBe("doc1:scope1:main");
    });

    it("should handle special characters in components", () => {
      const key = makeConsistencyKey(
        "doc-id-123",
        "scope/path",
        "feature/branch",
      );
      expect(key).toBe("doc-id-123:scope/path:feature/branch");
    });
  });

  describe("update", () => {
    it("should update coordinates", () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      tracker.update(coordinates);

      const key = makeConsistencyKey("doc1", "scope1", "main");
      expect(tracker.getLatest(key)).toBe(5);
    });

    it("should keep highest index when updating same coordinate multiple times", () => {
      const key = makeConsistencyKey("doc1", "scope1", "main");

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);
      expect(tracker.getLatest(key)).toBe(5);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ]);
      expect(tracker.getLatest(key)).toBe(5);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 10,
        },
      ]);
      expect(tracker.getLatest(key)).toBe(10);
    });

    it("should deduplicate coordinates in a single update", () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 2,
        },
      ];

      tracker.update(coordinates);

      const key = makeConsistencyKey("doc1", "scope1", "main");
      expect(tracker.getLatest(key)).toBe(5);
    });

    it("should handle multiple different coordinates", () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
        {
          documentId: "doc1",
          scope: "scope2",
          branch: "main",
          operationIndex: 7,
        },
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "feature",
          operationIndex: 2,
        },
      ];

      tracker.update(coordinates);

      expect(
        tracker.getLatest(makeConsistencyKey("doc1", "scope1", "main")),
      ).toBe(5);
      expect(
        tracker.getLatest(makeConsistencyKey("doc2", "scope1", "main")),
      ).toBe(3);
      expect(
        tracker.getLatest(makeConsistencyKey("doc1", "scope2", "main")),
      ).toBe(7);
      expect(
        tracker.getLatest(makeConsistencyKey("doc1", "scope1", "feature")),
      ).toBe(2);
    });

    it("should handle empty coordinates array", () => {
      tracker.update([]);

      const key = makeConsistencyKey("doc1", "scope1", "main");
      expect(tracker.getLatest(key)).toBeUndefined();
    });
  });

  describe("getLatest", () => {
    it("should return undefined for unknown keys", () => {
      const key: ConsistencyKey = "unknown:key:value";
      expect(tracker.getLatest(key)).toBeUndefined();
    });

    it("should return the correct index for tracked keys", () => {
      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 42,
        },
      ]);

      const key = makeConsistencyKey("doc1", "scope1", "main");
      expect(tracker.getLatest(key)).toBe(42);
    });
  });

  describe("waitFor", () => {
    it("should resolve immediately if coordinates already satisfied", async () => {
      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 10,
        },
      ]);

      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      await expect(tracker.waitFor(coordinates)).resolves.toBeUndefined();
    });

    it("should resolve when coordinates become satisfied", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const promise = tracker.waitFor(coordinates);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await expect(promise).resolves.toBeUndefined();
    });

    it("should wait until all coordinates are satisfied", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ];

      const promise = tracker.waitFor(coordinates);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await vi.advanceTimersByTimeAsync(10);

      tracker.update([
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ]);

      await expect(promise).resolves.toBeUndefined();
    });

    it("should resolve when coordinate reaches exactly the required index", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const promise = tracker.waitFor(coordinates);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await expect(promise).resolves.toBeUndefined();
    });

    it("should resolve when coordinate exceeds the required index", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const promise = tracker.waitFor(coordinates);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 10,
        },
      ]);

      await expect(promise).resolves.toBeUndefined();
    });

    it("should handle empty coordinates array", async () => {
      await expect(tracker.waitFor([])).resolves.toBeUndefined();
    });

    it("should reject when timeout is reached", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const promise = tracker.waitFor(coordinates, 100);
      const expectation = expect(promise).rejects.toThrow(
        "Consistency wait timed out after 100ms",
      );

      await vi.advanceTimersByTimeAsync(100);
      await expectation;
    });

    it("should reject when signal is aborted", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const abortController = new AbortController();
      const promise = tracker.waitFor(
        coordinates,
        undefined,
        abortController.signal,
      );

      await vi.advanceTimersByTimeAsync(10);
      abortController.abort();

      await expect(promise).rejects.toThrow("Operation aborted");
    });

    it("should reject immediately if signal is already aborted", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const abortController = new AbortController();
      abortController.abort();

      await expect(
        tracker.waitFor(coordinates, undefined, abortController.signal),
      ).rejects.toThrow("Operation aborted");
    });

    it("should handle multiple concurrent waiters for same coordinate", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const promise1 = tracker.waitFor(coordinates);
      const promise2 = tracker.waitFor(coordinates);
      const promise3 = tracker.waitFor(coordinates);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await expect(
        Promise.all([promise1, promise2, promise3]),
      ).resolves.toEqual([undefined, undefined, undefined]);
    });

    it("should handle multiple concurrent waiters for different coordinates", async () => {
      const coords1: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const coords2: ConsistencyCoordinate[] = [
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ];

      const promise1 = tracker.waitFor(coords1);
      const promise2 = tracker.waitFor(coords2);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await expect(promise1).resolves.toBeUndefined();

      tracker.update([
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ]);

      await expect(promise2).resolves.toBeUndefined();
    });

    it("should not reject satisfied waiters when timeout occurs for other waiters", async () => {
      const coords1: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const coords2: ConsistencyCoordinate[] = [
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ];

      const promise1 = tracker.waitFor(coords1, 100);
      const promise2 = tracker.waitFor(coords2, 200);
      const expectation2 = expect(promise2).rejects.toThrow(
        "Consistency wait timed out",
      );

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await expect(promise1).resolves.toBeUndefined();

      await vi.advanceTimersByTimeAsync(200);
      await expectation2;
    });

    it("should clear timeout when waiter is satisfied", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const promise = tracker.waitFor(coordinates, 1000);

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      await expect(promise).resolves.toBeUndefined();

      await vi.advanceTimersByTimeAsync(1000);
    });
  });

  describe("serialize and hydrate", () => {
    it("should serialize empty state", () => {
      const serialized = tracker.serialize();
      expect(serialized).toEqual([]);
    });

    it("should serialize tracked coordinates", () => {
      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ]);

      const serialized = tracker.serialize();

      expect(serialized).toHaveLength(2);
      expect(serialized).toContainEqual(["doc1:scope1:main", 5]);
      expect(serialized).toContainEqual(["doc2:scope1:main", 3]);
    });

    it("should hydrate state from serialized data", () => {
      const data: Array<[ConsistencyKey, number]> = [
        ["doc1:scope1:main", 5],
        ["doc2:scope1:main", 3],
      ];

      tracker.hydrate(data);

      expect(tracker.getLatest("doc1:scope1:main")).toBe(5);
      expect(tracker.getLatest("doc2:scope1:main")).toBe(3);
    });

    it("should clear existing state when hydrating", () => {
      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 10,
        },
      ]);

      const data: Array<[ConsistencyKey, number]> = [["doc2:scope1:main", 5]];

      tracker.hydrate(data);

      expect(tracker.getLatest("doc1:scope1:main")).toBeUndefined();
      expect(tracker.getLatest("doc2:scope1:main")).toBe(5);
    });

    it("should support round-trip serialization", () => {
      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
        {
          documentId: "doc2",
          scope: "scope2",
          branch: "feature",
          operationIndex: 3,
        },
      ]);

      const serialized = tracker.serialize();
      const newTracker = new ConsistencyTracker();
      newTracker.hydrate(serialized);

      expect(newTracker.getLatest("doc1:scope1:main")).toBe(5);
      expect(newTracker.getLatest("doc2:scope2:feature")).toBe(3);
    });

    it("should handle empty hydration data", () => {
      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ]);

      tracker.hydrate([]);

      expect(tracker.getLatest("doc1:scope1:main")).toBeUndefined();
      expect(tracker.serialize()).toEqual([]);
    });
  });

  describe("edge cases", () => {
    it("should handle operation index of 0", async () => {
      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 0,
        },
      ]);

      const key = makeConsistencyKey("doc1", "scope1", "main");
      expect(tracker.getLatest(key)).toBe(0);

      const promise = tracker.waitFor([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 0,
        },
      ]);

      await expect(promise).resolves.toBeUndefined();
    });

    it("should handle large operation indexes", () => {
      const largeIndex = 999999999;

      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: largeIndex,
        },
      ]);

      const key = makeConsistencyKey("doc1", "scope1", "main");
      expect(tracker.getLatest(key)).toBe(largeIndex);
    });

    it("should handle waitFor with both timeout and abort signal", async () => {
      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
      ];

      const abortController = new AbortController();
      const promise = tracker.waitFor(
        coordinates,
        1000,
        abortController.signal,
      );

      await vi.advanceTimersByTimeAsync(50);
      abortController.abort();

      await expect(promise).rejects.toThrow("Operation aborted");
    });

    it("should handle waitFor where some coordinates are already satisfied", async () => {
      tracker.update([
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 10,
        },
      ]);

      const coordinates: ConsistencyCoordinate[] = [
        {
          documentId: "doc1",
          scope: "scope1",
          branch: "main",
          operationIndex: 5,
        },
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ];

      const promise = tracker.waitFor(coordinates);

      tracker.update([
        {
          documentId: "doc2",
          scope: "scope1",
          branch: "main",
          operationIndex: 3,
        },
      ]);

      await expect(promise).resolves.toBeUndefined();
    });
  });
});
