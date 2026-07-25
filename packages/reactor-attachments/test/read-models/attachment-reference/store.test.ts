import { PGlite } from "@electric-sql/pglite";
import type { AttachmentRef } from "@powerhousedao/reactor";
import { Kysely } from "kysely";
import { PGliteDialect } from "kysely-pglite-dialect";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyAttachmentReferenceStore } from "../../../src/read-models/attachment-reference/kysely-attachment-reference-store.js";
import {
  ATTACHMENT_REFERENCE_SCHEMA,
  runAttachmentReferenceMigrations,
} from "../../../src/read-models/attachment-reference/storage/migrations/migrator.js";
import type { AttachmentReferenceDatabase } from "../../../src/read-models/attachment-reference/storage/types.js";

const REF_A = "attachment://v1:hash-a" as AttachmentRef;
const REF_B = "attachment://v1:hash-b" as AttachmentRef;
const REF_A_V2 = "attachment://v2:hash-a" as AttachmentRef;

describe("KyselyAttachmentReferenceStore", () => {
  let baseDb: Kysely<unknown>;
  let db: Kysely<AttachmentReferenceDatabase>;
  let store: KyselyAttachmentReferenceStore;

  beforeEach(async () => {
    baseDb = new Kysely<unknown>({
      dialect: new PGliteDialect(new PGlite()),
    });
    const result = await runAttachmentReferenceMigrations(baseDb);
    if (!result.success && result.error) {
      throw new Error(`Test migration failed: ${result.error.message}`);
    }
    db = baseDb.withSchema(
      ATTACHMENT_REFERENCE_SCHEMA,
    ) as Kysely<AttachmentReferenceDatabase>;
    store = new KyselyAttachmentReferenceStore(db);
  });

  afterEach(async () => {
    await baseDb.destroy();
  });

  const reference = (
    documentId: string,
    ref: AttachmentRef,
    operationId = "operation-first",
    ordinal = 7,
  ) => ({
    documentId,
    ref,
    operationId,
    branch: "main",
    scope: "global",
    ordinal,
  });

  it("returns false for an empty table", async () => {
    await expect(store.hasReference("document-a", REF_A)).resolves.toBe(false);
  });

  it("inserts and looks up an exact document/ref relationship and parsed hash", async () => {
    await store.addReferences([reference("document-a", REF_A)]);

    await expect(store.hasReference("document-a", REF_A)).resolves.toBe(true);
    await expect(store.hasReference("document-a", REF_A_V2)).resolves.toBe(
      false,
    );

    const row = await db
      .selectFrom("attachment_reference")
      .selectAll()
      .where("attachment_hash", "=", "hash-a")
      .executeTakeFirstOrThrow();
    expect(row).toMatchObject({
      document_id: "document-a",
      attachment_ref: REF_A,
      attachment_hash: "hash-a",
      first_operation_id: "operation-first",
      branch: "main",
      scope: "global",
      first_seen_ordinal: 7,
    });
    expect(Date.parse(row.created_at_utc)).not.toBeNaN();
  });

  it("preserves first-seen provenance when replayed", async () => {
    await store.addReferences([reference("document-a", REF_A)]);
    const firstSeen = await db
      .selectFrom("attachment_reference")
      .select("created_at_utc")
      .executeTakeFirstOrThrow();
    await store.addReferences([
      {
        ...reference("document-a", REF_A, "operation-later", 99),
        branch: "staging",
        scope: "local",
      },
    ]);

    const rows = await db
      .selectFrom("attachment_reference")
      .selectAll()
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      first_operation_id: "operation-first",
      branch: "main",
      scope: "global",
      first_seen_ordinal: 7,
      created_at_utc: firstSeen.created_at_utc,
    });
  });

  it("supports multiple documents per ref and multiple refs per document", async () => {
    await store.addReferences([
      reference("document-a", REF_A),
      reference("document-b", REF_A),
      reference("document-a", REF_B),
    ]);

    const rows = await db
      .selectFrom("attachment_reference")
      .select(["document_id", "attachment_ref"])
      .orderBy("document_id")
      .orderBy("attachment_ref")
      .execute();
    expect(rows).toEqual([
      { document_id: "document-a", attachment_ref: REF_A },
      { document_id: "document-a", attachment_ref: REF_B },
      { document_id: "document-b", attachment_ref: REF_A },
    ]);
  });

  it("accepts an empty idempotent batch", async () => {
    await expect(store.addReferences([])).resolves.toBeUndefined();
  });
});
