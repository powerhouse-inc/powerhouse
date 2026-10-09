/**
 * Group commit moves the filesystem sync off every statement to two
 * acknowledgment boundaries: a sync cursor write and a job's write-ready. No
 * cursor and no durable-success announcement may point past unflushed data.
 */
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { PGlite } from "@electric-sql/pglite";
import { Kysely, sql } from "kysely";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type { Job } from "../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import { cursorProtectedLoadMeta } from "../../src/shared/types.js";
import { FlushGuardedSyncCursorStorage } from "../../src/storage/flush-guarded-sync-cursor-storage.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import {
  GroupCommitPGliteClient,
  type GroupCommitPGliteInstance,
} from "../../src/storage/kysely/group-commit-pglite-client.js";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";
import { KyselySyncCursorStorage } from "../../src/storage/kysely/sync-cursor-storage.js";
import type { Database } from "../../src/storage/kysely/types.js";
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

/**
 * A PGlite stand-in that models the thing that actually matters here: writes
 * land in the wasm filesystem, and only a `syncToFs` copies them to durable
 * storage. Like PGlite it calls its own `syncToFs` after every statement, so
 * suppressing that method is what the deferral has to achieve. It can also
 * model the two wasm deaths that raise no error: a statement that never settles
 * and a filesystem sync that never settles.
 */
class FakeFilesystemInstance implements GroupCommitPGliteInstance {
  /** Writes held only in the wasm filesystem. */
  readonly memory: string[] = [];
  /** Writes copied out by a sync; what a crash or a reopen reads back. */
  durable: string[] = [];
  syncCount = 0;
  closed = false;
  syncDelayMs = 0;
  statementDelayMs = 0;
  syncFailure: Error | undefined = undefined;
  /** A statement matching this never settles: a dead wasm call. */
  hangOn: RegExp | undefined = undefined;
  /** The filesystem sync never settles. */
  hangSync = false;
  /** Order of significant events, for ordering assertions. */
  readonly trace: string[] = [];

  private readonly base: string[];

  constructor(durable: string[] = []) {
    this.base = [...durable];
    this.durable = [...durable];
  }

  async syncToFs(): Promise<void> {
    this.syncCount += 1;
    this.trace.push(`sync:${this.syncCount}`);
    if (this.hangSync) {
      await new Promise<void>(() => undefined);
    }
    const snapshot = [...this.memory];
    if (this.syncDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.syncDelayMs));
    }
    if (this.syncFailure !== undefined) {
      throw this.syncFailure;
    }
    this.durable = [...this.base, ...snapshot];
  }

  async query(
    statement: string,
    _params?: unknown[],
  ): Promise<{ rows: unknown[]; affectedRows?: number }> {
    if (this.hangOn?.test(statement) === true) {
      await new Promise<void>(() => undefined);
    }
    if (this.statementDelayMs > 0) {
      await new Promise((resolve) =>
        setTimeout(resolve, this.statementDelayMs),
      );
    }
    this.memory.push(statement);
    this.trace.push(`write:${statement}`);
    await this.syncToFs();
    return { rows: [] };
  }

  async exec(statement: string): Promise<unknown> {
    await this.query(statement);
    return undefined;
  }

  isInTransaction(): boolean {
    return false;
  }

  close(): Promise<void> {
    this.closed = true;
    return Promise.resolve();
  }
}

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

describe("durability boundary 1: a sync cursor never outruns its data", () => {
  let open: PGlite[] = [];

  afterEach(async () => {
    const toClose = open;
    open = [];
    for (const pg of toClose) {
      await pg.close().catch(() => undefined);
    }
  });

  async function cursorDb(): Promise<Kysely<Database>> {
    const pg = new PGlite();
    await pg.waitReady;
    open.push(pg);

    const db = new Kysely<Database>({
      dialect: new HardenedPGliteDialect(pg, {
        onDiagnostic: () => undefined,
      }),
    });
    await sql`create schema if not exists reactor`.execute(db);
    await sql`
      create table reactor.sync_cursors (
        remote_name text not null,
        cursor_type text not null,
        cursor_ordinal bigint not null,
        last_synced_at_utc_ms timestamptz,
        updated_at timestamptz default now(),
        primary key (remote_name, cursor_type)
      )
    `.execute(db);
    await sql`set search_path to reactor, public`.execute(db);
    return db;
  }

  it("flushes before it writes the cursor row, and not after", async () => {
    const db = await cursorDb();
    const flusher = new TestFlusher();
    const storage = new FlushGuardedSyncCursorStorage(
      new KyselySyncCursorStorage(db),
      flusher,
    );

    await storage.upsert({
      remoteName: "remote-1",
      cursorType: "inbox",
      cursorOrdinal: 42,
      lastSyncedAtUtcMs: Date.now(),
    });

    expect(flusher.trace).toEqual(["flush"]);
    const stored = await storage.get("remote-1", "inbox");
    expect(stored.cursorOrdinal).toBe(42);
  });

  it("does not write the cursor when the covering flush fails", async () => {
    const db = await cursorDb();
    const flusher = new TestFlusher();
    flusher.failure = new Error("idb unavailable");
    const storage = new FlushGuardedSyncCursorStorage(
      new KyselySyncCursorStorage(db),
      flusher,
    );

    await expect(
      storage.upsert({
        remoteName: "remote-1",
        cursorType: "inbox",
        cursorOrdinal: 9770,
        lastSyncedAtUtcMs: Date.now(),
      }),
    ).rejects.toThrow("idb unavailable");

    const stored = await storage.get("remote-1", "inbox");
    expect(stored.cursorOrdinal).toBe(0);
  });

  it("does not flush to remove a cursor", async () => {
    const db = await cursorDb();
    const flusher = new TestFlusher();
    const storage = new FlushGuardedSyncCursorStorage(
      new KyselySyncCursorStorage(db),
      flusher,
    );

    await storage.remove("remote-1");
    expect(flusher.trace).toEqual([]);
  });

  it("loses the batch but not the cursor when the crash comes before the flush", async () => {
    const instance = new FakeFilesystemInstance();
    const client = new GroupCommitPGliteClient(instance, {
      onDiagnostic: () => undefined,
    });

    const persistedCursor = { ordinal: 100 };
    const applyBatch = async (ordinals: number[]): Promise<void> => {
      for (const ordinal of ordinals) {
        await client.query(`op-${ordinal}`);
      }
      await client.flush();
      persistedCursor.ordinal = ordinals[ordinals.length - 1];
    };

    await applyBatch([101, 102, 103]);
    expect(instance.durable).toEqual(["op-101", "op-102", "op-103"]);
    expect(persistedCursor.ordinal).toBe(103);

    // The next batch applies but the process dies before the flush.
    await client.query("op-104");
    await client.query("op-105");
    const afterCrash = [...instance.durable];

    expect(afterCrash).toEqual(["op-101", "op-102", "op-103"]);
    expect(persistedCursor.ordinal).toBe(103);
  });
});

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
