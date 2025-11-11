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
import type { Job } from "../../src/queue/types.js";
import { JobStatus } from "../../src/shared/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import {
  createMockDocumentStorage,
  createMockOperationStorage,
  createMockOperationStore,
  createTestAction,
  createTestOperation,
  createTestReactorSetup,
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

    executor = new SimpleJobExecutor(
      registry,
      mockDocStorage,
      mockOperationStorage,
      mockOperationStore,
      {
        emit: vi.fn().mockResolvedValue(undefined),
        subscribe: vi.fn(),
      } as any,
      mockWriteCache,
      { legacyStorageEnabled: true },
    );
  });

  it("reindexes operations and sets skip when conflicts are detected", async () => {
    const writtenOperations: Operation[] = [];
    mockOperationStore.apply = vi
      .fn()
      .mockImplementation(
        async (_docId, _docType, _scope, _branch, _rev, fn) => {
          const txn = {
            addOperations: (operation: Operation) => {
              writtenOperations.push(operation);
            },
          };
          await fn(txn as any);
        },
      );
    mockOperationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { document: 5 },
      latestTimestamp: new Date().toISOString(),
    });

    const operations = [
      createTestOperation({
        index: 3,
        action: createTestAction({ scope: "document" }),
        timestampUtcMs: "2023-01-01T00:00:00.000Z",
      }),
      createTestOperation({
        index: 4,
        action: createTestAction({ scope: "document" }),
        timestampUtcMs: "2023-01-02T00:00:00.000Z",
      }),
    ];

    const job: Job = {
      id: "job-load",
      kind: "load",
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: [],
      operations,
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
    };

    const result = await executor.executeJob(job);

    expect(result.success).toBe(true);
    expect(writtenOperations).toHaveLength(2);
    expect(writtenOperations[0]?.index).toBe(5);
    expect(writtenOperations[0]?.skip).toBe(2);
    expect(writtenOperations[1]?.index).toBe(6);
    expect(mockWriteCache.invalidate).toHaveBeenCalledWith(
      "doc-1",
      "document",
      "main",
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

    const operations = [
      createTestOperation({
        index: 10,
        action: createTestAction({ id: "late", scope: "document" }),
        timestampUtcMs: "2023-01-02T00:00:00.000Z",
      }),
      createTestOperation({
        index: 5,
        action: createTestAction({ id: "early", scope: "document" }),
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
    expect(order).toEqual(["early", "late"]);
  });
});

describe("Reactor.load", () => {
  let reactor: Reactor;
  let queue: IQueue;

  beforeEach(async () => {
    const setup = await createTestReactorSetup();
    reactor = setup.reactor;
    queue = setup.queue;
  });

  it("enqueues a load job with normalized metadata", async () => {
    const operations = [
      createTestOperation({
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
      createTestOperation({
        action: createTestAction({ scope: "document" }),
      }),
      createTestOperation({
        action: createTestAction({ scope: "global" }),
      }),
    ];

    await expect(reactor.load("doc-1", "main", operations)).rejects.toThrow(
      /same scope/,
    );
  });

  it("throws when an operation is missing hash", async () => {
    const operations = [createTestOperation()];
    Reflect.deleteProperty(operations[0] as Record<string, unknown>, "hash");
    expect(operations[0]?.hash).toBeUndefined();

    await expect(
      reactor.load("doc-1", "main", operations as Operation[]),
    ).rejects.toThrow(/hash/);
  });
});
