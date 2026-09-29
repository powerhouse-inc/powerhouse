import { generateId } from "@powerhousedao/shared/document-model";
import type { Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import { KyselyWriteCache } from "../../../src/cache/kysely-write-cache.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import { rescanCatchUp } from "../../../src/admin/catch-up-admin.js";
import { EventBus } from "../../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../../src/events/types.js";
import type { BaseReadModel } from "../../../src/read-models/base-read-model.js";
import { ReadModelCoordinator } from "../../../src/read-models/coordinator.js";
import {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "../../../src/read-models/document-view.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import { DocumentNotFoundError } from "../../../src/shared/errors.js";
import { DocumentExistence } from "../../../src/storage/interfaces.js";
import { KyselyDocumentIndexer } from "../../../src/storage/kysely/document-indexer.js";
import { acquirePurgeLocks } from "../../../src/storage/kysely/document-purges.js";
import type { KyselyKeyframeStore } from "../../../src/storage/kysely/keyframe-store.js";
import type { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import {
  createTestOperationStorePostgres,
  createTestRegistry,
  deferred,
} from "../../factories.js";
import {
  purgeMarker,
  seedPurgedDocument,
  seedTombstone,
  writeMarkerOperation,
} from "../helpers.js";
import {
  addRelationshipEntry,
  commitEntries,
  createEntry,
  deleteDocumentRows,
  entry,
  expectNoRowsFor,
  purgeInTransaction,
  rowsFor,
  stubWriteCache,
  sweepToHead,
  waitForPurgeLock,
  writeReadyItems,
} from "./helpers.js";

describe("read models under the purge fence [Postgres]", () => {
  let db: Kysely<Database>;
  let store: KyselyOperationStore;
  let keyframeStore: KyselyKeyframeStore;
  let index: KyselyOperationIndex;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const setup = await createTestOperationStorePostgres();
    db = setup.db;
    store = setup.store;
    keyframeStore = setup.keyframeStore;
    index = new KyselyOperationIndex(db);
    cleanup = setup.cleanup;
  });

  afterEach(async () => {
    await cleanup();
  });

  function makeView(writeCache: IWriteCache = stubWriteCache()) {
    return new KyselyDocumentView(
      db as never,
      store,
      index,
      writeCache,
      new ConsistencyTracker(),
      DeletedDocumentRead.NotFound,
    );
  }

  function makeIndexer(writeCache: IWriteCache = stubWriteCache()) {
    return new KyselyDocumentIndexer(
      db as never,
      index,
      writeCache,
      new ConsistencyTracker(),
    );
  }

  /** Stands in for the purger: the id's rows go, the marker is its stream. */
  async function purge(documentId: string): Promise<number> {
    await deleteDocumentRows(db, documentId);
    return seedPurgedDocument({ db, store, index }, purgeMarker(documentId));
  }

  function getStateCallsFor(writeCache: IWriteCache, documentId: string) {
    return vi
      .mocked(writeCache.getState)
      .mock.calls.filter(([id]) => id === documentId);
  }

  async function snapshotCount(documentId: string): Promise<number> {
    return (await rowsFor(db, documentId)).DocumentSnapshot;
  }

  it("a view commit waiting on a purge commits after it and inserts nothing", async () => {
    const id = generateId();
    const view = makeView();
    await view.init();
    const items = await writeReadyItems(
      index,
      await commitEntries(index, [createEntry(id)]),
    );

    const locked = deferred();
    const release = deferred();
    const purging = db.transaction().execute(async (trx) => {
      await acquirePurgeLocks(trx, [id], "exclusive");
      locked.resolve();
      await release.promise;
      await deleteDocumentRows(trx, id);
      await seedTombstone(trx, id, 0);
    });
    await locked.promise;

    const indexing = view.indexOperations(items);
    try {
      await waitForPurgeLock(db, id, "ShareLock", false);
    } finally {
      release.resolve();
      await purging;
      await indexing;
    }

    await expectNoRowsFor(db, id);
  });

  it("a view commit holding its lock first is purged once it commits", async () => {
    const other = generateId();
    const id = generateId();
    const view = makeView();
    await view.init();
    await view.indexOperations(
      await writeReadyItems(
        index,
        await commitEntries(index, [createEntry(other)]),
      ),
    );
    const items = await writeReadyItems(
      index,
      await commitEntries(index, [
        entry(other, 0, "SET_NAME", { name: "renamed" }, "global"),
        createEntry(id),
      ]),
    );

    const rowLocked = deferred();
    const releaseRow = deferred();
    const holdingRow = db.transaction().execute(async (trx) => {
      await (trx as unknown as Kysely<any>)
        .selectFrom("DocumentSnapshot")
        .select("id")
        .where("documentId", "=", other)
        .forUpdate()
        .execute();
      rowLocked.resolve();
      await releaseRow.promise;
    });
    await rowLocked.promise;

    const indexing = view.indexOperations(items);
    let purging: Promise<void> | undefined;
    try {
      await waitForPurgeLock(db, id, "ShareLock", true);
      purging = db.transaction().execute((trx) => purgeInTransaction(trx, id));
      await waitForPurgeLock(db, id, "ExclusiveLock", false);
    } finally {
      releaseRow.resolve();
      await holdingRow;
      await indexing;
      await purging;
    }

    await expectNoRowsFor(db, id);
    expect(await snapshotCount(other)).toBeGreaterThan(0);
  });

  it("a JOB_WRITE_READY delivered after the tombstone inserts nothing in view or indexer", async () => {
    const id = generateId();
    const idChild = generateId();
    const drive = generateId();
    const purgedChild = generateId();
    const liveChild = generateId();
    const view = makeView();
    const indexer = makeIndexer();
    await view.init();
    await indexer.init();
    await purge(purgedChild);

    const operations = await writeReadyItems(
      index,
      await commitEntries(index, [
        createEntry(id),
        addRelationshipEntry(id, 1, idChild),
        createEntry(drive),
        addRelationshipEntry(drive, 1, purgedChild),
        addRelationshipEntry(drive, 2, liveChild),
      ]),
    );
    await db.transaction().execute((trx) => purgeInTransaction(trx, id));

    const bus = new EventBus();
    const coordinator = new ReadModelCoordinator(bus, [view, indexer], []);
    coordinator.start();
    const event: JobWriteReadyEvent = {
      jobId: generateId(),
      operations,
      jobMeta: { batchId: generateId(), batchJobIds: [] },
    };
    await bus.emit(ReactorEventTypes.JOB_WRITE_READY, event);
    await coordinator.drain();
    coordinator.stop();

    await expectNoRowsFor(db, id);
    expect(await rowsFor(db, idChild)).toMatchObject({ Document: 0 });
    await expectNoRowsFor(db, purgedChild);
    expect(await snapshotCount(drive)).toBeGreaterThan(0);
    expect(await indexer.hasRelationship(drive, liveChild, ["child"])).toBe(
      true,
    );
  });

  for (const kind of ["view", "indexer"] as const) {
    it(`a ${kind} sweep that fetched the id's operations before the tombstone inserts nothing`, async () => {
      const id = generateId();
      const child = generateId();
      const model: BaseReadModel = kind === "view" ? makeView() : makeIndexer();
      await model.init();
      const ordinals = await commitEntries(index, [
        createEntry(id),
        addRelationshipEntry(id, 1, child),
      ]);

      const getByOrdinals = index.getByOrdinals.bind(index);
      vi.spyOn(index, "getByOrdinals").mockImplementationOnce(
        async (...args) => {
          const fetched = await getByOrdinals(...args);
          await db.transaction().execute((trx) => purgeInTransaction(trx, id));
          return fetched;
        },
      );

      const result = await sweepToHead(model, db, index);

      expect(result.blockedAt).toBeUndefined();
      expect(model.appliedThrough).toBeGreaterThanOrEqual(
        Math.max(...ordinals),
      );
      await expectNoRowsFor(db, id);
      expect(await rowsFor(db, child)).toMatchObject({ Document: 0 });
    });
  }

  it("an indexer sweep replaying a drive's suffix skips the relationship to a purged child", async () => {
    const drive = generateId();
    const purgedChild = generateId();
    const liveChild = generateId();
    const indexer = makeIndexer();
    await indexer.init();

    const [first, ...rest] = await commitEntries(index, [
      createEntry(drive),
      addRelationshipEntry(drive, 1, purgedChild),
      addRelationshipEntry(drive, 2, liveChild),
    ]);
    await purge(purgedChild);
    await indexer.indexOperations(await index.getByOrdinals(rest));

    const result = await sweepToHead(indexer, db, index);

    expect(first).toBeDefined();
    expect(result.blockedAt).toBeUndefined();
    expect(result.reapplied).toBeGreaterThan(0);
    await expectNoRowsFor(db, purgedChild);
    expect(await indexer.hasRelationship(drive, liveChild, ["child"])).toBe(
      true,
    );
    const head = await index.getOrdinalsInRange(0, 2 ** 31 - 1, 1000);
    expect(indexer.appliedThrough).toBe(Math.max(...head));
  });

  it("a rescan from 0 after a purge writes no rows for the id and does not block", async () => {
    const drive = generateId();
    const id = generateId();
    const child = generateId();
    const writeCache = stubWriteCache();
    const view = makeView(writeCache);
    const indexer = makeIndexer(writeCache);
    await view.init();
    await indexer.init();

    const ordinals = await commitEntries(index, [
      createEntry(drive),
      createEntry(id),
      addRelationshipEntry(drive, 1, id),
      addRelationshipEntry(id, 1, child),
    ]);
    for (const model of [view, indexer]) {
      await model.indexOperations(await writeReadyItems(index, ordinals));
      await sweepToHead(model, db, index);
    }
    expect(await snapshotCount(id)).toBeGreaterThan(0);
    expect(await indexer.hasRelationship(drive, id)).toBe(true);

    await purge(id);
    await rescanCatchUp(db as never, {
      from: 0,
      consumers: [view.consumerId, indexer.consumerId],
      all: false,
      dryRun: false,
    });
    await commitEntries(index, [createEntry(generateId())]);
    vi.mocked(writeCache.getState).mockClear();

    for (const model of [view, indexer]) {
      await sweepToHead(model, db, index);
      const result = await sweepToHead(model, db, index);
      expect(result.blockedAt).toBeUndefined();
      expect(result.from).toBe(0);
      const head = await index.getOrdinalsInRange(0, 2 ** 31 - 1, 1000);
      expect(model.appliedThrough).toBe(Math.max(...head));
    }

    await expectNoRowsFor(db, id);
    expect(getStateCallsFor(writeCache, id)).toEqual([]);
    expect(await snapshotCount(drive)).toBeGreaterThan(0);
  });

  it("boot replay applies a marker above the cursor without error or rows", async () => {
    const live = generateId();
    const id = generateId();
    for (const model of [makeView(), makeIndexer()]) {
      await model.init();
    }
    await commitEntries(index, [createEntry(live)]);
    for (const model of [makeView(), makeIndexer()]) {
      await model.init();
      await sweepToHead(model, db, index);
    }

    const markerOrdinal = await purge(id);
    const writeCache = stubWriteCache();
    for (const model of [makeView(writeCache), makeIndexer(writeCache)]) {
      await model.init();
      expect(model.appliedThrough).toBe(markerOrdinal);
    }

    await expectNoRowsFor(db, id);
    expect(getStateCallsFor(writeCache, id)).toEqual([]);
  });

  it("a marker delivered live twice, then by boot replay, is a no-op", async () => {
    const id = generateId();
    await makeView().init();
    await makeIndexer().init();
    const markerOrdinal = await purge(id);
    const [marker] = await index.getByOrdinals([markerOrdinal]);

    for (const model of [makeView(), makeIndexer()]) {
      await model.init();
      await model.indexOperations([marker!]);
      await model.indexOperations([marker!]);
      const result = await sweepToHead(model, db, index);
      expect(result.blockedAt).toBeUndefined();
      expect(model.appliedThrough).toBe(markerOrdinal);
    }
    await rescanCatchUp(db as never, {
      from: 0,
      consumers: [],
      all: true,
      dryRun: false,
    });
    for (const model of [makeView(), makeIndexer()]) {
      await model.init();
      expect(model.appliedThrough).toBe(markerOrdinal);
    }

    await expectNoRowsFor(db, id);
  });

  it("the view reads a purged id as absent and as taken", async () => {
    const id = generateId();
    const view = makeView();
    await view.init();
    await purge(id);
    await sweepToHead(view, db, index);

    await expect(view.get(id)).rejects.toSatisfy(DocumentNotFoundError.isError);
    await expect(view.resolveIdOrSlug(id)).rejects.toSatisfy(
      DocumentNotFoundError.isError,
    );
    expect(await view.exists([id], DocumentExistence.IncludingDeleted)).toEqual(
      [true],
    );
    expect(await view.exists([id], DocumentExistence.LiveOnly)).toEqual([
      false,
    ]);
  });

  it("a sweep rebuilding a purged stream's operation settles it as absent", async () => {
    const id = generateId();
    const live = generateId();
    const writeCache = stubWriteCache(new Set([id]));
    const view = makeView(writeCache);
    await view.init();
    await commitEntries(index, [createEntry(id), createEntry(live)]);
    await seedTombstone(db, id, 0);

    const result = await sweepToHead(view, db, index);

    expect(result.blockedAt).toBeUndefined();
    expect(getStateCallsFor(writeCache, id).length).toBeGreaterThan(0);
    expect(await snapshotCount(id)).toBe(0);
    expect(await snapshotCount(live)).toBeGreaterThan(0);
  });

  // Green through the tombstone fallback until Track B's getState throws.
  it("a sweep rebuilding through the write cache settles a purged stream as absent", async () => {
    const id = generateId();
    const writeCache = new KyselyWriteCache(
      keyframeStore,
      store,
      createTestRegistry(),
      { maxDocuments: 10, ringBufferSize: 5, keyframeInterval: 100 },
    );
    await writeCache.startup();
    const view = makeView(writeCache);
    await view.init();
    const [stale] = await commitEntries(index, [
      entry(id, 0, "SET_NAME", { name: "stale" }, "global"),
    ]);
    await writeMarkerOperation(store, purgeMarker(id));
    await seedTombstone(db, id, 0);

    const result = await sweepToHead(view, db, index);

    expect(result.blockedAt).toBeUndefined();
    expect(view.appliedThrough).toBeGreaterThanOrEqual(stale!);
    expect(await rowsFor(db, id)).toMatchObject({
      DocumentSnapshot: 0,
      SlugMapping: 0,
    });
  });
});
