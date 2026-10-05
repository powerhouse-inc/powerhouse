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
import { StorageHealthTracker } from "../../src/inspector/storage-health.js";
import type { IInspectableQueue } from "../../src/inspector/types.js";
import type { Job } from "../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type {
  DocumentModelModule,
  PHDocument,
} from "@powerhousedao/shared/document-model";
import type { IReactor } from "../../src/core/types.js";
import type { SearchFilter } from "../../src/shared/types.js";

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

function documentModelModule(
  id: string,
  name: string,
  version: number,
): DocumentModelModule {
  return {
    version,
    documentModel: { global: { id, name } },
  } as unknown as DocumentModelModule;
}

function documentModelRegistry(
  modules: DocumentModelModule[],
  supported: Record<string, number[]> = {},
): IDocumentModelRegistry {
  return {
    getAllModules: () => modules,
    getSupportedVersions: (documentType: string) =>
      supported[documentType] ?? [1],
  } as unknown as IDocumentModelRegistry;
}

type DriveNodeInput = {
  id: string;
  kind: string;
  documentType?: string;
};

function driveDoc(
  id: string,
  branch: string,
  name: string,
  nodes: DriveNodeInput[],
  icon?: string,
): PHDocument {
  return {
    header: {
      id,
      branch,
      name,
      documentType: "powerhouse/document-drive",
    },
    state: { global: { name, icon, nodes } },
  } as unknown as PHDocument;
}

function fakeReactor(opts: {
  drives?: PHDocument[];
  driveById?: Record<string, PHDocument>;
  presentIds?: Set<string>;
}): IReactor {
  return {
    find: (search: SearchFilter) => {
      if (search.type !== undefined) {
        return Promise.resolve({
          results: opts.drives ?? [],
          options: { cursor: "", limit: 0 },
        });
      }
      const ids = search.ids ?? [];
      const present = ids.filter((id) => opts.presentIds?.has(id));
      return Promise.resolve({
        results: present.map((id) => ({ header: { id } })),
        options: { cursor: "", limit: 0 },
      });
    },
    get: (id: string) => {
      const doc = opts.driveById?.[id];
      if (!doc) {
        return Promise.reject(new Error(`no document ${id}`));
      }
      return Promise.resolve(doc);
    },
  } as unknown as IReactor;
}

describe("ReactorInspector", () => {
  describe("drives", () => {
    it("reports an empty page with no reactor", async () => {
      const inspector = new ReactorInspector({});
      await expect(inspector.listDrives()).resolves.toEqual({
        results: [],
        nextCursor: undefined,
      });
    });

    it("summarizes each drive's identity and node tree", async () => {
      const drive = driveDoc(
        "drive-1",
        "main",
        "Accounts",
        [
          { id: "a", kind: "file", documentType: "sky/ledger" },
          { id: "b", kind: "file", documentType: "sky/ledger" },
          { id: "f", kind: "folder" },
        ],
        "icon-url",
      );
      const inspector = new ReactorInspector({
        reactor: fakeReactor({ drives: [drive] }),
      });

      await expect(inspector.listDrives()).resolves.toEqual({
        results: [
          {
            driveId: "drive-1",
            name: "Accounts",
            branch: "main",
            collectionId: "drive.main.drive-1",
            documentType: "powerhouse/document-drive",
            nodeCount: 3,
            fileCount: 2,
            folderCount: 1,
            icon: "icon-url",
          },
        ],
        nextCursor: undefined,
      });
    });
  });

  describe("drive integrity", () => {
    const supported = documentModelRegistry(
      [documentModelModule("sky/ledger", "Ledger", 1)],
      { "sky/ledger": [1] },
    );

    it("flags missing documents and unsupported types, leaving a clean drive empty", async () => {
      const drive = driveDoc("drive-1", "main", "D", [
        { id: "present", kind: "file", documentType: "sky/ledger" },
        { id: "absent", kind: "file", documentType: "sky/ledger" },
        { id: "weird", kind: "file", documentType: "evil/unknown" },
        { id: "folder", kind: "folder" },
      ]);
      const inspector = new ReactorInspector({
        reactor: fakeReactor({
          driveById: { "drive-1": drive },
          presentIds: new Set(["present", "weird"]),
        }),
        documentModelRegistry: supported,
      });

      await expect(inspector.checkDriveIntegrity("drive-1")).resolves.toEqual({
        driveId: "drive-1",
        checkedNodeCount: 3,
        totalFileNodeCount: 3,
        missingDocuments: [{ id: "absent", documentType: "sky/ledger" }],
        unsupportedTypes: [{ id: "weird", documentType: "evil/unknown" }],
        nextCursor: undefined,
      });
    });

    it("reports a clean drive with no missing or unsupported nodes", async () => {
      const drive = driveDoc("drive-1", "main", "D", [
        { id: "one", kind: "file", documentType: "sky/ledger" },
        { id: "two", kind: "file", documentType: "sky/ledger" },
      ]);
      const inspector = new ReactorInspector({
        reactor: fakeReactor({
          driveById: { "drive-1": drive },
          presentIds: new Set(["one", "two"]),
        }),
        documentModelRegistry: supported,
      });

      const result = await inspector.checkDriveIntegrity("drive-1");
      expect(result.missingDocuments).toEqual([]);
      expect(result.unsupportedTypes).toEqual([]);
      expect(result.checkedNodeCount).toBe(2);
    });

    it("pages the node walk for a large drive", async () => {
      const nodes: DriveNodeInput[] = Array.from({ length: 5 }, (_, i) => ({
        id: `n${i}`,
        kind: "file",
        documentType: "sky/ledger",
      }));
      const inspector = new ReactorInspector({
        reactor: fakeReactor({
          driveById: { "drive-1": driveDoc("drive-1", "main", "D", nodes) },
          presentIds: new Set(nodes.map((node) => node.id)),
        }),
        documentModelRegistry: supported,
      });

      const first = await inspector.checkDriveIntegrity(
        "drive-1",
        undefined,
        2,
      );
      expect(first.checkedNodeCount).toBe(2);
      expect(first.totalFileNodeCount).toBe(5);
      expect(first.nextCursor).toBe("2");

      const second = await inspector.checkDriveIntegrity(
        "drive-1",
        first.nextCursor,
        2,
      );
      expect(second.checkedNodeCount).toBe(2);
      expect(second.nextCursor).toBe("4");

      const third = await inspector.checkDriveIntegrity(
        "drive-1",
        second.nextCursor,
        2,
      );
      expect(third.checkedNodeCount).toBe(1);
      expect(third.nextCursor).toBeUndefined();
    });

    it("skips the unsupported check when no registry is wired", async () => {
      const drive = driveDoc("drive-1", "main", "D", [
        { id: "x", kind: "file", documentType: "anything" },
      ]);
      const inspector = new ReactorInspector({
        reactor: fakeReactor({
          driveById: { "drive-1": drive },
          presentIds: new Set(["x"]),
        }),
      });

      const result = await inspector.checkDriveIntegrity("drive-1");
      expect(result.unsupportedTypes).toEqual([]);
      expect(result.missingDocuments).toEqual([]);
    });
  });

  describe("document models", () => {
    it("returns an empty list with no registry", async () => {
      const inspector = new ReactorInspector({});
      await expect(inspector.listDocumentModels()).resolves.toEqual([]);
    });

    it("flattens each registered model with its supported versions", async () => {
      const inspector = new ReactorInspector({
        documentModelRegistry: documentModelRegistry(
          [
            documentModelModule(
              "powerhouse/document-drive",
              "DocumentDrive",
              1,
            ),
            documentModelModule("sky/ledger", "Ledger", 2),
          ],
          {
            "powerhouse/document-drive": [1],
            "sky/ledger": [1, 2],
          },
        ),
      });

      await expect(inspector.listDocumentModels()).resolves.toEqual([
        {
          documentType: "powerhouse/document-drive",
          name: "DocumentDrive",
          version: 1,
          supportedVersions: [1],
        },
        {
          documentType: "sky/ledger",
          name: "Ledger",
          version: 2,
          supportedVersions: [1, 2],
        },
      ]);
    });

    it("defaults a module with no version field to version 1", async () => {
      const inspector = new ReactorInspector({
        documentModelRegistry: documentModelRegistry([
          {
            documentModel: { global: { id: "x/y", name: "Y" } },
          } as unknown as DocumentModelModule,
        ]),
      });

      await expect(inspector.listDocumentModels()).resolves.toEqual([
        {
          documentType: "x/y",
          name: "Y",
          version: 1,
          supportedVersions: [1],
        },
      ]);
    });
  });

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

    // A read of a queue that is not inspectable is empty; an ACTION on it
    // refuses. Resolving would report a pause that never happened -- and one
    // layer up, over the inspection subgraph, would answer the operator
    // `inspectionPauseQueue: true`.
    it("refuses pause and resume with no inspectable queue, naming the reason", async () => {
      const inspector = new ReactorInspector({});

      await expect(inspector.pauseQueue()).rejects.toThrow(
        /Pausing the queue is unsupported on this host's queue/,
      );
      await expect(inspector.resumeQueue()).rejects.toThrow(
        /Resuming the queue is unsupported on this host's queue/,
      );
      await expect(inspector.getQueueState()).resolves.toMatchObject({
        totalPending: 0,
      });
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

    it("refuses a retry it cannot deliver rather than reporting one it did not", async () => {
      await expect(
        new ReactorInspector({
          processorManager: processorManager([]),
        }).retryProcessor("nope"),
      ).rejects.toThrow(/this reactor is not tracking it/);

      await expect(
        new ReactorInspector({}).retryProcessor("p1"),
      ).rejects.toThrow(/built with no processor manager/);
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

describe("ReactorInspector - storage health", () => {
  it("reports a healthy, never-recreated default with no provider", async () => {
    const inspector = new ReactorInspector({});
    await expect(inspector.getStorageHealth()).resolves.toEqual({
      healthy: true,
      everRecreated: false,
      recreateCount: 0,
    });
  });

  it("tracks poison and recovery through a StorageHealthTracker", async () => {
    let count = 0;
    const tracker = new StorageHealthTracker(() => count);
    const inspector = new ReactorInspector({ storageHealth: tracker });

    tracker.markPoisoned();
    await expect(inspector.getStorageHealth()).resolves.toMatchObject({
      healthy: false,
      everRecreated: false,
    });

    count = 1;
    tracker.recordRecreated({
      reason: "portal",
      timestampUtcMs: 123,
      attempt: 1,
    });
    await expect(inspector.getStorageHealth()).resolves.toEqual({
      healthy: true,
      everRecreated: true,
      recreateCount: 1,
      lastRecreated: { reason: "portal", timestampUtcMs: 123, attempt: 1 },
    });
  });
});
