import { PGlite } from "@electric-sql/pglite";
import {
  generateId,
  type Action,
  type OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../src/cache/kysely-operation-index.js";
import type { OperationIndexEntry } from "../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../src/cache/write/interfaces.js";
import { CatchUpScheduler } from "../../src/catch-up/scheduler.js";
import {
  createKyselyWatermarkProbe,
  SettledWatermark,
} from "../../src/catch-up/settled-watermark.js";
import { defaultCatchUpConfig } from "../../src/catch-up/types.js";
import type { Database } from "../../src/core/types.js";
import { EventBus } from "../../src/events/event-bus.js";
import {
  ReactorEventTypes,
  type JobWriteReadyEvent,
} from "../../src/events/types.js";
import { ReadModelCoordinator } from "../../src/read-models/coordinator.js";
import type { IReadModel } from "../../src/read-models/interfaces.js";
import {
  DeletedDocumentRead,
  KyselyDocumentView,
} from "../../src/read-models/document-view.js";
import { ConsistencyTracker } from "../../src/shared/consistency-tracker.js";
import {
  KyselyDocumentIndexer,
  type IndexerDatabase,
} from "../../src/storage/kysely/document-indexer.js";
import { KyselyOperationStore } from "../../src/storage/kysely/store.js";
import { deferred } from "../factories.js";
import type { Database as StorageDatabase } from "../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../src/storage/migrations/migrator.js";

const BRANCH = "main";

function item(
  documentId: string,
  scope: string,
  index: number,
  ordinal: number,
  action: Partial<Action>,
  resultingState: Record<string, unknown>,
): OperationWithContext {
  return {
    operation: {
      id: generateId(),
      index,
      skip: 0,
      hash: `hash-${ordinal}`,
      timestampUtcMs: new Date(1_700_000_000_000 + ordinal).toISOString(),
      action: {
        id: generateId(),
        scope,
        timestampUtcMs: new Date(1_700_000_000_000 + ordinal).toISOString(),
        input: {},
        ...action,
      } as Action,
    },
    context: {
      documentId,
      documentType: "powerhouse/document-model",
      scope,
      branch: BRANCH,
      ordinal,
      resultingState: JSON.stringify(resultingState),
    },
  };
}

function relationship(type: string, index: number): OperationIndexEntry {
  const actionId = generateId();
  return {
    id: generateId(),
    documentId: "parent",
    documentType: "powerhouse/document-model",
    scope: "document",
    branch: BRANCH,
    sourceRemote: "",
    index,
    timestampUtcMs: "1700000000000",
    hash: `hash-${index}`,
    skip: 0,
    action: {
      id: actionId,
      type,
      scope: "document",
      timestampUtcMs: "1700000000000",
      input: {
        sourceId: "parent",
        targetId: "child",
        relationshipType: "child",
      },
    },
  };
}

/** Holds the chain on its first batch, as a slow sibling model does. */
function gateModel() {
  const reached = deferred<void>();
  const opened = deferred<void>();
  let first = true;
  const model: IReadModel = {
    name: "gate",
    indexOperations: () => {
      if (!first) return Promise.resolve();
      first = false;
      reached.resolve();
      return opened.promise;
    },
  };
  return { model, reached: reached.promise, open: () => opened.resolve() };
}

/** Holds a chunk carrying one action type before its transaction opens. */
class HeldIndexer extends KyselyDocumentIndexer {
  readonly commits: number[][] = [];
  hold: { type: string; reached: () => void; until: Promise<void> } | undefined;
  failType: string | undefined;

  protected override async commitFenced(
    items: OperationWithContext[],
  ): Promise<void> {
    const ordinals = items.map((item) => item.context.ordinal);
    const failType = this.failType;
    if (items.some((item) => item.operation.action.type === failType)) {
      this.failType = undefined;
      throw new Error(`${failType} failed`);
    }
    const hold = this.hold;
    if (
      hold &&
      items.some((item) => item.operation.action.type === hold.type)
    ) {
      this.hold = undefined;
      hold.reached();
      await hold.until;
    }
    await super.commitFenced(items);
    this.commits.push(ordinals);
  }
}

describe("catch-up duplicate guards", () => {
  let baseDb: Kysely<Database>;
  let db: Kysely<Database>;
  let operationIndex: KyselyOperationIndex;
  let writeCache: IWriteCache;

  beforeEach(async () => {
    baseDb = new Kysely<Database>({ dialect: new PGliteDialect(new PGlite()) });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) throw result.error;
    db = baseDb.withSchema(REACTOR_SCHEMA);
    operationIndex = new KyselyOperationIndex(
      db as unknown as Kysely<StorageDatabase>,
    );
    writeCache = {
      getState: vi.fn().mockResolvedValue({}),
    } as unknown as IWriteCache;
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  async function writeBatch(
    eventBus: EventBus,
    entry: OperationIndexEntry,
    emit = true,
  ): Promise<number> {
    const txn = operationIndex.start();
    txn.write([entry]);
    const ordinals = await operationIndex.commit(txn);
    if (emit) {
      const operations = await operationIndex.getByOrdinals(ordinals);
      const event: JobWriteReadyEvent = {
        jobId: generateId(),
        operations,
        jobMeta: { batchId: generateId(), batchJobIds: [] },
      };
      await eventBus.emit(ReactorEventTypes.JOB_WRITE_READY, event);
    }
    return ordinals[0]!;
  }

  function makeView(): KyselyDocumentView {
    return new KyselyDocumentView(
      db as never,
      new KyselyOperationStore(db as unknown as Kysely<StorageDatabase>),
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
      DeletedDocumentRead.NotFound,
    );
  }

  async function snapshot(documentId: string, scope: string) {
    return db
      .selectFrom("DocumentSnapshot")
      .selectAll()
      .where("documentId", "=", documentId)
      .where("scope", "=", scope)
      .executeTakeFirst();
  }

  const header = (documentId: string) => ({
    id: documentId,
    documentType: "powerhouse/document-model",
    slug: documentId,
    name: "doc",
  });

  it("never rolls a scope back for an older duplicate", async () => {
    const view = makeView();
    await view.init();
    const documentId = generateId();

    await view.indexOperations([
      item(
        documentId,
        "global",
        1,
        2,
        { type: "SET" },
        {
          header: header(documentId),
          global: { count: 2 },
        },
      ),
    ]);
    await view.indexOperations([
      item(
        documentId,
        "global",
        0,
        1,
        { type: "SET" },
        {
          header: header(documentId),
          global: { count: 1 },
        },
      ),
    ]);

    const row = await snapshot(documentId, "global");
    expect(row?.content).toEqual({ count: 2 });
    expect(row?.lastOperationOrdinal).toBe(2);
    expect(row?.lastOperationIndex).toBe(1);
  });

  it("keeps a document deleted when an older operation is replayed", async () => {
    const view = makeView();
    await view.init();
    const documentId = generateId();
    const created = { header: header(documentId), document: {} };

    await view.indexOperations([
      item(documentId, "document", 0, 1, { type: "CREATE_DOCUMENT" }, created),
      item(
        documentId,
        "document",
        2,
        3,
        { type: "DELETE_DOCUMENT" },
        {
          ...created,
          document: { isDeleted: true },
        },
      ),
    ]);
    await view.indexOperations([
      item(
        documentId,
        "document",
        1,
        2,
        { type: "SET" },
        {
          header: header(documentId),
          document: { touched: true },
        },
      ),
    ]);

    const row = await snapshot(documentId, "document");
    expect(row?.isDeleted).toBe(true);
    expect(row?.content).toEqual({ isDeleted: true });
    await expect(view.get(documentId)).rejects.toThrow(/not found/i);
  });

  it("writes a swept operation's scope state as the live path would", async () => {
    const documentId = generateId();
    vi.mocked(writeCache.getState).mockResolvedValue({
      header: header(documentId),
      state: { global: { count: 7 }, document: {} },
    } as never);
    const view = makeView();
    const watermark = new SettledWatermark(
      createKyselyWatermarkProbe(db as unknown as Kysely<StorageDatabase>),
      new ConsoleLogger(["test"]),
    );
    view.attachCatchUp(watermark, 100_000);
    await view.init();

    const txn = operationIndex.start();
    txn.write([
      {
        id: generateId(),
        documentId,
        documentType: "powerhouse/document-model",
        scope: "global",
        branch: BRANCH,
        sourceRemote: "",
        index: 0,
        timestampUtcMs: "1700000000000",
        hash: "hash-0",
        skip: 0,
        action: {
          id: generateId(),
          type: "SET",
          scope: "global",
          timestampUtcMs: "1700000000000",
          input: {},
        },
      },
    ]);
    await operationIndex.commit(txn);

    const settled = await watermark.refresh();
    await view.sweep(
      settled,
      await operationIndex.getOrdinalsInRange(0, settled, 10),
    );

    expect((await snapshot(documentId, "global"))?.content).toEqual({
      count: 7,
    });
  });

  it("keeps a relationship removed when the add is swept after the remove", async () => {
    const indexer = new KyselyDocumentIndexer(
      db as unknown as Kysely<IndexerDatabase>,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
    );
    const watermark = new SettledWatermark(
      createKyselyWatermarkProbe(db as unknown as Kysely<StorageDatabase>),
      new ConsoleLogger(["test"]),
    );
    indexer.attachCatchUp(watermark, 100_000);
    await indexer.init();

    const txn = operationIndex.start();
    txn.write([
      relationship("ADD_RELATIONSHIP", 0),
      relationship("REMOVE_RELATIONSHIP", 1),
    ]);
    const [, removeOrdinal] = await operationIndex.commit(txn);
    const [remove] = await operationIndex.getByOrdinals([removeOrdinal!]);

    await indexer.indexOperations([remove!]);
    const settled = await watermark.refresh();
    const present = await operationIndex.getOrdinalsInRange(0, settled, 10);
    const result = await indexer.sweep(settled, present);

    expect(result).toMatchObject({ replayed: 1, reapplied: 1 });
    const outgoing = await indexer.getOutgoing("parent", ["child"]);
    expect(outgoing.results).toEqual([]);
  });

  it("does not sweep a batch queued behind its stream's live batch", async () => {
    const indexer = new HeldIndexer(
      db as unknown as Kysely<IndexerDatabase>,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
    );
    const watermark = new SettledWatermark(
      createKyselyWatermarkProbe(db as unknown as Kysely<StorageDatabase>),
      new ConsoleLogger(["test"]),
    );
    indexer.attachCatchUp(watermark, 100_000);
    await indexer.init();

    const eventBus = new EventBus();
    const coordinator = new ReadModelCoordinator(eventBus, [indexer], []);
    coordinator.start();
    const scheduler = new CatchUpScheduler(
      watermark,
      operationIndex,
      defaultCatchUpConfig,
      new ConsoleLogger(["test"]),
    );
    scheduler.addConsumer(indexer, "host");

    const reached = deferred<void>();
    const release = deferred<void>();
    indexer.hold = {
      type: "ADD_RELATIONSHIP",
      reached: () => reached.resolve(),
      until: release.promise,
    };
    const add = await writeBatch(eventBus, relationship("ADD_RELATIONSHIP", 0));
    await reached.promise;
    const remove = await writeBatch(
      eventBus,
      relationship("REMOVE_RELATIONSHIP", 1),
    );

    await scheduler.sweepNow();
    release.resolve();
    await coordinator.drain();
    await scheduler.sweepNow();
    await scheduler.stop();

    expect(indexer.commits).toEqual([[add], [remove]]);
    const outgoing = await indexer.getOutgoing("parent", ["child"]);
    expect(outgoing.results).toEqual([]);
    expect(indexer.appliedThrough).toBe(remove);
  });

  async function chainedIndexer(tracker = new ConsistencyTracker()) {
    const indexer = new HeldIndexer(
      db as unknown as Kysely<IndexerDatabase>,
      operationIndex,
      writeCache,
      tracker,
    );
    const watermark = new SettledWatermark(
      createKyselyWatermarkProbe(db as unknown as Kysely<StorageDatabase>),
      new ConsoleLogger(["test"]),
    );
    indexer.attachCatchUp(watermark, 100_000);
    await indexer.init();

    const eventBus = new EventBus();
    const gate = gateModel();
    const coordinator = new ReadModelCoordinator(
      eventBus,
      [gate.model, indexer],
      [],
    );
    coordinator.start();
    const scheduler = new CatchUpScheduler(
      watermark,
      operationIndex,
      defaultCatchUpConfig,
      new ConsoleLogger(["test"]),
    );
    scheduler.addConsumer(indexer, "host");
    return { indexer, eventBus, gate, coordinator, scheduler };
  }

  const firstEdit = [
    {
      documentId: "parent",
      scope: "document",
      branch: BRANCH,
      operationIndex: 0,
    },
  ];

  it("leaves a batch queued behind a slower model to its live pass", async () => {
    const tracker = new ConsistencyTracker();
    const { indexer, eventBus, gate, coordinator, scheduler } =
      await chainedIndexer(tracker);

    const add = await writeBatch(eventBus, relationship("ADD_RELATIONSHIP", 0));
    await gate.reached;
    await tracker.waitFor(firstEdit);
    const remove = await writeBatch(
      eventBus,
      relationship("REMOVE_RELATIONSHIP", 1),
    );

    const [swept] = await scheduler.sweepNow();
    gate.open();
    await coordinator.drain();
    await scheduler.sweepNow();
    await scheduler.stop();

    expect(swept).toMatchObject({ replayed: 0, reapplied: 0 });
    expect(indexer.commits).toEqual([[add], [remove]]);
    expect(indexer.appliedThrough).toBe(remove);
  });

  it("keeps a stream in order when its batches queue behind a slower model", async () => {
    const tracker = new ConsistencyTracker();
    const { indexer, eventBus, gate, coordinator, scheduler } =
      await chainedIndexer(tracker);

    const add = await writeBatch(eventBus, relationship("ADD_RELATIONSHIP", 0));
    await gate.reached;
    await tracker.waitFor(firstEdit);
    const remove = await writeBatch(
      eventBus,
      relationship("REMOVE_RELATIONSHIP", 1),
    );

    const reached = deferred<void>();
    const release = deferred<void>();
    indexer.hold = {
      type: "REMOVE_RELATIONSHIP",
      reached: () => reached.resolve(),
      until: release.promise,
    };
    const sweeping = scheduler.sweepNow();
    const sweepHeld = await Promise.race([
      reached.promise.then(() => true),
      sweeping.then(() => false),
    ]);
    gate.open();
    const readd = await writeBatch(
      eventBus,
      relationship("ADD_RELATIONSHIP", 2),
    );
    // A sweep holding the remove leaves the chain free to apply the re-add.
    if (sweepHeld) await coordinator.drain();
    release.resolve();
    await sweeping;
    await coordinator.drain();
    await scheduler.stop();

    expect(indexer.commits).toEqual([[add], [remove], [readd]]);
    const outgoing = await indexer.getOutgoing("parent", ["child"]);
    expect(outgoing.results).toHaveLength(1);
  });

  it("does not sweep a lost batch ahead of one queued behind a slower model", async () => {
    const tracker = new ConsistencyTracker();
    const { indexer, eventBus, gate, coordinator, scheduler } =
      await chainedIndexer(tracker);

    const add = await writeBatch(eventBus, relationship("ADD_RELATIONSHIP", 0));
    await gate.reached;
    await tracker.waitFor(firstEdit);
    const remove = await writeBatch(
      eventBus,
      relationship("REMOVE_RELATIONSHIP", 1),
    );
    const lost = await writeBatch(
      eventBus,
      relationship("ADD_RELATIONSHIP", 2),
      false,
    );

    await scheduler.sweepNow();
    gate.open();
    await coordinator.drain();
    await scheduler.sweepNow();
    await scheduler.stop();

    expect(indexer.commits.flat()).toEqual([add, remove, lost]);
    const outgoing = await indexer.getOutgoing("parent", ["child"]);
    expect(outgoing.results).toHaveLength(1);
    expect(indexer.appliedThrough).toBe(lost);
  });

  it("sweeps a queued batch whose live pass failed", async () => {
    const { indexer, eventBus, gate, coordinator, scheduler } =
      await chainedIndexer();

    indexer.failType = "ADD_RELATIONSHIP";
    const add = await writeBatch(eventBus, relationship("ADD_RELATIONSHIP", 0));
    await gate.reached;
    gate.open();
    await coordinator.drain();
    const [swept] = await scheduler.sweepNow();
    await scheduler.stop();

    expect(swept).toMatchObject({ replayed: 1 });
    expect(indexer.commits).toEqual([[add]]);
    expect(indexer.appliedThrough).toBe(add);
  });
});
