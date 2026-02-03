import type {
  IDocumentOperationStorage,
  IDocumentStorage,
} from "document-drive";
import type { Operation } from "document-model";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import type { Reactor } from "../../src/core/reactor.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { IQueue } from "../../src/queue/interfaces.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import { JobStatus } from "../../src/shared/types.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockDocumentStorage,
  createMockLogger,
  createMockOperationStorage,
  createMockOperationStore,
  createTestAction,
  createTestLegacyReactorSetup,
  createTestOperation,
} from "../factories.js";

describe("SimpleJobExecutor load jobs", () => {
  let executor: SimpleJobExecutor;
  let mockDocStorage: IDocumentStorage;
  let mockOperationStorage: IDocumentOperationStorage;
  let mockOperationStore: IOperationStore;
  let mockWriteCache: IWriteCache;
  let registry: IDocumentModelRegistry;

  beforeEach(() => {
    const mockReducer = vi.fn().mockImplementation((doc, action) => {
      const nextIndex =
        Math.max(
          ...Object.values(doc.header.revision as Record<string, number>),
        ) || 0;
      return {
        ...doc,
        operations: {
          ...doc.operations,
          [action.scope]: [
            ...(doc.operations[action.scope] || []),
            {
              index: nextIndex,
              skip: 0,
              hash: "test-hash",
              timestampUtcMs: action.timestampUtcMs,
              action: action,
            },
          ],
        },
      };
    });

    registry = {
      getModule: vi.fn().mockReturnValue({ reducer: mockReducer }),
      registerModules: vi.fn(),
    } as unknown as IDocumentModelRegistry;

    mockDocStorage = createMockDocumentStorage();
    mockOperationStorage = createMockOperationStorage();
    mockOperationStore = createMockOperationStore();
    mockWriteCache = {
      getState: vi.fn().mockResolvedValue({
        header: {
          id: "doc-1",
          documentType: "powerhouse/document",
          revision: { document: 5 },
        },
        state: {
          document: {
            isDeleted: false,
          },
          global: {},
        },
        operations: {
          document: [],
          global: [],
        },
      }),
      putState: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    };

    const mockOperationIndex: any = {
      start: vi.fn().mockReturnValue({
        createCollection: vi.fn(),
        addToCollection: vi.fn(),
        removeFromCollection: vi.fn(),
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      }),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
    };

    const mockDocumentMetaCache = createMockDocumentMetaCache();
    const mockCollectionMembershipCache = createMockCollectionMembershipCache();
    executor = new SimpleJobExecutor(
      createMockLogger(),
      registry,
      mockOperationStore,
      {
        emit: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
      } as any,
      mockWriteCache,
      mockOperationIndex,
      mockDocumentMetaCache,
      mockCollectionMembershipCache,
      {},
      undefined,
    );
  });

  it("sorts incoming operations by timestamp before writing", async () => {
    const order: string[] = [];
    mockOperationStore.apply = vi
      .fn()
      .mockImplementation(
        async (_docId, _docType, _scope, _branch, _rev, fn) => {
          const txn = {
            addOperations: (operation: Operation) => {
              order.push(operation.action.id);
            },
          };
          await fn(txn as any);
        },
      );
    mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { document: 0 },
      latestTimestamp: new Date().toISOString(),
    });

    const earlyAction = createTestAction({ scope: "document" });
    const lateAction = createTestAction({ scope: "document" });
    const operations = [
      createTestOperation("doc-1", {
        index: 10,
        action: lateAction,
        timestampUtcMs: "2023-01-02T00:00:00.000Z",
      }),
      createTestOperation("doc-1", {
        index: 5,
        action: earlyAction,
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
      }),
    ];

    const result = await executor.executeJob({
      id: "job-load-order",
      kind: "load",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [],
      operations,
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    });

    expect(result.success).toBe(true);
    expect(order).toEqual([earlyAction.id, lateAction.id]);
  });
});

describe("Reactor.load", () => {
  let reactor: Reactor;
  let queue: IQueue;

  beforeEach(async () => {
    const setup = await createTestLegacyReactorSetup();
    reactor = setup.reactor;
    queue = setup.queue;
  });

  it("enqueues a load job with normalized metadata", async () => {
    const operations = [
      createTestOperation("doc-1", {
        index: 3,
        action: createTestAction({ scope: "document" }),
      }),
    ];

    const enqueueSpy = vi.spyOn(queue, "enqueue");

    const jobInfo = await reactor.load("doc-123", "main", operations);

    expect(jobInfo.status).toBe(JobStatus.PENDING);
    expect(enqueueSpy).toHaveBeenCalledTimes(1);
    const enqueuedJob = enqueueSpy.mock.calls[0][0]!;
    expect(enqueuedJob.kind).toBe("load");
    expect(enqueuedJob.documentId).toBe("doc-123");
    expect(enqueuedJob.scope).toBe("document");
    expect(enqueuedJob.operations).toHaveLength(1);
    expect(enqueuedJob.actions).toEqual([]);
  });

  it("throws when operations span multiple scopes", async () => {
    const operations = [
      createTestOperation("doc-1", {
        action: createTestAction({ scope: "document" }),
      }),
      createTestOperation("doc-1", {
        action: createTestAction({ scope: "global" }),
      }),
    ];

    await expect(reactor.load("doc-1", "main", operations)).rejects.toThrow(
      /same scope/,
    );
  });
});
