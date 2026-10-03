/**
 * W0.8, finding A of regression run 3 in
 * docs/bugs/2026-10-03-pglite-aborted-transaction-bricks-worker-reactor.md,
 * plus the redesign round that followed it.
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
 *
 * The redesign's premise is that the flush machinery was sound but its state
 * was GLOBAL while the PGlite instance is REPLACEABLE, so the first group of
 * tests is about what a recreate does to that state: an abandoned statement's
 * accounting, a flush watermark, a held statement gate and a parked filesystem
 * sync all belong to one instance incarnation and none of them may reach the
 * next one.
 */
import { driveDocumentModelModule } from "@powerhousedao/shared/document-drive";
import type { Operation } from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, sql } from "kysely";
import { PGlite } from "@electric-sql/pglite";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import { ReactorBuilder } from "../../src/core/reactor-builder.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import { ReactorEventTypes } from "../../src/events/types.js";
import type { Job } from "../../src/queue/types.js";
import type { IDocumentModelRegistry } from "../../src/registry/interfaces.js";
import { CURSOR_PROTECTED_META_KEY } from "../../src/shared/types.js";
import { FlushGuardedSyncCursorStorage } from "../../src/storage/flush-guarded-sync-cursor-storage.js";
import type { IOperationStore } from "../../src/storage/interfaces.js";
import { HardenedPGliteDialect } from "../../src/storage/kysely/pglite-dialect.js";
import {
  DEFAULT_FLUSH_QUIESCE_TIMEOUT_MS,
  PGliteEpochSupersededError,
  PGliteFlushQuiesceTimeoutError,
  PGliteFlushSyncTimeoutError,
  SelfHealingPGliteClient,
  type RecreatablePGliteInstance,
} from "../../src/storage/kysely/self-healing-pglite-client.js";
import { KyselySyncCursorStorage } from "../../src/storage/kysely/sync-cursor-storage.js";
import type { Database } from "../../src/storage/kysely/types.js";
import type { IStorageFlusher } from "../../src/storage/storage-flush.js";
import {
  NoopStorageFlusher,
  StorageEpochSupersededError,
} from "../../src/storage/storage-flush.js";
import { SyncBuilder } from "../../src/sync/sync-builder.js";
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
class FakeFilesystemInstance implements RecreatablePGliteInstance {
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

/** A barrier whose epoch the test controls, for the boundary assertions. */
class TestFlusher implements IStorageFlusher {
  readonly deferringStatementFlush = true;
  storageEpoch = 0;
  readonly trace: string[] = [];
  failure: Error | undefined = undefined;
  /** Called after each flush, so a test can supersede the epoch in between. */
  afterFlush: () => void = () => undefined;

  async flush(): Promise<void> {
    this.trace.push("flush");
    if (this.failure !== undefined) {
      throw this.failure;
    }
    await Promise.resolve();
    this.afterFlush();
  }
}

describe("epoch: a replaced instance's state cannot reach the live one", () => {
  /**
   * Finding 1. A statement whose wasm call dies never settles, so its
   * accounting is abandoned rather than cleared. When that accounting was
   * global, the leaked count outlived the instance: every later flush waited
   * for a statement that no longer existed, blocked all statements for the
   * quiesce bound and then failed - a PERMANENT wedge arriving after a
   * successful self-heal. The count now belongs to the retired incarnation and
   * is discarded with it.
   */
  it("flushes immediately after a recreate, even with a statement abandoned on the old instance", async () => {
    const first = new FakeFilesystemInstance();
    let second: FakeFilesystemInstance | undefined;
    const client = new SelfHealingPGliteClient(first, {
      openInstance: () => {
        second = new FakeFilesystemInstance(first.durable);
        return Promise.resolve(second);
      },
      onDiagnostic: () => undefined,
      // An explicit bound, so the pre-recreate wedge is observable in a test
      // rather than taking the statement deadline's fifteen minutes.
      flushQuiesceTimeoutMs: 30,
    });
    client.setDeferredFlush(true);

    await client.query("a");
    await client.flush();
    expect(first.durable).toEqual(["a"]);

    first.hangOn = /hung/;
    const abandoned = client.query("hung");
    abandoned.catch(() => undefined);
    await client.query("b").catch(() => undefined);

    // Before the recreate: the hung statement blocks the group commit, which is
    // the honest answer while that instance is still the live one.
    await expect(client.flush()).rejects.toBeInstanceOf(
      PGliteFlushQuiesceTimeoutError,
    );

    expect(await client.recreate("statement never settled")).toBe(true);

    const started = Date.now();
    await client.query("post-heal");
    await client.flush();
    const elapsed = Date.now() - started;

    expect(second?.durable).toEqual(["a", "post-heal"]);
    // No waiting on a statement that went down with the old instance.
    expect(elapsed).toBeLessThan(30);
  });

  /**
   * Finding 2, the storage half. A flush watermark that survived the swap let a
   * post-recreate flush report that it covered statements which fell back with
   * the old instance - a durable-success acknowledgment, and then a sync cursor,
   * pointing past data that does not exist. A flush now belongs to the epoch it
   * was issued against: if that epoch is replaced it rejects retriably, and it
   * cannot write a watermark into the fresh one.
   */
  it("rejects a flush whose instance was replaced, and does not credit the fresh instance for lost statements", async () => {
    const first = new FakeFilesystemInstance();
    first.syncDelayMs = 200;
    let second: FakeFilesystemInstance | undefined;
    const client = new SelfHealingPGliteClient(first, {
      openInstance: () => {
        second = new FakeFilesystemInstance();
        return Promise.resolve(second);
      },
      onDiagnostic: () => undefined,
    });
    client.setDeferredFlush(true);

    await client.query("lost-1");
    await client.query("lost-2");
    const flushing = client.flush();
    const joined = client.flush();

    expect(await client.recreate("portal stuck")).toBe(true);

    await expect(flushing).rejects.toBeInstanceOf(PGliteEpochSupersededError);
    await expect(joined).rejects.toBeInstanceOf(StorageEpochSupersededError);

    // The fresh epoch starts from nothing: its first flush covers only what ran
    // on it, so no acknowledgment can be derived from the lost statements.
    await client.query("fresh-1");
    await client.flush();
    expect(second?.durable).toEqual(["fresh-1"]);
    expect(client.storageEpoch).toBe(1);
  });

  /**
   * Finding 3. The flush awaited the filesystem sync with no bound at all, and
   * released the statement gate in that call's `finally` - so a sync that never
   * settled parked every cursor advance AND every statement behind a gate
   * nobody would ever open: the silent wedge the statement deadline cures,
   * rebuilt one layer above it. The sync is now bounded and its expiry is a
   * poison report, and retiring the epoch frees the gate whether or not the old
   * sync ever settles.
   */
  it("turns a hung filesystem sync into a recreate, and statements flow again afterwards", async () => {
    const first = new FakeFilesystemInstance();
    first.hangSync = true;
    let second: FakeFilesystemInstance | undefined;
    const diagnostics: string[] = [];
    const client = new SelfHealingPGliteClient(first, {
      openInstance: () => {
        second = new FakeFilesystemInstance();
        return Promise.resolve(second);
      },
      onDiagnostic: (message) => diagnostics.push(message),
      flushSyncTimeoutMs: 30,
    });
    client.setDeferredFlush(true);

    await client.query("a");
    const flushing = client.flush();
    const joined = client.flush();

    await expect(flushing).rejects.toBeInstanceOf(PGliteFlushSyncTimeoutError);
    // Every caller parked on the dead sync is told, retriably.
    await expect(joined).rejects.toThrow();
    expect(diagnostics.join(" ")).toContain("filesystem sync");
    expect(client.recreateCount).toBe(1);

    // The old gate died with its epoch: a statement does not wait on it.
    await client.query("b");
    await client.flush();
    expect(second?.durable).toEqual(["b"]);
  });

  /**
   * Finding 6, and the timeout-coherence question behind it. The quiesce bound
   * was 180s while a sanctioned long statement may run for 900s, so a vacuum or
   * an index build made every concurrent flush block all statements for three
   * minutes and then fail - repeatedly. There is no second clock any more: the
   * flush waits for the statement, which is bounded by that statement's own
   * deadline in the dialect, and that deadline's expiry retires the epoch and
   * frees the flush.
   */
  it("waits for a long statement instead of running a clock of its own", async () => {
    expect(DEFAULT_FLUSH_QUIESCE_TIMEOUT_MS).toBe(0);

    const instance = new FakeFilesystemInstance();
    const client = clientOver(instance);
    client.setDeferredFlush(true);

    instance.statementDelayMs = 60;
    const long = client.query("vacuum full");
    const flushing = client.flush();

    await long;
    await flushing;

    // The flush waited for the statement rather than snapshotting around it or
    // giving up on it, and nothing was treated as poisoned.
    expect(instance.durable).toEqual(["vacuum full"]);
    expect(client.recreateCount).toBe(0);
  });
});

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

  /**
   * A caller whose writes the running snapshot started before is not given that
   * snapshot: it gets the next one, because the earlier sync may have read the
   * filesystem before those writes reached it.
   */
  it("gives a caller that arrived after the snapshot started its own sync", async () => {
    const instance = new FakeFilesystemInstance();
    instance.syncDelayMs = 20;
    const client = clientOver(instance);
    client.setDeferredFlush(true);

    await client.query("a");
    const first = client.flush();
    // "b" is held back by the snapshot in flight, so it lands after it.
    const writing = client.query("b");
    await first;
    await writing;

    await client.flush();
    expect(instance.syncCount).toBe(2);
    expect(instance.durable).toEqual(["a", "b"]);
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
    const healed = new SelfHealingPGliteClient(instance, {
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

  /**
   * The permanent-gap mechanism of addendum 2, now impossible: a flush that
   * fails takes the cursor write with it, so the stored cursor stays where it
   * was and the next poll re-pulls rather than declaring itself caught up over
   * data that was never written.
   */
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

  /**
   * The half a flush alone cannot give. A flush that succeeded and was then
   * followed by a recreate covered data that has since fallen back to the last
   * durable snapshot, so letting the row stand would persist exactly the
   * advance-past-missing-data this boundary exists to prevent.
   */
  it("refuses the cursor advance when the session was replaced around the write", async () => {
    const db = await cursorDb();
    const flusher = new TestFlusher();
    const storage = new FlushGuardedSyncCursorStorage(
      new KyselySyncCursorStorage(db),
      flusher,
    );
    flusher.afterFlush = () => {
      flusher.storageEpoch += 1;
    };

    await expect(
      storage.upsert({
        remoteName: "remote-1",
        cursorType: "inbox",
        cursorOrdinal: 16796,
        lastSyncedAtUtcMs: Date.now(),
      }),
    ).rejects.toBeInstanceOf(StorageEpochSupersededError);
  });

  /** Forgetting an advance is the safe direction, so it needs no barrier. */
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
    return jobFor(id, "load", {
      sourceRemote: "accounts",
      [CURSOR_PROTECTED_META_KEY]: true,
    });
  }

  /**
   * A sync-originated load's operations came from a remote, and boundary 1
   * already keeps the inbox cursor from advancing past them - so gating each one
   * on its own filesystem sync would put the throughput cliff back one level up.
   * This exemption IS the fix.
   */
  it("does not flush for a sync-originated load job", async () => {
    const flusher = new TestFlusher();
    const { executor, emitted } = buildExecutor(flusher);

    const result = await executor.executeJob(syncLoad("job-load"));

    expect(result.success).toBe(true);
    expect(emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
    expect(flusher.trace).toEqual([]);
  });

  /**
   * Finding 10. `load` and `loadBatch` are PUBLIC reactor APIs, so the job kind
   * alone never meant "a sync cursor is protecting this": a direct caller gets
   * no cursor, and exempting it by kind handed it durable success over unflushed,
   * unprotected data. The exemption keys on the flag the sync manager's own call
   * sites set, so a direct load keeps the full durability semantics.
   */
  it("flushes for a load that no sync cursor protects", async () => {
    const flusher = new TestFlusher();
    const { executor, emitted } = buildExecutor(flusher);

    const result = await executor.executeJob(jobFor("job-direct", "load"));

    expect(result.success).toBe(true);
    expect(flusher.trace).toEqual(["flush"]);
    expect(emitted).toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  /**
   * Any other job's write-ready announcement becomes terminal success through
   * `waitForJob`, which the consistency token and W0.5's requeue drop are built
   * on - so it has to wait for a flush covering its commit.
   */
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

  /**
   * Finding 7. The job's transaction has already committed by the time the
   * flush runs, so a failing flush used to report FAILED for operations that
   * were applied and would become durable at the next flush - telling the
   * caller to redo committed work. The flush is retried instead (any later
   * group commit covers these writes too), the announcement is released as soon
   * as one succeeds, and the job is never terminally failed.
   */
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

  /**
   * When every attempt fails the announcement is WITHHELD rather than made:
   * `waitForJob` then neither succeeds nor fails and its caller times out,
   * which is the honest answer for a write that happened but is not durable.
   * The job itself is still not reported FAILED - the operations are applied and
   * the next successful flush makes them durable.
   */
  it("withholds the announcement but does not fail the job when the flush never succeeds", async () => {
    const flusher = new TestFlusher();
    flusher.failure = new Error("idb unavailable");
    const { executor, emitted } = buildExecutor(flusher);

    const result = await executor.executeJob(jobFor("job-stuck", "mutation"));

    expect(result.success).toBe(true);
    expect(flusher.trace.length).toBeGreaterThan(1);
    expect(emitted).not.toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  /**
   * The opposite case, and the reason the two are distinguished: when the
   * session was replaced the commit itself fell back to the last durable
   * snapshot, so there is nothing to announce and nothing a retry could make
   * durable. FAILED is then the truth and it propagates.
   */
  it("fails the job when the flush reports the session was replaced", async () => {
    const flusher = new TestFlusher();
    flusher.failure = new StorageEpochSupersededError("session replaced");
    const { executor, emitted } = buildExecutor(flusher);

    await expect(
      executor.executeJob(jobFor("job-superseded", "mutation")),
    ).rejects.toBeInstanceOf(StorageEpochSupersededError);
    // One attempt only: retrying would "succeed" against an epoch that has
    // nothing of this job's to flush, and announce data that is gone.
    expect(flusher.trace).toEqual(["flush"]);
    expect(emitted).not.toContain(ReactorEventTypes.JOB_WRITE_READY);
  });

  /** A store that is already durable per statement must behave as before. */
  it("does not flush at all when the barrier is a no-op", async () => {
    const trace: string[] = [];
    const flusher: IStorageFlusher = {
      deferringStatementFlush: false,
      storageEpoch: 0,
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

describe("the boundaries are enforced at seams, not at implementations", () => {
  /**
   * Finding 4. ReactorBuilder overwrote a caller-configured SyncBuilder's
   * barrier with its own - the default no-op unless the host registered one -
   * which silently removed boundary 1 from a reactor that had asked for it.
   * A default may only fill a gap.
   */
  it("does not overwrite a barrier the caller chose on the sync builder", () => {
    const chosen = new TestFlusher();
    const builder = new SyncBuilder().withStorageFlusher(chosen);

    builder.withDefaultStorageFlusher(new NoopStorageFlusher());

    expect(flusherOf(builder)).toBe(chosen);
  });

  it("fills in the default barrier when the caller chose none", () => {
    const fallback = new TestFlusher();
    const builder = new SyncBuilder().withDefaultStorageFlusher(fallback);

    expect(flusherOf(builder)).toBe(fallback);
  });

  function flusherOf(builder: SyncBuilder): IStorageFlusher {
    return (builder as unknown as { storageFlusher: IStorageFlusher })
      .storageFlusher;
  }

  /**
   * Finding 5. A pooled worker builds its own executor in its own thread, and
   * a live barrier object does not cross that boundary - so boundary 2 was
   * simply absent on the worker-pool path, with every job reporting durable
   * success over unflushed data. The combination is refused at build rather
   * than discovered after a crash.
   */
  it("refuses a worker pool together with a deferring barrier", async () => {
    const builder = new ReactorBuilder()
      .withStorageFlusher(new TestFlusher())
      .withWorkerPool({
        numWorkers: 1,
        db: { host: "localhost", port: 5433, database: "x" },
      } as never);

    await expect(builder.buildModule()).rejects.toThrow(/withWorkerPool/);
  });

  /** Same hole, same answer: a caller-supplied manager builds its own executors. */
  it("refuses a caller-supplied executor manager together with a deferring barrier", async () => {
    const builder = new ReactorBuilder()
      .withStorageFlusher(new TestFlusher())
      .withExecutor({
        start: () => Promise.resolve(),
        stop: () => Promise.resolve(),
      } as never);

    await expect(builder.buildModule()).rejects.toThrow(/withExecutor/);
  });
});
