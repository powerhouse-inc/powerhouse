// The runtime's intake as a read model: it delegates every batch, and only a
// sweep moves the cursor. First registration starts at head.
import type {
  DocumentViewDatabase,
  IConsistencyTracker,
  IOperationIndex,
  ISettledWatermark,
  IWriteCache,
  PagedResults,
} from "@powerhousedao/reactor";
import type { OperationWithContext } from "document-model";
import { sql, type Kysely } from "kysely";
import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import type { WorkflowRuntimeService } from "./service.js";
import {
  WORKFLOW_TRIGGERS_READ_MODEL,
  WORKFLOW_TRIGGERS_READ_MODEL_STAGE,
  WorkflowTriggersReadModel,
} from "./workflow-triggers-read-model.js";

// The reactor's own cursor table, migrated here as the reactor migrates it:
// what the base class reads on init and a sweep updates.
const db = createTestRelationalDb() as unknown as Kysely<DocumentViewDatabase>;

function op(ordinal: number): OperationWithContext {
  return {
    operation: {
      index: ordinal,
      timestampUtcMs: `${ordinal}`,
      action: { type: "SET_TITLE", input: {} },
    },
    context: {
      documentId: `doc-${ordinal}`,
      documentType: "powerhouse/note",
      scope: "global",
      branch: "main",
      ordinal,
    },
  } as unknown as OperationWithContext;
}

async function cursor(): Promise<number | undefined> {
  const row = await db
    .selectFrom("ViewState")
    .select("lastOrdinal")
    .where("readModelId", "=", WORKFLOW_TRIGGERS_READ_MODEL)
    .executeTakeFirst();
  return row?.lastOrdinal;
}

// Pages everything above the ordinal asked for, one array per page, the way
// the reactor's operation index hands a catch-up to a read model.
function pagedIndex(pages: OperationWithContext[][]) {
  return vi.fn((ordinal: number) => {
    const remaining = pages
      .map((page) => page.filter((item) => item.context.ordinal > ordinal))
      .filter((page) => page.length > 0);
    const page = (i: number): PagedResults<OperationWithContext> =>
      ({
        results: i >= remaining.length ? [] : remaining[i],
        next:
          i + 1 < remaining.length
            ? () => Promise.resolve(page(i + 1))
            : undefined,
      }) as unknown as PagedResults<OperationWithContext>;
    return Promise.resolve(page(0));
  });
}

function settledAt(settledThrough: number): ISettledWatermark {
  return {
    settledThrough,
    refresh: () => Promise.resolve(settledThrough),
    onAdvance: () => () => {},
    status: () => ({ head: settledThrough, settledThrough, waitingOn: [] }),
  };
}

function readModel(pages: OperationWithContext[][] = [], settledThrough = 0) {
  const batches: OperationWithContext[][] = [];
  const onOperations = vi.fn((operations: OperationWithContext[]) => {
    batches.push(operations);
    return Promise.resolve();
  });
  const runtime = { onOperations } as unknown as WorkflowRuntimeService;
  const getSinceOrdinal = pagedIndex(pages);
  const stored = pages.flat();
  const getByOrdinals = vi.fn((wanted: readonly number[]) =>
    Promise.resolve(
      stored.filter((item) => wanted.includes(item.context.ordinal)),
    ),
  );
  const getStreamAfter = vi.fn(() => Promise.resolve([]));
  const model = new WorkflowTriggersReadModel(
    db,
    {
      getSinceOrdinal,
      getByOrdinals,
      getStreamAfter,
    } as unknown as IOperationIndex,
    {} as IWriteCache,
    { update: vi.fn(), waitFor: vi.fn() } as unknown as IConsistencyTracker,
    runtime,
  );
  model.attachCatchUp(settledAt(settledThrough), 100_000);
  return { batches, getSinceOrdinal, model, onOperations };
}

const ordinals = (batches: OperationWithContext[][]) =>
  batches.map((batch) => batch.map((item) => item.context.ordinal));

describe("WorkflowTriggersReadModel", () => {
  beforeAll(async () => {
    await db.schema
      .createTable("ViewState")
      .addColumn("readModelId", "text", (col) => col.primaryKey())
      .addColumn("lastOrdinal", "integer", (col) => col.notNull().defaultTo(0))
      .addColumn("lastOperationTimestamp", "timestamptz", (col) =>
        col.notNull().defaultTo(sql`NOW()`),
      )
      .ifNotExists()
      .execute();
  });

  beforeEach(async () => {
    await db
      .deleteFrom("ViewState")
      .where("readModelId", "=", WORKFLOW_TRIGGERS_READ_MODEL)
      .execute();
  });

  it("is named for the coordinator, and reads once the document is ready", () => {
    expect(readModel().model.name).toBe(WORKFLOW_TRIGGERS_READ_MODEL);
    expect(WORKFLOW_TRIGGERS_READ_MODEL_STAGE).toBe("post_ready");
  });

  it("starts a first registration at the watermark and replays nothing", async () => {
    const { batches, getSinceOrdinal, model } = readModel([[op(1), op(2)]], 2);

    await model.init();

    expect(getSinceOrdinal).not.toHaveBeenCalled();
    expect(batches).toHaveLength(0);
    expect(await cursor()).toBe(2);
  });

  it("delegates a live batch and leaves the cursor to the sweep", async () => {
    const { batches, model, onOperations } = readModel([], 10);

    await model.init();
    await model.indexOperations([op(11), op(13), op(12)]);

    expect(onOperations).toHaveBeenCalledTimes(1);
    expect(batches).toEqual([[op(11), op(13), op(12)]]);
    expect(await cursor()).toBe(10);

    await model.sweep(13, [11, 12, 13]);
    expect(onOperations).toHaveBeenCalledTimes(1);
    expect(await cursor()).toBe(13);
  });

  it("holds the cursor below an operation the runtime threw on", async () => {
    const { model, onOperations } = readModel([[op(11), op(99)]], 10);
    await model.init();
    await model.indexOperations([op(11)]);
    onOperations
      .mockRejectedValueOnce(new Error("boom"))
      .mockRejectedValueOnce(new Error("boom"));

    await expect(model.indexOperations([op(99)])).rejects.toThrow("boom");

    // An operation the runtime refused must be re-read, never skipped.
    await model.sweep(99, [11, 99]);
    expect(await cursor()).toBe(98);

    await model.sweep(99, [11, 99]);
    expect(await cursor()).toBe(99);
  });

  it("catches up from the stored cursor on a later start", async () => {
    const before = readModel([], 13);
    await before.model.init();

    const { batches, getSinceOrdinal, model } = readModel(
      [
        [op(12), op(13), op(14)],
        [op(15), op(16)],
      ],
      16,
    );
    await model.init();

    expect(getSinceOrdinal).toHaveBeenCalledWith(13);
    // Only what the cursor had not seen, page by page.
    expect(ordinals(batches)).toEqual([[14], [15, 16]]);
    expect(await cursor()).toBe(16);
  });
});
