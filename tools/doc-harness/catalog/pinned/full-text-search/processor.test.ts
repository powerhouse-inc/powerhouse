import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Kysely } from "kysely";
import { KyselyPGlite } from "kysely-pglite";
import type { OperationWithContext } from "document-model";
import type { SearchDB } from "./schema.js";
import { up, down } from "./migrations.js";
import { SearchProcessor } from "./processor.js";
import { createSearchQuery } from "./query.js";
import { flattenToSearchableText } from "./utils.js";

function createTestDb() {
  const pglite = new KyselyPGlite();
  const db = new Kysely<SearchDB>({ dialect: pglite.dialect });
  return { db };
}

function makeOp(overrides?: {
  documentId?: string;
  documentType?: string;
  actionType?: string;
  resultingState?: Record<string, unknown>;
}): OperationWithContext {
  const ts = String(Date.now());
  return {
    operation: {
      id: "op-1",
      index: 0,
      skip: 0,
      timestampUtcMs: ts,
      hash: "abc",
      action: {
        id: "act-1",
        type: overrides?.actionType ?? "SOME_ACTION",
        timestampUtcMs: ts,
        input: {},
        scope: "global",
      },
    },
    context: {
      documentId: overrides?.documentId ?? "doc-1",
      documentType: overrides?.documentType ?? "example/doc",
      scope: "global",
      branch: "main",
      ordinal: 0,
      ...(overrides?.resultingState !== undefined
        ? { resultingState: JSON.stringify(overrides.resultingState) }
        : { resultingState: JSON.stringify({ header: { name: "Test Doc" } }) }),
    },
  };
}

function makeDeleteOp(documentId: string): OperationWithContext {
  const ts = String(Date.now());
  return {
    operation: {
      id: "op-del",
      index: 0,
      skip: 0,
      timestampUtcMs: ts,
      hash: "def",
      action: {
        id: "act-del",
        type: "DELETE_DOCUMENT",
        timestampUtcMs: ts,
        input: { documentId },
        scope: "global",
      },
    },
    context: {
      documentId,
      documentType: "example/doc",
      scope: "global",
      branch: "main",
      ordinal: 0,
    },
  };
}

describe("SearchProcessor", () => {
  let db: Kysely<SearchDB>;
  let processor: SearchProcessor;

  beforeAll(async () => {
    const testDb = createTestDb();
    db = testDb.db;
    await up(db);
    processor = new SearchProcessor(db);
  });

  afterAll(async () => {
    await down(db);
    await db.destroy();
  });

  it("indexes a document and makes it searchable", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-1",
        documentType: "makerdao/budget",
        resultingState: { header: { name: "Quarterly Budget" }, description: "Finance report for Q1" },
      }),
    ]);

    const rows = await db.selectFrom("search_index").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].document_id).toBe("doc-1");
    expect(rows[0].document_type).toBe("makerdao/budget");
    expect(rows[0].title).toBe("Quarterly Budget");

    const query = createSearchQuery(db);
    const results = await query.search("budget");
    expect(results).toHaveLength(1);
    expect(results[0].document_id).toBe("doc-1");
  });

  it("updates an existing document on new operation", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-1",
        documentType: "makerdao/budget",
        resultingState: { header: { name: "Updated Budget" }, description: "Revised finance report" },
      }),
    ]);

    const rows = await db.selectFrom("search_index").selectAll().execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].title).toBe("Updated Budget");
  });

  it("handles DELETE_DOCUMENT by removing from index", async () => {
    await processor.onOperations([
      makeOp({
        documentId: "doc-to-delete",
        resultingState: { header: { name: "Doomed Document" } },
      }),
    ]);

    await processor.onOperations([makeDeleteOp("doc-to-delete")]);

    const rows = await db
      .selectFrom("search_index")
      .selectAll()
      .where("document_id", "=", "doc-to-delete")
      .execute();
    expect(rows).toHaveLength(0);
  });

  it("does nothing for an empty operations list", async () => {
    const countBefore = await db
      .selectFrom("search_index")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    await processor.onOperations([]);

    const countAfter = await db
      .selectFrom("search_index")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    expect(countAfter.count).toBe(countBefore.count);
  });

  it("skips operations without resultingState", async () => {
    const countBefore = await db
      .selectFrom("search_index")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    const op = makeOp({ documentId: "doc-no-state" });
    (op.context as any).resultingState = undefined;

    await processor.onOperations([op]);

    const countAfter = await db
      .selectFrom("search_index")
      .select(db.fn.countAll().as("count"))
      .executeTakeFirstOrThrow();

    expect(countAfter.count).toBe(countBefore.count);
  });

  it("onDisconnect completes without error", async () => {
    await expect(processor.onDisconnect()).resolves.toBeUndefined();
  });
});

describe("flattenToSearchableText", () => {
  it("flattens nested objects to a single string", () => {
    const result = flattenToSearchableText({
      name: "Hello",
      nested: { a: "World", b: "Test" },
    });
    expect(result).toBe("Hello World Test");
  });

  it("handles arrays", () => {
    const result = flattenToSearchableText({ tags: ["alpha", "beta"] });
    expect(result).toBe("alpha beta");
  });

  it("ignores null and non-string primitives", () => {
    const result = flattenToSearchableText({ a: null, b: 42, c: "kept" });
    expect(result).toBe("kept");
  });

  it("returns empty string for empty object", () => {
    const result = flattenToSearchableText({});
    expect(result).toBe("");
  });
});
