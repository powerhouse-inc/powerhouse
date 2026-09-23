import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IProcessor,
  ProcessorFilter,
} from "@powerhousedao/shared/processors";
import { describe, expect, it, vi } from "vitest";
import {
  ProcessorQueue,
  type ProcessorCursorState,
} from "../../src/processors/processor-queue.js";
import type { PagedResults } from "../../src/shared/types.js";
import { createMockLogger, deferred } from "../factories.js";

function op(ordinal: number, documentId = "doc"): OperationWithContext {
  return {
    operation: {
      id: `op-${ordinal}`,
      index: ordinal,
      skip: 0,
      hash: `hash-${ordinal}`,
      timestampUtcMs: new Date(0).toISOString(),
      action: {
        id: `action-${ordinal}`,
        type: "SET_NAME",
        scope: "global",
        timestampUtcMs: new Date(0).toISOString(),
        input: {},
      },
    },
    context: {
      documentId,
      documentType: "test/doc",
      scope: "global",
      branch: "main",
      ordinal,
    },
  };
}

function ordinals(ops: OperationWithContext[]): number[] {
  return ops.map((o) => o.context.ordinal);
}

// Pages of `size` from an in-memory index, as getSinceOrdinal returns them.
function pagedIndex(
  index: OperationWithContext[],
  size = 100,
): (ordinal: number) => Promise<PagedResults<OperationWithContext>> {
  const pageFrom = (ordinal: number): PagedResults<OperationWithContext> => {
    const after = index.filter((o) => o.context.ordinal > ordinal);
    const results = after.slice(0, size);
    const last = results.at(-1);
    return {
      results,
      options: { cursor: "", limit: size },
      next:
        after.length > size && last
          ? () => Promise.resolve(pageFrom(last.context.ordinal))
          : undefined,
    };
  };
  return (ordinal) => Promise.resolve(pageFrom(ordinal));
}

type Harness = {
  queue: ProcessorQueue;
  cursor: ProcessorCursorState;
  delivered: number[][];
  persisted: ProcessorCursorState[];
  processor: IProcessor & { onOperations: ReturnType<typeof vi.fn> };
};

function harness(
  options: {
    lastOrdinal?: number;
    floor?: number;
    filter?: ProcessorFilter;
    index?: OperationWithContext[];
    readSince?: (
      ordinal: number,
    ) => Promise<PagedResults<OperationWithContext>>;
    onOperations?: (ops: OperationWithContext[]) => Promise<void>;
    onDisconnect?: () => Promise<void>;
    routedThrough?: () => number;
  } = {},
): Harness {
  const delivered: number[][] = [];
  const persisted: ProcessorCursorState[] = [];
  const cursor: ProcessorCursorState = {
    lastOrdinal: options.lastOrdinal ?? 0,
    status: "active",
    lastError: undefined,
    lastErrorTimestamp: undefined,
  };
  const processor = {
    onOperations: vi.fn(async (ops: OperationWithContext[]) => {
      if (options.onOperations) await options.onOperations(ops);
      delivered.push(ordinals(ops));
    }),
    onDisconnect: vi.fn(options.onDisconnect ?? (() => Promise.resolve())),
  };
  const queue = new ProcessorQueue({
    processorId: "p",
    processor,
    filter: options.filter ?? {},
    cursor,
    floor: options.floor ?? 0,
    readSince: options.readSince ?? pagedIndex(options.index ?? []),
    routedThrough: options.routedThrough ?? (() => Number.MAX_SAFE_INTEGER),
    persist: (state) => {
      persisted.push({ ...state });
      return Promise.resolve();
    },
    logger: createMockLogger(),
  });
  return { queue, cursor, delivered, persisted, processor };
}

describe("ProcessorQueue", () => {
  describe("ordering", () => {
    it("should deliver tasks in the order they were enqueued", async () => {
      const gate = deferred();
      let calls = 0;
      const { queue, delivered } = harness({
        onOperations: async () => {
          if (calls++ === 0) await gate.promise;
        },
      });

      const first = queue.live([op(4)]);
      await Promise.resolve();
      const rest = [queue.live([op(3)]), queue.live([op(1)])];
      gate.resolve();
      await Promise.all([first, ...rest]);

      expect(delivered).toEqual([[4], [3, 1]]);
    });

    it("should merge queued live batches into one call, in order", async () => {
      const { queue, delivered, processor } = harness();

      await Promise.all([
        queue.live([op(3)]),
        queue.live([op(1), op(2)]),
        queue.advance(9),
        queue.live([op(5)]),
      ]);

      expect(processor.onOperations).toHaveBeenCalledTimes(1);
      expect(delivered).toEqual([[3, 1, 2, 5]]);
    });

    it("should run one onOperations call at a time", async () => {
      let inFlight = 0;
      let maxInFlight = 0;
      const { queue } = harness({
        onOperations: async () => {
          inFlight++;
          maxInFlight = Math.max(maxInFlight, inFlight);
          await new Promise((r) => setTimeout(r, 1));
          inFlight--;
        },
      });

      await Promise.all([1, 2, 3, 4].map((n) => queue.live([op(n)])));

      expect(maxInFlight).toBe(1);
    });

    it("should not call the processor on the enqueuing caller's stack", () => {
      const { queue, processor } = harness();

      void queue.live([op(1)]);

      expect(processor.onOperations).not.toHaveBeenCalled();
    });

    it("should raise the cursor to the highest delivered ordinal and persist it", async () => {
      const { queue, cursor, persisted } = harness();

      await queue.live([op(2), op(5)]);
      await queue.live([op(3)]);

      expect(cursor.lastOrdinal).toBe(5);
      expect(persisted.map((p) => p.lastOrdinal)).toEqual([5]);
    });

    it("should coalesce advances that have not started", async () => {
      const gate = deferred();
      const { queue, cursor, persisted } = harness({
        onOperations: () => gate.promise,
      });

      const busy = queue.live([op(1)]);
      const advances = [queue.advance(4), queue.advance(9), queue.advance(6)];
      gate.resolve();
      await Promise.all([busy, ...advances]);

      expect(cursor.lastOrdinal).toBe(9);
      expect(persisted.map((p) => p.lastOrdinal)).toEqual([9]);
    });
  });

  describe("failure", () => {
    it("should mark errored and park the cursor below the failed batch", async () => {
      const { queue, cursor, persisted } = harness({
        lastOrdinal: 10,
        onOperations: (ops) =>
          ops.some((o) => o.context.ordinal === 4)
            ? Promise.reject(new Error("boom"))
            : Promise.resolve(),
      });

      await queue.live([op(4), op(6)]);

      expect(cursor.status).toBe("errored");
      expect(cursor.lastError).toBe("boom");
      expect(cursor.lastOrdinal).toBe(3);
      expect(persisted.at(-1)).toMatchObject({
        lastOrdinal: 3,
        status: "errored",
      });
    });

    it("should skip deliveries while errored and keep parking the cursor", async () => {
      let fail = true;
      const { queue, cursor, processor } = harness({
        lastOrdinal: 10,
        onOperations: () =>
          fail ? Promise.reject(new Error("boom")) : Promise.resolve(),
      });

      await queue.live([op(8)]);
      fail = false;
      await queue.live([op(12)]);
      await queue.live([op(5)]);

      expect(processor.onOperations).toHaveBeenCalledTimes(1);
      expect(cursor.lastOrdinal).toBe(4);
    });

    it("should not advance an errored cursor", async () => {
      const { queue, cursor } = harness({
        onOperations: () => Promise.reject(new Error("boom")),
      });

      await queue.live([op(3)]);
      await queue.advance(20);

      expect(cursor.lastOrdinal).toBe(0);
    });

    it("should keep running when persisting the cursor rejects", async () => {
      const delivered: number[] = [];
      const cursor: ProcessorCursorState = {
        lastOrdinal: 0,
        status: "active",
        lastError: undefined,
        lastErrorTimestamp: undefined,
      };
      const queue = new ProcessorQueue({
        processorId: "p",
        processor: {
          onOperations: (ops) => {
            delivered.push(...ordinals(ops));
            return Promise.resolve();
          },
          onDisconnect: () => Promise.resolve(),
        },
        filter: {},
        cursor,
        floor: 0,
        readSince: pagedIndex([]),
        routedThrough: () => Number.MAX_SAFE_INTEGER,
        persist: () => Promise.reject(new Error("db down")),
        logger: createMockLogger(),
      });

      await queue.live([op(1)]);
      await queue.live([op(2)]);

      expect(delivered).toEqual([1, 2]);
      expect(cursor.lastOrdinal).toBe(2);
    });
  });

  describe("retry", () => {
    it("should replay from the parked cursor", async () => {
      const index = [op(1), op(2), op(3), op(4)];
      let fail = true;
      const { queue, cursor, delivered } = harness({
        lastOrdinal: 4,
        index,
        onOperations: () =>
          fail ? Promise.reject(new Error("boom")) : Promise.resolve(),
      });

      await queue.live([op(2)]);
      expect(cursor.lastOrdinal).toBe(1);

      fail = false;
      await queue.retry();

      expect(cursor.status).toBe("active");
      expect(cursor.lastError).toBeUndefined();
      expect(delivered).toEqual([[2, 3, 4]]);
      expect(cursor.lastOrdinal).toBe(4);
    });

    it("should no-op on an active processor", async () => {
      const { queue, processor } = harness({ index: [op(1)] });

      await queue.retry();

      expect(processor.onOperations).not.toHaveBeenCalled();
    });

    it("should run after a failure queued ahead of it", async () => {
      let fail = true;
      const { queue, cursor, delivered } = harness({
        index: [op(1), op(2)],
        onOperations: () => {
          if (fail) {
            fail = false;
            return Promise.reject(new Error("boom"));
          }
          return Promise.resolve();
        },
      });

      const failing = queue.live([op(1)]);
      const retry = queue.retry();
      await Promise.all([failing, retry]);

      expect(cursor.status).toBe("active");
      expect(delivered).toEqual([[1, 2]]);
    });
  });

  describe("backfill", () => {
    it("should page from the cursor and advance per page", async () => {
      const index = [1, 2, 3, 4, 5].map((n) => op(n));
      const { queue, cursor, delivered, persisted } = harness({
        lastOrdinal: 1,
        readSince: pagedIndex(index, 2),
      });

      await queue.backfill();

      expect(delivered).toEqual([
        [2, 3],
        [4, 5],
      ]);
      expect(cursor.lastOrdinal).toBe(5);
      expect(persisted.map((p) => p.lastOrdinal)).toEqual([3, 5]);
    });

    it("should advance past a page with nothing matching the filter", async () => {
      const index = [op(1, "a"), op(2, "b"), op(3, "a")];
      const { queue, cursor, delivered } = harness({
        index,
        filter: { documentId: ["a"] },
      });

      await queue.backfill();

      expect(delivered).toEqual([[1, 3]]);
      expect(cursor.lastOrdinal).toBe(3);
    });

    it("should mark errored when a page read rejects and still run queued lives", async () => {
      const { queue, cursor, delivered, processor } = harness({
        lastOrdinal: 5,
        readSince: () => Promise.reject(new Error("read failed")),
      });

      const backfill = queue.backfill();
      const live = queue.live([op(8)]);
      await Promise.all([backfill, live]);

      expect(cursor.status).toBe("errored");
      expect(cursor.lastError).toBe("read failed");
      expect(processor.onOperations).not.toHaveBeenCalled();
      expect(delivered).toEqual([]);
      // The queued live parked below itself, so a retry replays it.
      expect(cursor.lastOrdinal).toBe(5);
    });

    it("should mark errored when a later page read rejects", async () => {
      const index = [1, 2, 3].map((n) => op(n));
      const first = await pagedIndex(index, 2)(0);
      const { queue, cursor, delivered } = harness({
        readSince: () =>
          Promise.resolve({
            ...first,
            next: () => Promise.reject(new Error("page 2 failed")),
          }),
      });

      await queue.backfill();

      expect(delivered).toEqual([[1, 2]]);
      expect(cursor.status).toBe("errored");
      expect(cursor.lastOrdinal).toBe(2);
    });

    it("should not deliver at or below the floor", async () => {
      const { queue, delivered } = harness({
        lastOrdinal: 0,
        floor: 3,
        index: [1, 2, 3, 4].map((n) => op(n)),
      });

      await queue.backfill();
      await queue.live([op(2)]);

      expect(delivered).toEqual([[4]]);
    });
  });

  describe("overlap", () => {
    it("should drop live ops a backfill already delivered", async () => {
      const gate = deferred();
      let calls = 0;
      const { queue, delivered } = harness({
        index: [op(1), op(2), op(3)],
        onOperations: async () => {
          if (calls++ === 0) await gate.promise;
        },
      });

      const backfill = queue.backfill();
      const live = queue.live([op(3), op(4)]);
      gate.resolve();
      await Promise.all([backfill, live, queue.advance(0)]);

      expect(delivered).toEqual([[1, 2, 3], [4]]);
    });

    it("should deliver a lower ordinal that arrives after a higher one", async () => {
      const gate = deferred();
      let calls = 0;
      const { queue, delivered } = harness({
        index: [op(1), op(3)],
        onOperations: async () => {
          if (calls++ === 0) await gate.promise;
        },
      });

      const backfill = queue.backfill();
      const lives = [queue.live([op(3)]), queue.live([op(2)])];
      gate.resolve();
      await Promise.all([backfill, ...lives, queue.advance(0)]);

      expect(delivered).toEqual([[1, 3], [2]]);
    });

    it("should deliver a live op the backfill never saw", async () => {
      // Postgres visibility gap: 150 commits after the page that held 200.
      const gate = deferred();
      let calls = 0;
      const { queue, delivered, cursor } = harness({
        index: [op(100), op(200)],
        onOperations: async () => {
          if (calls++ === 0) await gate.promise;
        },
      });

      const backfill = queue.backfill();
      const live = queue.live([op(150)]);
      gate.resolve();
      await Promise.all([backfill, live, queue.advance(0)]);

      expect(delivered).toEqual([[100, 200], [150]]);
      expect(cursor.lastOrdinal).toBe(200);
    });

    it("should not hold a live caller behind a backfill", async () => {
      const gate = deferred();
      let calls = 0;
      const { queue, delivered } = harness({
        index: [op(1)],
        onOperations: async () => {
          if (calls++ === 0) await gate.promise;
        },
      });

      const backfill = queue.backfill();
      await queue.live([op(2)]);
      expect(delivered).toEqual([]);

      gate.resolve();
      await Promise.all([backfill, queue.advance(0)]);
      expect(delivered).toEqual([[1], [2]]);
    });

    it("should drop a live op the backfill delivered before routing reached it", async () => {
      const { queue, delivered } = harness({
        index: [op(1), op(2)],
        routedThrough: () => 1,
      });

      await queue.backfill();
      await queue.live([op(2)]);
      await queue.live([op(2)]);

      expect(delivered).toEqual([[1, 2], [2]]);
    });

    it("should close the window once the queue drains", async () => {
      const { queue, delivered } = harness({ index: [op(1)] });

      await queue.backfill();
      await queue.live([op(1)]);

      expect(delivered).toEqual([[1], [1]]);
    });
  });

  describe("close", () => {
    it("should disconnect after queued deliveries and ignore later enqueues", async () => {
      const gate = deferred();
      const events: string[] = [];
      const { queue, processor } = harness({
        onOperations: async (ops) => {
          await gate.promise;
          events.push(`ops:${ordinals(ops).join(",")}`);
        },
        onDisconnect: () => {
          events.push("disconnect");
          return Promise.resolve();
        },
      });

      const first = queue.live([op(1)]);
      const second = queue.live([op(2)]);
      const closed = queue.close();
      const late = queue.live([op(3)]);
      gate.resolve();
      await Promise.all([first, second, closed, late]);

      expect(events).toEqual(["ops:1,2", "disconnect"]);
      expect(processor.onDisconnect).toHaveBeenCalledTimes(1);
      expect(queue.isClosed).toBe(true);
    });

    it("should stop persisting the cursor once closed", async () => {
      const gate = deferred();
      const { queue, persisted } = harness({
        onOperations: () => gate.promise,
      });

      const delivery = queue.live([op(1)]);
      const closed = queue.close();
      gate.resolve();
      await Promise.all([delivery, closed]);

      expect(persisted).toEqual([]);
    });

    it("should resolve retry on a closed queue without delivering", async () => {
      const { queue, processor } = harness({ index: [op(1)] });

      await queue.close();
      await queue.retry();

      expect(processor.onOperations).not.toHaveBeenCalled();
    });
  });
});
