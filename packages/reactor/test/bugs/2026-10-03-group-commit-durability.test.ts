/**
 * Group commit moves the filesystem sync off every statement to two
 * acknowledgment boundaries: a sync cursor write and a job's write-ready. No
 * cursor and no durable-success announcement may point past unflushed data.
 */
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type { Job } from "../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import { cursorProtectedLoadMeta } from "../../src/shared/types.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import type { IStorageFlusher } from "../../src/storage/storage-flush.js";
import {
  NoopStorageFlusher,
  StoragePoisonedError,
} from "../../src/storage/storage-flush.js";
import {
  createMockCollectionMembershipCache,
  createMockDocumentMetaCache,
  createMockLogger,
  createMockOperationStore,
  createTestAction,
  createTestOperation,
} from "../factories.js";

/** A barrier the boundary tests control. */
class TestFlusher implements IStorageFlusher {
  readonly trace: string[] = [];
  failure: Error | undefined = undefined;

  async flush(): Promise<void> {
    this.trace.push("flush");
    if (this.failure !== undefined) {
      throw this.failure;
    }
    await Promise.resolve();
  }
}

describe("durability boundary 2: a job's durable success waits for the flush", () => {
  function buildExecutor(
    flusher: IStorageFlusher,
    config: Record<string, unknown> = {},
  ) {
    const reducer = vi.fn(
      (doc: Record<string, never>, action: Record<string, never>) => {
        const document = doc as unknown as {
          header: { revision: Record<string, number> };
          operations: Record<string, unknown[]>;
        };
        const act = action as unknown as {
          scope: string;
          timestampUtcMs: string;
        };
        const nextIndex =
          Math.max(...Object.values(document.header.revision)) || 0;
        return {
          ...document,
          operations: {
            ...document.operations,
            [act.scope]: [
              ...(document.operations[act.scope] ?? []),
              {
                index: nextIndex,
                skip: 0,
                hash: "test-hash",
                timestampUtcMs: act.timestampUtcMs,
                action,
              },
            ],
          },
        };
      },
    );
    const registry: IDocumentModelRegistry = {
      getModule: vi.fn().mockReturnValue({ reducer }),
      registerModules: vi.fn(),
      unregisterModules: vi.fn(),
      getAllModules: vi
        .fn()
        .mockReturnValue([
          driveDocumentModelModule,
          documentModelDocumentModelModule,
        ]),
    } as unknown as IDocumentModelRegistry;

    const operationStore = createMockOperationStore() as IOperationStore;
    operationStore.apply = vi
      .fn()
      .mockImplementation(
        async (
          _documentId: string,
          _documentType: string,
          _scope: string,
          _branch: string,
          _revision: number,
          fn: (txn: unknown) => Promise<void>,
        ) => {
          const operations: Operation[] = [];
          await fn({
            addOperations: (operation: Operation) => operations.push(operation),
          });
          return operations;
        },
      );
    operationStore.getRevisions = vi.fn().mockResolvedValue({
      revision: { document: 0 },
      latestTimestamp: new Date().toISOString(),
    });

    const writeCache = {
      getState: vi.fn().mockResolvedValue({
        header: {
          id: "doc-1",
          documentType: "powerhouse/document",
          revision: { document: 5 },
          protocolVersions: { "base-reducer": 2 },
        },
        state: { document: { isDeleted: false }, global: {} },
        operations: { document: [], global: [] },
      }),
      putState: vi.fn(),
      putRun: vi.fn(),
      invalidate: vi.fn(),
      clear: vi.fn(),
      startup: vi.fn(),
      shutdown: vi.fn(),
    } as unknown as IWriteCache;

    const operationIndex = {
      start: vi.fn().mockReturnValue({
        createCollection: vi.fn(),
        addToCollection: vi.fn(),
        removeFromCollection: vi.fn(),
        recordGroupReferences: vi.fn(),
        getMembershipInvalidations: vi.fn(() => []),
        write: vi.fn(),
      }),
      commit: vi.fn().mockResolvedValue([]),
      find: vi.fn().mockResolvedValue({
        results: [],
        options: { cursor: "0", limit: 100 },
      }),
      getCollectionsForDocuments: vi.fn().mockResolvedValue({}),
      getGroupReferencers: vi.fn().mockResolvedValue([]),
    };

    const emitted: number[] = [];
    const eventBus = {
      emit: vi.fn((type: number) => {
        emitted.push(type);
        return Promise.resolve(undefined);
      }),
      subscribe: vi.fn(),
    };

    const executor = new SimpleJobExecutor(
      createMockLogger(),
      registry,
      operationStore,
      eventBus as never,
      writeCache,
      operationIndex as never,
      createMockDocumentMetaCache(),
      createMockCollectionMembershipCache(),
      DEFAULT_DRIVE_CONTAINER_TYPES,
      { retryBaseDelayMs: 1, retryMaxDelayMs: 2, ...config },
      undefined,
      undefined,
      undefined,
      flusher,
    );
    return { executor, emitted };
  }

  /** A load job carries operations from a remote; a mutation job carries actions. */
  function jobFor(
    id: string,
    kind: Job["kind"],
    meta: Record<string, unknown> = {},
  ): Job {
    const load = kind === "load";
    return {
      id,
      kind,
      documentId: "doc-1",
      scope: "document",
      branch: "main",
      actions: load ? [] : [createTestAction({ scope: "document" })],
      operations: load
        ? [
            createTestOperation("doc-1", {
              index: 5,
              action: createTestAction({ scope: "document" }),
              timestampUtcMs: "2023-01-01T00:00:00.000Z",
            }),
          ]
        : [],
      createdAt: new Date().toISOString(),
      queueHint: [],
      errorHistory: [],
      meta: { batchId: "test", batchJobIds: [id], ...meta },
    } as unknown as Job;
  }

  /** The load the sync manager issues: its inbox cursor protects it. */
  function syncLoad(id: string): Job {
    return jobFor(id, "load", cursorProtectedLoadMeta("accounts"));
  }

  it("does not flush for a sync-originated load job", async () => {
    const flusher = new TestFlusher();
    const { executor, emitted } = buildExecutor(flusher);

    const result = await executor.executeJob(syncLoad("job-load"));

    expect(result.success).toBe(true);
    expect(emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
    expect(flusher.trace).toEqual([]);
  });

  it("flushes for a load that no sync cursor protects", async () => {
    const flusher = new TestFlusher();
    const { executor, emitted } = buildExecutor(flusher);

    const result = await executor.executeJob(jobFor("job-direct", "load"));

    expect(result.success).toBe(true);
    expect(flusher.trace).toEqual(["flush"]);
    expect(emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  it("flushes for a load whose caller copied the marker through serialization", async () => {
    const flusher = new TestFlusher();
    const { executor } = buildExecutor(flusher);
    const forged = JSON.parse(
      JSON.stringify(cursorProtectedLoadMeta("accounts")),
    ) as Record<string, unknown>;

    await executor.executeJob(
      jobFor("job-forged", "load", { ...forged, cursorProtected: true }),
    );

    expect(flusher.trace).toEqual(["flush"]);
  });

  it("flushes before announcing a mutation job", async () => {
    const flusher = new TestFlusher();
    const gated = buildExecutor(flusher);

    const result = await gated.executor.executeJob(
      jobFor("job-mutation", "mutation"),
    );

    expect(result.success).toBe(true);
    expect(flusher.trace).toEqual(["flush"]);
    expect(gated.emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  it("retries the flush and releases the announcement, instead of failing a committed job", async () => {
    const flusher = new TestFlusher();
    flusher.failure = new Error("idb unavailable");
    let attempts = 0;
    const original = flusher.flush.bind(flusher);
    flusher.flush = async () => {
      attempts += 1;
      if (attempts >= 3) {
        flusher.failure = undefined;
      }
      await original();
    };

    const { executor, emitted } = buildExecutor(flusher);
    const result = await executor.executeJob(jobFor("job-retry", "mutation"));

    expect(result.success).toBe(true);
    expect(attempts).toBe(3);
    expect(emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  it("withholds the announcement at once when the store is poisoned", async () => {
    const flusher = new TestFlusher();
    flusher.failure = new StoragePoisonedError("poisoned");
    const { executor, emitted } = buildExecutor(flusher);

    const result = await executor.executeJob(
      jobFor("job-poisoned", "mutation"),
    );

    expect(result.success).toBe(true);
    expect(flusher.trace).toEqual(["flush"]);
    expect(emitted).not.toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  it("withholds the announcement but does not fail the job when the flush never succeeds", async () => {
    const flusher = new TestFlusher();
    flusher.failure = new Error("idb unavailable");
    const { executor, emitted } = buildExecutor(flusher);

    const result = await executor.executeJob(jobFor("job-stuck", "mutation"));

    expect(result.success).toBe(true);
    expect(flusher.trace.length).toBeGreaterThan(1);
    expect(emitted).not.toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  it("does not announce a job the manager aborted while it waited for the flush", async () => {
    const flusher = new TestFlusher();
    flusher.flush = () => new Promise(() => undefined);
    const { executor, emitted } = buildExecutor(flusher);
    const controller = new AbortController();

    const running = executor.executeJob(
      jobFor("job-aborted", "mutation"),
      controller.signal,
    );
    setTimeout(() => controller.abort(), 20);
    const result = await running;

    expect(result.success).toBe(true);
    expect(emitted).not.toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  it("withholds the announcement once the flush outlives the durability wait", async () => {
    const flusher = new TestFlusher();
    flusher.flush = () => new Promise(() => undefined);
    const { executor, emitted } = buildExecutor(flusher, {
      durabilityWaitMs: 30,
    });

    const started = Date.now();
    await executor.executeJob(jobFor("job-slow-flush", "mutation"));

    expect(Date.now() - started).toBeLessThan(1_000);
    expect(emitted).not.toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  it("announces as before over a store durable per statement", async () => {
    const { executor, emitted } = buildExecutor(new NoopStorageFlusher());

    await executor.executeJob(jobFor("job-mutation-3", "mutation"));

    expect(emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
  });
});
