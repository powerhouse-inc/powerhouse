import type {
  IProcessorManager,
  TrackedProcessor,
} from "@powerhousedao/shared/processors";
import { describe, expect, it, vi } from "vitest";
import type {
  IDocumentIntegrityService,
  RebuildResult,
  ValidationResult,
} from "../../src/admin/types.js";
import type {
  CatchUpStatus,
  ICatchUp,
  SweepResult,
} from "../../src/catch-up/types.js";
import { ReactorInspector } from "../../src/inspector/reactor-inspector.js";
import type { IInspectableQueue } from "../../src/inspector/types.js";
import type { Job } from "../../src/queue/types.js";

function job(id: string, documentId: string): Job {
  return {
    id,
    documentId,
    scope: "global",
    branch: "main",
    operations: [],
  } as unknown as Job;
}

class FakeQueue implements IInspectableQueue {
  paused = false;
  resumeCalls = 0;

  constructor(
    private readonly pending: Job[] = [],
    private readonly executing: Map<string, Set<string>> = new Map(),
    private readonly index: Map<string, Job> = new Map(),
  ) {}

  pause(): void {
    this.paused = true;
  }

  resume(): Promise<void> {
    this.resumeCalls += 1;
    this.paused = false;
    return Promise.resolve();
  }

  getPendingJobs(): Job[] {
    return this.pending;
  }

  getExecutingJobIds(): Map<string, Set<string>> {
    return this.executing;
  }

  getJob(jobId: string): Job | undefined {
    return this.index.get(jobId);
  }
}

function trackedProcessor(overrides: Partial<TrackedProcessor>) {
  return {
    processorId: "p1",
    factoryId: "f1",
    driveId: "d1",
    processorIndex: 0,
    record: { id: "p1" },
    lastOrdinal: 7,
    status: "active",
    lastError: undefined,
    lastErrorTimestamp: undefined,
    retry: () => Promise.resolve(),
    ...overrides,
  } as TrackedProcessor;
}

function processorManager(tracked: TrackedProcessor[]): IProcessorManager {
  const byId = new Map(tracked.map((t) => [t.processorId, t]));
  return {
    registerFactory: () => Promise.resolve(),
    unregisterFactory: () => Promise.resolve(),
    get: (id: string) => byId.get(id),
    getAll: () => tracked,
  };
}

const emptySnapshot = {
  isPaused: false,
  pendingJobs: [],
  executingJobs: [],
  totalPending: 0,
  totalExecuting: 0,
};

describe("ReactorInspector", () => {
  describe("queue", () => {
    it("reports an empty snapshot with no queue", async () => {
      const inspector = new ReactorInspector({});
      await expect(inspector.getQueueState()).resolves.toEqual(emptySnapshot);
    });

    it("collects pending and executing jobs with totals", async () => {
      const pendingA = job("a", "doc-1");
      const pendingB = job("b", "doc-2");
      const executing = job("x", "doc-3");
      const queue = new FakeQueue(
        [pendingA, pendingB],
        new Map([["doc-3", new Set(["x", "missing"])]]),
        new Map([["x", executing]]),
      );
      queue.paused = true;

      const inspector = new ReactorInspector({ queue });

      await expect(inspector.getQueueState()).resolves.toEqual({
        isPaused: true,
        pendingJobs: [pendingA, pendingB],
        executingJobs: [executing],
        totalPending: 2,
        totalExecuting: 1,
      });
    });

    it("pauses and resumes the queue", async () => {
      const queue = new FakeQueue();
      const inspector = new ReactorInspector({ queue });

      await inspector.pauseQueue();
      expect(queue.paused).toBe(true);

      await inspector.resumeQueue();
      expect(queue.paused).toBe(false);
      expect(queue.resumeCalls).toBe(1);
    });

    it("tolerates pause and resume with no queue", async () => {
      const inspector = new ReactorInspector({});
      await expect(inspector.pauseQueue()).resolves.toBeUndefined();
      await expect(inspector.resumeQueue()).resolves.toBeUndefined();
    });
  });

  describe("processors", () => {
    it("returns an empty list with no processor manager", async () => {
      const inspector = new ReactorInspector({});
      await expect(inspector.getProcessors()).resolves.toEqual([]);
    });

    it("flattens tracked processors, dropping record and retry", async () => {
      const timestamp = new Date("2026-01-01T00:00:00.000Z");
      const inspector = new ReactorInspector({
        processorManager: processorManager([
          trackedProcessor({
            processorId: "p2",
            status: "errored",
            lastError: "boom",
            lastErrorTimestamp: timestamp,
            processorIndex: 3,
          }),
        ]),
      });

      await expect(inspector.getProcessors()).resolves.toEqual([
        {
          processorId: "p2",
          factoryId: "f1",
          driveId: "d1",
          processorIndex: 3,
          lastOrdinal: 7,
          status: "errored",
          lastError: "boom",
          lastErrorTimestamp: timestamp,
        },
      ]);
    });

    it("retries the named processor", async () => {
      const retry = vi.fn(() => Promise.resolve());
      const inspector = new ReactorInspector({
        processorManager: processorManager([
          trackedProcessor({ processorId: "p1", retry }),
        ]),
      });

      await inspector.retryProcessor("p1");
      expect(retry).toHaveBeenCalledTimes(1);
    });

    it("ignores a retry for an unknown processor", async () => {
      const inspector = new ReactorInspector({
        processorManager: processorManager([]),
      });
      await expect(inspector.retryProcessor("nope")).resolves.toBeUndefined();
    });
  });

  describe("catch-up", () => {
    const status: CatchUpStatus = {
      watermark: { head: 9, settledThrough: 5, waitingOn: ["c1"] },
      consumers: [],
    };
    const sweeps: SweepResult[] = [
      {
        consumerId: "c1",
        from: 1,
        to: 5,
        durationMs: 2,
        replayed: 3,
        reapplied: 0,
      },
    ];
    const catchUp: ICatchUp = {
      status: () => status,
      sweepNow: () => Promise.resolve(sweeps),
    };

    it("passes through status and sweeps", async () => {
      const inspector = new ReactorInspector({ catchUp });
      await expect(inspector.getCatchUpStatus()).resolves.toBe(status);
      await expect(inspector.sweepCatchUp()).resolves.toBe(sweeps);
    });

    it("refuses when catch-up is absent", async () => {
      const inspector = new ReactorInspector({});
      await expect(inspector.getCatchUpStatus()).rejects.toThrow(
        "Catch-up not available",
      );
      await expect(inspector.sweepCatchUp()).rejects.toThrow(
        "Catch-up not available",
      );
    });
  });

  describe("integrity", () => {
    const validation: ValidationResult = {
      documentId: "doc-1",
      isConsistent: true,
      keyframeIssues: [],
      snapshotIssues: [],
      streamOrderIssues: [],
    };
    const rebuild: RebuildResult = {
      documentId: "doc-1",
      keyframesDeleted: 2,
      scopesInvalidated: 1,
    };

    function integrityService(): IDocumentIntegrityService {
      return {
        validateDocument: vi.fn(() => Promise.resolve(validation)),
        rebuildKeyframes: vi.fn(() => Promise.resolve(rebuild)),
        rebuildSnapshots: vi.fn(() => Promise.resolve(rebuild)),
      };
    }

    it("forwards documentId and branch to the service", async () => {
      const integrity = integrityService();
      const inspector = new ReactorInspector({ integrity });

      await expect(inspector.validateDocument("doc-1", "main")).resolves.toBe(
        validation,
      );
      await expect(inspector.rebuildKeyframes("doc-1")).resolves.toBe(rebuild);
      await expect(inspector.rebuildSnapshots("doc-1", "draft")).resolves.toBe(
        rebuild,
      );

      expect(integrity.validateDocument).toHaveBeenCalledWith("doc-1", "main");
      expect(integrity.rebuildKeyframes).toHaveBeenCalledWith(
        "doc-1",
        undefined,
      );
      expect(integrity.rebuildSnapshots).toHaveBeenCalledWith("doc-1", "draft");
    });

    it("refuses when the integrity service is absent", async () => {
      const inspector = new ReactorInspector({});
      await expect(inspector.validateDocument("doc-1")).rejects.toThrow(
        "Integrity service not available",
      );
      await expect(inspector.rebuildKeyframes("doc-1")).rejects.toThrow(
        "Integrity service not available",
      );
      await expect(inspector.rebuildSnapshots("doc-1")).rejects.toThrow(
        "Integrity service not available",
      );
    });
  });
});
