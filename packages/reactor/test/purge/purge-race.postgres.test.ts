import type {
  Operation,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { documentModelDocumentModelModule } from "document-model";
import { Kysely, PostgresDialect, sql } from "kysely";
import { Pool, type PoolClient } from "pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CollectionMembershipCache } from "../../src/cache/collection-membership-cache.js";
import { DocumentMetaCache } from "../../src/cache/document-meta-cache.js";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../src/cache/kysely-write-cache.js";
import { DEFAULT_DRIVE_CONTAINER_TYPES } from "../../src/core/drive-container-types.js";
import type { Database } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../src/events/types.js";
import {
  KyselyExecutionScope,
  type ExecutionStores,
  type IExecutionScope,
} from "../../src/executor/execution-scope.js";
import { SimpleJobExecutor } from "../../src/executor/simple-job-executor.js";
import type { JobResult } from "../../src/executor/types.js";
import {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "../../src/read-models/document-view.js";
import { DocumentModelRegistry } from "../../src/registry/implementation.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import type { PurgeRows } from "../../src/shared/purge-types.js";
import { KyselyDocumentPurger } from "../../src/storage/kysely/document-purger.js";
import { KyselyKeyframeStore } from "../../src/storage/kysely/keyframe-store.js";
import { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import { runMigrations } from "../../src/storage/migrations/migrator.js";
import { createMockLogger, createTestJob } from "../factories.js";
import {
  buildReactor,
  createDocument,
  deleteDocument,
  emptyRows,
  PG_TEST_URL,
  renameDocument,
  rowsAbout,
  storedOperations,
} from "./helpers.js";

/** Lets a test hold a job's transaction open after its writes, before commit. */
class HoldingScope implements IExecutionScope {
  hold: Promise<void> | undefined;
  reached: (() => void) | undefined;

  constructor(private readonly inner: IExecutionScope) {}

  run<T>(
    fn: (stores: ExecutionStores) => Promise<T>,
    signal?: AbortSignal,
  ): Promise<T> {
    return this.inner.run(async (stores) => {
      const result = await fn(stores);
      if (this.hold) {
        this.reached?.();
        await this.hold;
      }
      return result;
    }, signal);
  }
}

let schemaCounter = 0;

describe("a load racing a purge (Postgres)", () => {
  let baseDb: Kysely<Database>;
  let db: Kysely<Database>;
  let schema: string;
  let scope: HoldingScope;
  let executor: SimpleJobExecutor;
  let documentView: KyselyDocumentView;
  let writeReady: OperationWithContext[][];
  let history: Record<string, Operation[]>;
  let lockClient: PoolClient | undefined;
  let pool: Pool;

  beforeEach(async () => {
    const source = await buildReactor();
    await createDocument(source, "raced");
    await renameDocument(source, "raced", "one");
    await renameDocument(source, "raced", "two");
    await deleteDocument(source, "raced");
    history = await storedOperations(source, "raced");
    source.reactor.kill();

    schema = `reactor_purge_race_${process.pid}_${schemaCounter++}`;
    pool = new Pool({ connectionString: PG_TEST_URL, max: 10 });
    baseDb = new Kysely<Database>({ dialect: new PostgresDialect({ pool }) });
    const migrated = await runMigrations(baseDb, schema);
    if (!migrated.success) {
      throw migrated.error ?? new Error("migration failed");
    }
    db = baseDb.withSchema(schema);
    const storage = db as unknown as Kysely<StorageDatabase>;

    const registry = new DocumentModelRegistry();
    registry.registerModules(documentModelDocumentModelModule);
    const operationStore = new KyselyOperationStore(storage);
    const keyframeStore = new KyselyKeyframeStore(storage);
    const writeCache = new KyselyWriteCache(
      keyframeStore,
      operationStore,
      registry,
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 10 },
    );
    await writeCache.startup();
    const operationIndex = new KyselyOperationIndex(storage);
    const documentMetaCache = new DocumentMetaCache(operationStore, {
      maxDocuments: 10,
    });
    await documentMetaCache.startup();
    const collectionMembershipCache = new CollectionMembershipCache(
      operationIndex,
    );
    scope = new HoldingScope(
      new KyselyExecutionScope(
        storage,
        operationStore,
        operationIndex,
        keyframeStore,
        writeCache,
        documentMetaCache,
        collectionMembershipCache,
      ),
    );

    const eventBus = new EventBus();
    writeReady = [];
    eventBus.subscribe<JobWriteReadyEvent>(
      ReactorEventTypes.JOB_WRITE_READY,
      (_type, event) => {
        writeReady.push(event.operations);
      },
    );
    executor = new SimpleJobExecutor(
      createMockLogger(),
      registry,
      operationStore,
      eventBus,
      writeCache,
      operationIndex,
      documentMetaCache,
      collectionMembershipCache,
      DEFAULT_DRIVE_CONTAINER_TYPES,
      {},
      undefined,
      scope,
    );

    documentView = new KyselyDocumentView(
      db as unknown as ConstructorParameters<typeof KyselyDocumentView>[0],
      operationStore,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
      DeletedDocumentRead.NotFound,
    );
    await documentView.init();

    const created = await executor.executeJob(
      loadJob(
        "document",
        history.document!.filter((op) => op.action.type !== "DELETE_DOCUMENT"),
      ),
    );
    expect(created.success).toBe(true);
  });

  afterEach(async () => {
    if (lockClient) {
      await lockClient.query("ROLLBACK").catch(() => undefined);
      lockClient.release();
      lockClient = undefined;
    }
    await sql`DROP SCHEMA IF EXISTS ${sql.id(schema)} CASCADE`.execute(baseDb);
    await baseDb.destroy();
  });

  function loadJob(scopeName: string, operations = history[scopeName]!) {
    return createTestJob({
      kind: "load",
      documentId: "raced",
      scope: scopeName,
      actions: [],
      operations,
    });
  }

  async function waitingAdvisoryLocks(): Promise<number> {
    const result = await sql<{
      n: string;
    }>`select count(*) as n from pg_locks where locktype = 'advisory' and not granted`.execute(
      baseDb,
    );
    return Number(result.rows[0]!.n);
  }

  function settled<T>(promise: Promise<T>): () => boolean {
    let done = false;
    void promise.finally(() => {
      done = true;
    });
    return () => done;
  }

  it("a load holding its transaction makes the purge wait, and the purge removes what it wrote", async () => {
    let release!: () => void;
    scope.hold = new Promise<void>((resolve) => (release = resolve));
    const reached = new Promise<void>((resolve) => (scope.reached = resolve));

    const load = executor.executeJob(loadJob("global"));
    await Promise.race([
      reached,
      load.then((result) => {
        throw new Error(`load ended before the hold: ${result.error?.message}`);
      }),
    ]);

    const purge = new KyselyDocumentPurger(db).purge(["raced"], {
      directiveId: "race",
    });
    const purgeDone = settled(purge);
    await vi.waitUntil(async () => (await waitingAdvisoryLocks()) >= 1, {
      timeout: 5_000,
    });
    expect(purgeDone()).toBe(false);

    scope.hold = undefined;
    release();
    const loaded: JobResult = await load;
    const purged: PurgeRows = await purge;

    expect(loaded.success).toBe(true);
    expect(purged.purged).toEqual(["raced"]);
    expect(await rowsAbout(db, "raced")).toEqual(emptyRows());

    // Its write-ready lands after the purge: guards drop it, the sweep nets it.
    for (const payload of writeReady) {
      await documentView.indexOperations(payload);
    }
    await new KyselyDocumentPurger(db).sweep(["raced"]);
    expect(await rowsAbout(db, "raced")).toEqual(emptyRows());
  });

  it("a purge holding the lock refuses the load that queued behind it", async () => {
    // Stands in for an earlier admitted job, so the purge is caught mid-flight.
    lockClient = await pool.connect();
    await lockClient.query("BEGIN");
    await lockClient.query(
      `select pg_advisory_xact_lock_shared(hashtext('purge:raced'))`,
    );

    const purge = new KyselyDocumentPurger(db).purge(["raced"], {
      directiveId: "race",
    });
    await vi.waitUntil(async () => (await waitingAdvisoryLocks()) >= 1, {
      timeout: 5_000,
    });

    const load = executor.executeJob(loadJob("global"));
    const loadDone = settled(load);
    await vi.waitUntil(async () => (await waitingAdvisoryLocks()) >= 2, {
      timeout: 5_000,
    });
    expect(loadDone()).toBe(false);

    await lockClient.query("COMMIT");
    lockClient.release();
    lockClient = undefined;

    const purged = await purge;
    const loaded = await load;

    expect(purged.purged).toEqual(["raced"]);
    expect(loaded.success).toBe(false);
    expect(loaded.error?.name).toBe("DocumentPurgedError");
    expect(writeReady.slice(1)).toEqual([]);
    expect(await rowsAbout(db, "raced")).toEqual(emptyRows());
  });
});
