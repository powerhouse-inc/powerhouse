import { PGlite } from "@electric-sql/pglite";
import {
  REACTOR_SCHEMA,
  runMigrations,
  type DocumentViewDatabase,
  type IConsistencyTracker,
  type IDocumentModelRegistry,
  type IOperationIndex,
  type IWriteCache,
  type PagedResults,
} from "@powerhousedao/reactor";
import type {
  Action,
  DocumentModelModule,
  OperationWithContext,
} from "@powerhousedao/shared/document-model";
import { Kysely, sql } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttachmentSchemaCompiler } from "../../../src/reference-index/attachment-schema-compiler.js";
import { AttachmentReferenceReadModel } from "../../../src/read-models/attachment-reference/attachment-reference-read-model.js";
import { KyselyAttachmentReferenceStore } from "../../../src/read-models/attachment-reference/kysely-attachment-reference-store.js";
import {
  ATTACHMENT_REFERENCE_SCHEMA,
  runAttachmentReferenceMigrations,
} from "../../../src/read-models/attachment-reference/storage/migrations/migrator.js";
import type { AttachmentReferenceDatabase } from "../../../src/read-models/attachment-reference/storage/types.js";

const REF = `attachment://v1:${"c".repeat(64)}` as const;

const attachModule = {
  actions: {},
  documentModel: {
    global: {
      id: "example/attachments",
      specifications: [
        {
          changeLog: [],
          modules: [
            {
              description: null,
              id: "attachments",
              name: "attachments",
              operations: [
                {
                  description: null,
                  errors: [],
                  examples: [],
                  id: "operation-attach",
                  name: "ATTACH_FILES",
                  reducer: null,
                  schema: `input AttachFilesInput { refs: [AttachmentRef!]! }`,
                  scope: "global",
                  template: null,
                },
              ],
            },
          ],
          state: {
            global: { examples: [], initialValue: "{}", schema: "" },
            local: { examples: [], initialValue: "{}", schema: "" },
          },
          version: 1,
        },
      ],
    },
  },
  version: 1,
} as unknown as DocumentModelModule;

function attach(ordinal: number, documentId: string): OperationWithContext {
  return {
    operation: {
      id: `operation-${ordinal}`,
      index: ordinal,
      skip: 0,
      timestampUtcMs: "2026-09-23T00:00:00.000Z",
      hash: `hash-${ordinal}`,
      action: {
        id: `action-${ordinal}`,
        type: "ATTACH_FILES",
        scope: "global",
        input: { refs: [REF] },
        timestampUtcMs: "2026-09-23T00:00:00.000Z",
      } as Action,
    },
    context: {
      documentId,
      documentType: "example/attachments",
      scope: "global",
      branch: "main",
      ordinal,
    },
  };
}

describe("AttachmentReferenceReadModel purge", () => {
  let baseDb: Kysely<unknown>;
  let reactorDb: Kysely<DocumentViewDatabase>;
  let refsDb: Kysely<AttachmentReferenceDatabase>;
  let indexed: OperationWithContext[];
  let model: AttachmentReferenceReadModel;

  beforeEach(async () => {
    baseDb = new Kysely<unknown>({ dialect: new PGliteDialect(new PGlite()) });
    const reactor = await runMigrations(baseDb, REACTOR_SCHEMA);
    if (!reactor.success && reactor.error) throw reactor.error;
    const refs = await runAttachmentReferenceMigrations(baseDb);
    if (!refs.success && refs.error) throw refs.error;
    reactorDb = baseDb.withSchema(
      REACTOR_SCHEMA,
    ) as unknown as Kysely<DocumentViewDatabase>;
    refsDb = baseDb.withSchema(
      ATTACHMENT_REFERENCE_SCHEMA,
    ) as Kysely<AttachmentReferenceDatabase>;

    indexed = [];
    const operationIndex = {
      getSinceOrdinal: vi.fn(
        (ordinal: number): Promise<PagedResults<OperationWithContext>> =>
          Promise.resolve({
            results: indexed.filter((op) => op.context.ordinal > ordinal),
            options: { cursor: "0", limit: 100 },
          }),
      ),
    } as unknown as IOperationIndex;
    model = new AttachmentReferenceReadModel(
      reactorDb,
      operationIndex,
      {} as IWriteCache,
      { update: vi.fn() } as unknown as IConsistencyTracker,
      {
        getModule: () => attachModule,
      } as unknown as IDocumentModelRegistry,
      new AttachmentSchemaCompiler(),
      new KyselyAttachmentReferenceStore(refsDb),
    );
    await model.init();
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  async function tombstone(documentId: string, from: number, to: number) {
    await sql`insert into ${sql.id(REACTOR_SCHEMA, "document_purges")}
      ("documentId", "directiveId", "purgedOrdinals", "purgedAtUtc")
      values (${documentId}, 'test', array[int8range(${from}::bigint, ${to}::bigint, '[]')], now())`.execute(
      baseDb,
    );
  }

  async function cursor(): Promise<{ lastOrdinal: number; purge: number }> {
    const row = await reactorDb
      .selectFrom("ViewState")
      .select(["lastOrdinal", sql<number>`"lastPurgeOrdinal"::int`.as("purge")])
      .where("readModelId", "=", model.name)
      .executeTakeFirstOrThrow();
    return { lastOrdinal: row.lastOrdinal, purge: row.purge };
  }

  async function referencedDocuments(): Promise<string[]> {
    const rows = await refsDb
      .selectFrom("attachment_reference")
      .select("document_id")
      .orderBy("document_id")
      .execute();
    return rows.map((row) => row.document_id);
  }

  it("removes a purged document's references and advances its purge cursor", async () => {
    indexed.push(attach(1, "kept"), attach(2, "purged"));
    await model.indexOperations(indexed);
    expect(await referencedDocuments()).toEqual(["kept", "purged"]);

    await tombstone("purged", 2, 2);
    const outcomes = await model.reconcilePurges();

    expect(outcomes).toEqual([
      expect.objectContaining({
        readModelId: model.name,
        rowsAffected: 1,
        covered: true,
      }),
    ]);
    expect(await referencedDocuments()).toEqual(["kept"]);
    expect((await cursor()).purge).toBeGreaterThan(0);
  });

  it("does not park its cursor on a purged gap", async () => {
    indexed.push(attach(1, "a"), attach(2, "a"));
    await model.indexOperations(indexed);
    expect((await cursor()).lastOrdinal).toBe(2);

    // Ordinals 3 and 4 were purged: they will never be delivered.
    await tombstone("gone", 3, 4);
    indexed.push(attach(5, "b"));
    await model.indexOperations([attach(5, "b")]);

    expect((await cursor()).lastOrdinal).toBe(5);
  });

  it("writes no reference for a purged document delivered late", async () => {
    await tombstone("late", 1, 1);
    await model.indexOperations([attach(1, "late"), attach(2, "alive")]);

    expect(await referencedDocuments()).toEqual(["alive"]);
  });
});
