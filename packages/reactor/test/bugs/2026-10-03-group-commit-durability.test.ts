/**
 * W0.8, finding A of regression run 3 in
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md.
 *
 * The durable store flushed its wasm filesystem on every statement, which made
 * committed mean flushed and capped bulk sync catch-up at ~2 operations per
 * second: the ~16,600-operation Accounts collection became a two-hour grind
 * that saturated the single-threaded worker and froze the tab.
 *
 * Group commit takes the flush off the statements and puts it at the two places
 * the reactor makes a promise it cannot take back - a sync cursor write, and a
 * non-load job's write-ready announcement. These tests assert the invariant
 * that makes that safe: no cursor and no durable-success acknowledgment may
 * ever point past data that is not flushed.
 */
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, sql } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type { Job } from "../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";
import {
  SelfHealingPGliteClient,
  type RecreatablePGliteInstance,
} from "../../src/storage/kysely/self-healing-pglite-client.js";
import { KyselySyncCursorStorage } from "../../src/storage/kysely/sync-cursor-storage.js";
import type { Database } from "../../src/storage/kysely/types.js";
import type { IStorageFlusher } from "../../src/storage/storage-flush.js";
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
 * suppressing that method is what the deferral has to achieve.
 */
class FakeFilesystemInstance implements RecreatablePGliteInstance {
  /** Writes held only in the wasm filesystem. */
  readonly memory: string[] = [];
  /** Writes copied out by a sync; what a crash or a reopen reads back. */
  durable: string[] = [];
  syncCount = 0;
  closed = false;
  syncDelayMs = 0;
  syncFailure: Error | undefined = undefined;
  /** Order of significant events, for ordering assertions. */
  readonly trace: string[] = [];

  constructor(durable: string[] = []) {
    this.durable = [...durable];
  }

  async syncToFs(): Promise<void> {
    this.syncCount += 1;
    this.trace.push(`sync:${this.syncCount}`);
    const snapshot = [...this.memory];
    if (this.syncDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.syncDelayMs));
    }
    if (this.syncFailure !== undefined) {
      throw this.syncFailure;
    }
    this.durable = snapshot;
  }

  async query(
    statement: string,
    _params?: unknown[],
  ): Promise<{ rows: unknown[]; affectedRows?: number }> {
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

function clientOver(
  instance: FakeFilesystemInstance,
  replacement?: FakeFilesystemInstance,
) {
  return new SelfHealingPGliteClient(instance, {
    openInstance: () =>
      replacement
        ? Promise.resolve(replacement)
        : Promise.reject(new Error("no replacement")),
    onDiagnostic: () => undefined,
  });
}

describe("group commit: statements stop flushing, the barrier moves", () => {
  it("takes the per-statement sync away and puts a real one behind flush()", async () => {
    const instance = new FakeFilesystemInstance();
    const client = clientOver(instance);

    await client.query("a");
    expect(instance.syncCount).toBe(1);
    expect(client.deferringStatementFlush).toBe(false);

    client.setDeferredFlush(true);
    expect(client.deferringStatementFlush).toBe(true);

    await client.query("b");
    await client.query("c");
    expect(instance.syncCount).toBe(1);
    expect(instance.durable).toEqual(["a"]);

    await client.flush();
    expect(instance.syncCount).toBe(2);
    expect(instance.durable).toEqual(["a", "b", "c"]);
  });

  /**
   * The throughput claim in one assertion: the same work under deferral costs
   * one filesystem sync instead of one per statement. The ratio is the batch
   * size, which is why bulk catch-up stops being flush-bound.
   */
  it("costs one sync per batch instead of one per statement", async () => {
    const perStatement = new FakeFilesystemInstance();
    const perStatementClient = clientOver(perStatement);
    for (let index = 0; index < 50; index += 1) {
      await perStatementClient.query(`op-${index}`);
    }

    const batched = new FakeFilesystemInstance();
    const batchedClient = clientOver(batched);
    batchedClient.setDeferredFlush(true);
    for (let index = 0; index < 50; index += 1) {
      await batchedClient.query(`op-${index}`);
    }
    await batchedClient.flush();

    expect(perStatement.syncCount).toBe(50);
    expect(batched.syncCount).toBe(1);
    expect(batched.durable).toHaveLength(50);
  });

  /**
   * Group commit has three jobs: callers that arrive together share one sync, a
   * caller with nothing new to make durable costs nothing, and a statement
   * issued while a snapshot is being taken waits for it - because a filesystem
   * sync reads the filesystem asynchronously, so a concurrent write would be
   * captured half-done. PGlite gets that last property for free by holding its
   * query mutex across the per-statement sync; the explicit flush has to
   * reproduce it.
   */
  it("coalesces concurrent callers, skips an idle flush, and holds statements back while it snapshots", async () => {
    const instance = new FakeFilesystemInstance();
    instance.syncDelayMs = 20;
    const client = clientOver(instance);
    client.setDeferredFlush(true);

    await client.query("a");
    await client.query("b");
    await Promise.all([client.flush(), client.flush()]);
    expect(instance.syncCount).toBe(1);
    expect(instance.durable).toEqual(["a", "b"]);

    await client.flush();
    expect(instance.syncCount).toBe(1);

    await client.query("c");
    const flushing = client.flush();
    const writing = client.query("d");

    await flushing;
    expect(instance.syncCount).toBe(2);
    expect(instance.durable).toEqual(["a", "b", "c"]);

    await writing;
    expect(instance.memory).toEqual(["a", "b", "c", "d"]);
    expect(instance.durable).toEqual(["a", "b", "c"]);
  });

  /** A flush that fails must reject, so no caller acknowledges anything. */
  it("rejects when the filesystem sync fails", async () => {
    const instance = new FakeFilesystemInstance();
    const client = clientOver(instance);
    client.setDeferredFlush(true);

    await client.query("a");
    instance.syncFailure = new Error("idb quota exceeded");
    await expect(client.flush()).rejects.toThrow("idb quota exceeded");
    expect(instance.durable).toEqual([]);
  });

  it("keeps deferring after a recreate, and the replacement reads the last flushed state", async () => {
    const instance = new FakeFilesystemInstance();
    const client = clientOver(instance);
    client.setDeferredFlush(true);

    await client.query("committed");
    await client.flush();
    await client.query("after-the-flush");

    const replacement = new FakeFilesystemInstance(instance.durable);
    const healed = await new SelfHealingPGliteClient(instance, {
      openInstance: () => Promise.resolve(replacement),
      onDiagnostic: () => undefined,
    });
    healed.setDeferredFlush(true);
    expect(await healed.recreate("portal stuck")).toBe(true);

    // The write after the last flush is gone, which is the window the two
    // acknowledgment boundaries make safe; the flushed one survives.
    expect(replacement.durable).toEqual(["committed"]);
    await healed.query("post-heal");
    expect(replacement.syncCount).toBe(0);
    expect(healed.deferringStatementFlush).toBe(true);
  });

  /**
   * PGlite's own `close` relies on the per-statement sync of its final
   * protocol message for the closing flush, and deferral took that away - so a
   * clean shutdown has to flush explicitly or silently discard the tail.
   */
  it("flushes on close and gives the per-statement sync back", async () => {
    const instance = new FakeFilesystemInstance();
    const client = clientOver(instance);
    client.setDeferredFlush(true);

    await client.query("tail");
    await client.close();

    expect(instance.durable).toEqual(["tail"]);
    expect(instance.closed).toBe(true);
    expect(client.deferringStatementFlush).toBe(false);
  });
});

describe("durability boundary 1: a sync cursor never outruns its data", () => {
  let open: PGlite[] = [];

  afterEach(async () => {
    const toClose = open;
    open = [];
    for (const pg of toClose) {
      await pg.close().catch(() => undefined);
    }
  });

  /** Records whether a flush covering the writes happened before each write. */
  function recordingFlusher(trace: string[]): IStorageFlusher {
    return {
      deferringStatementFlush: true,
      flush: () => {
        trace.push("flush");
        return Promise.resolve();
      },
    };
  }

  it("flushes before it writes the cursor row, and not after", async () => {
    const pg = new PGlite();
    await pg.waitReady;
    open.push(pg);

    const trace: string[] = [];
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

    const storage = new KyselySyncCursorStorage(db, recordingFlusher(trace));
    await storage.upsert({
      remoteName: "remote-1",
      cursorType: "inbox",
      cursorOrdinal: 42,
      lastSyncedAtUtcMs: Date.now(),
    });

    expect(trace).toEqual(["flush"]);
    const stored = await storage.get("remote-1", "inbox");
    expect(stored.cursorOrdinal).toBe(42);
  });

  /**
   * The permanent-gap mechanism of addendum 2, now impossible: a flush that
   * fails takes the cursor write with it, so the stored cursor stays where it
   * was and the next poll re-pulls rather than declaring itself caught up over
   * data that was never written.
   */
  it("does not write the cursor when the covering flush fails", async () => {
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

    const failing: IStorageFlusher = {
      deferringStatementFlush: true,
      flush: () => Promise.reject(new Error("idb unavailable")),
    };
    const storage = new KyselySyncCursorStorage(db, failing);

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

  /**
   * The crash simulation, on the model that makes the distinction visible: a
   * batch is applied, the covering flush runs, the cursor row is written. A
   * crash at any point can only lose the cursor advance, never the data it
   * covers - and a crash BEFORE the cursor write loses the batch while leaving
   * the cursor where it was, so the next poll re-pulls exactly that batch.
   */
  it("loses the batch but not the cursor when the crash comes before the flush", async () => {
    const instance = new FakeFilesystemInstance();
    const client = clientOver(instance);
    client.setDeferredFlush(true);

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
  function buildExecutor(flusher: IStorageFlusher) {
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
      {},
      undefined,
      undefined,
      undefined,
      flusher,
    );
    return { executor, emitted };
  }

  /** A load job carries operations from a remote; a mutation job carries actions. */
  function jobFor(id: string, kind: Job["kind"]): Job {
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
      meta: { batchId: "test", batchJobIds: [id] },
    } as unknown as Job;
  }

  /**
   * A load job's operations came from a remote, and boundary 1 already keeps
   * the inbox cursor from advancing past them - so gating each one on its own
   * filesystem sync would put the throughput cliff back one level up. This
   * exemption IS the fix.
   */
  it("does not flush for a load job", async () => {
    const trace: string[] = [];
    const flusher: IStorageFlusher = {
      deferringStatementFlush: true,
      flush: () => {
        trace.push("flush");
        return Promise.resolve();
      },
    };
    const { executor, emitted } = buildExecutor(flusher);

    const result = await executor.executeJob(jobFor("job-load", "load"));

    expect(result.success).toBe(true);
    expect(emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
    expect(trace).toEqual([]);
  });

  /**
   * Any other job's write-ready announcement becomes terminal success through
   * `waitForJob`, which the consistency token and W0.5's requeue drop are built
   * on - so it has to wait for a flush covering its commit.
   */
  it("flushes before announcing a non-load job, and announces nothing if the flush fails", async () => {
    const trace: string[] = [];
    const flusher: IStorageFlusher = {
      deferringStatementFlush: true,
      flush: () => {
        trace.push("flush");
        return Promise.resolve();
      },
    };
    const gated = buildExecutor(flusher);
    const result = await gated.executor.executeJob(
      jobFor("job-mutation", "mutation"),
    );

    expect(result.success).toBe(true);
    expect(trace).toEqual(["flush"]);
    expect(gated.emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);

    const failing: IStorageFlusher = {
      deferringStatementFlush: true,
      flush: () => Promise.reject(new Error("idb unavailable")),
    };
    const refused = buildExecutor(failing);
    await expect(
      refused.executor.executeJob(jobFor("job-mutation-2", "mutation")),
    ).rejects.toThrow("idb unavailable");
    expect(refused.emitted).not.toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  /** A store that is already durable per statement must behave as before. */
  it("does not flush at all when the barrier is a no-op", async () => {
    const trace: string[] = [];
    const flusher: IStorageFlusher = {
      deferringStatementFlush: false,
      flush: () => {
        trace.push("flush");
        return Promise.resolve();
      },
    };
    const { executor, emitted } = buildExecutor(flusher);

    await executor.executeJob(jobFor("job-mutation-3", "mutation"));

    expect(trace).toEqual([]);
    expect(emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
  });
});
