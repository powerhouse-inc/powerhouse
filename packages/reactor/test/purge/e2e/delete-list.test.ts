import { sql, type Kysely } from "kysely";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { KyselyOperationIndex } from "../../../src/cache/kysely-operation-index.js";
import type { Database as StorageDatabase } from "../../../src/storage/kysely/types.js";
import { KyselyOperationStore } from "../../../src/storage/kysely/store.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";
import { TestP256Signer } from "../../utils/p256-signer.js";
import {
  PURGE_TEST_DOCUMENT_TYPE,
  purgeMarker,
  seedPurgedDocument,
  signedPurgeMarker,
} from "../helpers.js";
import {
  DELETE_LIST,
  expectNoRowsFor,
  expectPurged,
  KEPT_TABLES,
  PgDatabase,
  type ReactorDb,
} from "./harness.js";

const DOCUMENT_KEYS = [
  "documentId",
  "document_id",
  "sourceId",
  "targetId",
  "groupId",
  "driveId",
  "collection_id",
  "filter_document_ids",
];

const ID = "delete-list-doc";
const OTHER = "delete-list-other";

type Table = (name: string) => ReturnType<typeof sql.id>;

/** One row about ID per table, by the column the purge keys on. */
const SEEDS: Record<string, (db: ReactorDb, t: Table) => Promise<unknown>> = {
  Operation: (db, t) =>
    sql`insert into ${t("Operation")} ("jobId", "opId", "prevOpId", "documentId",
      "documentType", scope, branch, "timestampUtcMs", index, action, skip, hash)
      values ('j', 'op-1', '', ${ID}, 't', 'global', 'main', now(), 0,
      ${JSON.stringify({ id: "a-1", type: "SET_NAME" })}::jsonb, 0, 'h')`.execute(
      db,
    ),
  operation_index_operations: (db, t) =>
    sql`insert into ${t("operation_index_operations")} ("opId", "documentId",
      "documentType", scope, branch, "timestampUtcMs", index, skip, hash, action)
      values ('op-1', ${ID}, 't', 'global', 'main', '0', 0, 0, 'h',
      ${JSON.stringify({ id: "a-1", type: "SET_NAME" })}::jsonb)`.execute(db),
  Keyframe: (db, t) =>
    sql`insert into ${t("Keyframe")} ("documentId", "documentType", scope, branch,
      revision, document) values (${ID}, 't', 'global', 'main', 1, '{}'::jsonb)`.execute(
      db,
    ),
  DocumentSnapshot: (db, t) =>
    sql`insert into ${t("DocumentSnapshot")} (id, "documentId", scope, branch, content,
      "documentType", "lastOperationIndex", "lastOperationHash")
      values ('snap-1', ${ID}, 'global', 'main', '{}'::jsonb, 't', 0, 'h')`.execute(
      db,
    ),
  SlugMapping: (db, t) =>
    sql`insert into ${t("SlugMapping")} (slug, "documentId", scope, branch)
      values ('a-slug', ${ID}, 'header', 'main')`.execute(db),
  Document: (db, t) =>
    sql`insert into ${t("Document")} (id) values (${ID})`.execute(db),
  DocumentRelationship: async (db, t) => {
    await sql`insert into ${t("Document")} (id) values (${OTHER}), (${ID})`.execute(
      db,
    );
    await sql`insert into ${t("DocumentRelationship")} (id, "sourceId", "targetId",
      "relationshipType") values ('rel-1', ${OTHER}, ${ID}, 'child')`.execute(
      db,
    );
  },
  group_references: (db, t) =>
    sql`insert into ${t("group_references")} ("documentId", "groupId")
      values (${ID}, 'some-group')`.execute(db),
  sync_dead_letters: (db, t) =>
    sql`insert into ${t("sync_dead_letters")} (id, job_id, job_dependencies,
      remote_name, document_id, scopes, branch, operations, error_source,
      error_message) values ('dl-1', 'j', '[]'::jsonb, 'r', ${ID},
      '["global"]'::jsonb, 'main', '[]'::jsonb, 'inbox', 'boom')`.execute(db),
  sync_holds: (db, t) =>
    sql`insert into ${t("sync_holds")} (remote_name, document_id, branch, protocol,
      version, held_at_utc_ms) values ('r', ${ID}, 'main', 'base-reducer', 2, 0)`.execute(
      db,
    ),
};

describe("the e2e delete list [Postgres]", () => {
  let db: ReactorDb;
  let schema: string;
  let store: KyselyOperationStore;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    // Its own database: factory schema names can collide across workers.
    const pg = await PgDatabase.create("reactor_e2e_delete_list");
    const migrated = await runMigrations(pg.base, REACTOR_SCHEMA);
    if (!migrated.success && migrated.error) throw migrated.error;
    db = pg.reactor;
    schema = REACTOR_SCHEMA;
    store = new KyselyOperationStore(db as unknown as Kysely<StorageDatabase>);
    cleanup = () => pg.destroy();
    await sql`insert into ${sql.id(schema, "sync_remotes")}
      (name, collection_id, channel_type) values ('r', 'c', 'internal')`.execute(
      db,
    );
  });

  afterEach(async () => {
    await cleanup();
  });

  it("covers every table that keys on a document, or names it kept", async () => {
    const result = await sql<{ table_name: string; column_name: string }>`
      select table_name, column_name from information_schema.columns
      where table_schema = ${schema}
    `.execute(db);
    const keyed = new Set(
      result.rows
        .filter(
          (row) =>
            DOCUMENT_KEYS.includes(row.column_name) ||
            (row.table_name === "Document" && row.column_name === "id"),
        )
        .map((row) => row.table_name),
    );

    const covered = new Set([
      ...DELETE_LIST.map((check) => check.table),
      ...KEPT_TABLES,
    ]);
    expect([...keyed].sort()).toEqual([...covered].sort());
  });

  it.each(DELETE_LIST.map((check) => [check.table, check] as const))(
    "sees a row about the id in %s",
    async (table, check) => {
      expect(await check.count(db, ID)).toBe(0);
      await SEEDS[table]!(db, (name) => sql.id(schema, name));
      expect(await check.count(db, ID)).toBeGreaterThan(0);
      await expect(expectNoRowsFor(db, ID)).rejects.toThrow();
    },
  );

  it("does not count the marker, a hold on document-purge, or a group's referencers", async () => {
    const t: Table = (name) => sql.id(schema, name);
    const marker = purgeMarker(ID);
    await sql`insert into ${t("Operation")} ("jobId", "opId", "prevOpId", "documentId",
      "documentType", scope, branch, "timestampUtcMs", index, action, skip, hash)
      values ('j', ${marker.id}, '', ${ID}, 't', 'document', 'main', now(), 0,
      ${JSON.stringify(marker.action)}::jsonb, 0, '')`.execute(db);
    await sql`insert into ${t("operation_index_operations")} ("opId", "documentId",
      "documentType", scope, branch, "timestampUtcMs", index, skip, hash, action)
      values (${marker.id}, ${ID}, 't', 'document', 'main', '0', 0, 0, '',
      ${JSON.stringify(marker.action)}::jsonb)`.execute(db);
    await sql`insert into ${t("sync_holds")} (remote_name, document_id, branch, protocol,
      version, held_at_utc_ms) values ('r', ${ID}, 'main', 'document-purge', 1, 0)`.execute(
      db,
    );
    await sql`insert into ${t("group_references")} ("documentId", "groupId")
      values ('survivor', ${ID})`.execute(db);

    await expectNoRowsFor(db, ID);
  });

  it("reads a seeded purged stream as purged", async () => {
    const key = await TestP256Signer.create();
    const marker = await signedPurgeMarker(key.asISigner(), ID);
    const storage = db as unknown as Kysely<StorageDatabase>;
    await sql`insert into ${sql.id(schema, "document_collections")}
      ("documentId", "collectionId", "joinedOrdinal", "leftOrdinal")
      values (${ID}, 'drive-c', 1, 2)`.execute(db);
    const ordinal = await seedPurgedDocument(
      { db: storage, store, index: new KyselyOperationIndex(storage) },
      marker,
      { reopenMemberships: storage },
    );

    const state = await expectPurged(db, ID, {
      documentType: PURGE_TEST_DOCUMENT_TYPE,
      signerKey: key.did,
      requestId: marker.action.input.requestId,
    });
    expect(state.ordinal).toBe(ordinal);
    expect(state.marker.id).toBe(marker.id);
  });
});
