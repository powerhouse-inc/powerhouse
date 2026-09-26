import { PGlite } from "@electric-sql/pglite";
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import { ConsoleLogger } from "document-model";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import {
  createKyselyWatermarkProbe,
  SettledWatermark,
} from "../../../src/catch-up/settled-watermark.js";
import {
  BaseReadModel,
  type BaseReadModelConfig,
} from "../../../src/read-models/base-read-model.js";
import type { DocumentViewDatabase } from "../../../src/read-models/types.js";
import { ConsistencyTracker } from "../../../src/shared/consistency-tracker.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";
import { deferred } from "../../factories.js";
import { indexEntry } from "../../catch-up/helpers.js";

type Database = StorageDatabase & DocumentViewDatabase;

const READ_MODEL_ID = "catch-up-model";

/** Records each commit's ordinals; can refuse one ordinal or hold one open. */
class RecordingModel extends BaseReadModel {
  readonly commits: number[][] = [];
  failOn = 0;
  hold: { ordinal: number; until: Promise<void> } | undefined;
  onCommit: (items: OperationWithContext[]) => Promise<void> = () =>
    Promise.resolve();

  protected override async commitOperations(
    items: OperationWithContext[],
  ): Promise<void> {
    const ordinals = items.map((item) => item.context.ordinal);
    await this.onCommit(items);
    if (this.hold && ordinals.includes(this.hold.ordinal)) {
      await this.hold.until;
    }
    if (this.failOn > 0 && ordinals.includes(this.failOn)) {
      throw new Error(`refused ${this.failOn}`);
    }
    this.commits.push(ordinals);
  }
}

describe("BaseReadModel catch-up", () => {
  let baseDb: Kysely<Database>;
  let db: Kysely<Database>;
  let operationIndex: KyselyOperationIndex;
  let watermark: SettledWatermark;
  let writeCache: IWriteCache;

  beforeEach(async () => {
    baseDb = new Kysely<Database>({ dialect: new PGliteDialect(new PGlite()) });
    const result = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!result.success && result.error) throw result.error;
    db = baseDb.withSchema(REACTOR_SCHEMA);
    operationIndex = new KyselyOperationIndex(
      db as unknown as Kysely<StorageDatabase>,
    );
    watermark = new SettledWatermark(
      createKyselyWatermarkProbe(db as unknown as Kysely<StorageDatabase>),
      new ConsoleLogger(["test"]),
    );
    writeCache = {
      getState: vi.fn().mockResolvedValue({}),
    } as unknown as IWriteCache;
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  function makeModel(
    config: Partial<BaseReadModelConfig> = {},
  ): RecordingModel {
    const model = new RecordingModel(
      db as unknown as Kysely<DocumentViewDatabase>,
      operationIndex,
      writeCache,
      new ConsistencyTracker(),
      { readModelId: READ_MODEL_ID, rebuildStateOnInit: false, ...config },
    );
    model.attachCatchUp(watermark, 100_000);
    return model;
  }

  /** Commits one index row per entry and returns them as delivered live. */
  async function commit(
    ...entries: Array<[documentId: string, index: number]>
  ): Promise<OperationWithContext[]> {
    const txn = operationIndex.start();
    txn.write(
      entries.map(([documentId, index]) => indexEntry(documentId, index)),
    );
    const ordinals = await operationIndex.commit(txn);
    return operationIndex.getByOrdinals(ordinals);
  }

  async function sweep(model: BaseReadModel) {
    const settled = await watermark.refresh();
    const present = await operationIndex.getOrdinalsInRange(
      model.appliedThrough,
      settled,
      100_000,
    );
    return model.sweep(settled, present);
  }

  async function storedCursor(): Promise<number | undefined> {
    const row = await db
      .selectFrom("ViewState")
      .select("lastOrdinal")
      .where("readModelId", "=", READ_MODEL_ID)
      .executeTakeFirst();
    return row?.lastOrdinal;
  }

  it("applies a late operation with the later operations of its stream in one transaction", async () => {
    const model = makeModel();
    await model.init();
    const [lost, later, other] = await commit(
      ["doc-d", 0],
      ["doc-d", 1],
      ["doc-e", 0],
    );
    await model.indexOperations([later!, other!]);

    const result = await sweep(model);

    expect(model.commits).toEqual([
      [2, 3],
      [1, 2],
    ]);
    expect(result).toMatchObject({ replayed: 1, reapplied: 1, to: 3 });
    expect(lost!.context.ordinal).toBe(1);
    expect(await storedCursor()).toBe(3);
  });

  it("does not pass an ordinal a live batch holds", async () => {
    const model = makeModel({ replayStreamSuffix: false });
    await model.init();
    const [first, second, third] = await commit(
      ["doc-a", 0],
      ["doc-b", 0],
      ["doc-c", 0],
    );
    await model.indexOperations([first!]);

    const release = deferred<void>();
    model.hold = { ordinal: 2, until: release.promise };
    const live = model.indexOperations([second!]);

    const held = await sweep(model);
    expect(held.to).toBe(1);
    expect(model.commits).toEqual([[1], [3]]);

    release.resolve();
    await live;
    expect(third!.context.ordinal).toBe(3);
    expect((await sweep(model)).to).toBe(3);
  });

  it("retries a failed late operation next tick", async () => {
    const model = makeModel();
    await model.init();
    const [, second] = await commit(["doc-a", 0], ["doc-b", 0]);
    await model.indexOperations([second!]);

    model.failOn = 1;
    const blocked = await sweep(model);
    expect(blocked.blockedAt).toMatchObject({
      ordinal: 1,
      documentId: "doc-a",
    });
    expect(blocked.to).toBe(0);

    model.failOn = 0;
    const retried = await sweep(model);
    expect(retried.blockedAt).toBeUndefined();
    expect(retried.to).toBe(2);
    expect(await storedCursor()).toBe(2);
  });

  it("settles a vanished row as absent", async () => {
    const model = makeModel();
    await model.init();
    const [first, , third] = await commit(
      ["doc-a", 0],
      ["doc-b", 0],
      ["doc-c", 0],
    );
    await model.indexOperations([first!, third!]);

    const settled = await watermark.refresh();
    const present = await operationIndex.getOrdinalsInRange(0, settled, 10);
    await db
      .deleteFrom("operation_index_operations")
      .where("ordinal", "=", 2)
      .execute();

    const result = await model.sweep(settled, present);

    expect(result).toMatchObject({ replayed: 0, to: 3 });
    expect(model.commits).toEqual([[1, 3]]);
  });

  it("moves the cursor page by page in boot replay", async () => {
    const entries: Array<[string, number]> = [];
    for (let i = 0; i < 1200; i++) entries.push(["doc-a", i]);
    await commit(...entries);

    const model = makeModel({
      indexing: { commitChunkSize: 500, yieldDeadlineMs: 0 },
    });
    const seen: Array<[number, number | undefined]> = [];
    model.onCommit = async (items) => {
      seen.push([items[0]!.context.ordinal, await storedCursor()]);
    };

    await model.init();

    expect(seen).toEqual([
      [1, 0],
      [501, 500],
      [1001, 1000],
    ]);
    expect(await storedCursor()).toBe(1200);
  });

  it("starts a head registration at the watermark", async () => {
    await commit(["doc-a", 0], ["doc-a", 1], ["doc-b", 0]);

    const model = makeModel({ startFrom: "head" });
    await model.init();

    expect(model.commits).toEqual([]);
    expect(model.appliedThrough).toBe(3);
    expect(await storedCursor()).toBe(3);
  });

  it("replays from a cursor lowered externally", async () => {
    await commit(
      ["doc-a", 0],
      ["doc-b", 0],
      ["doc-c", 0],
      ["doc-d", 0],
      ["doc-e", 0],
    );
    const model = makeModel();
    await model.init();
    expect(await storedCursor()).toBe(5);
    model.commits.length = 0;

    await db
      .updateTable("ViewState")
      .set({ lastOrdinal: 2 })
      .where("readModelId", "=", READ_MODEL_ID)
      .execute();
    const [sixth] = await commit(["doc-f", 0]);
    await model.indexOperations([sixth!]);

    const lowered = await sweep(model);
    expect(lowered.to).toBe(2);
    expect(await storedCursor()).toBe(2);

    await sweep(model);
    expect(model.commits.flat().sort((a, b) => a - b)).toEqual([3, 4, 5, 6, 6]);
    expect(await storedCursor()).toBe(6);
  });
});
