import type {
  Operation,
  PurgeMarkerOperation,
} from "@powerhousedao/shared/document-model";
import { Kysely, PostgresDialect } from "kysely";
import { Pool } from "pg";
import type { Database as CoreDatabase } from "../../../src/core/types.js";
import type { IOperationStore } from "../../../src/storage/interfaces.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import {
  REACTOR_SCHEMA,
  runMigrations,
} from "../../../src/storage/migrations/migrator.js";
import {
  createCreateDocumentOperation,
  createTestOperation,
  createUpgradeDocumentOperation,
} from "../../factories.js";

export const DOCUMENT_TYPE = "powerhouse/document-model";

const PG_TEST_URL =
  process.env.REACTOR_TEST_PG_URL ??
  "postgres://postgres:postgres@localhost:5433/reactor";

/** CREATE_DOCUMENT and a 0->1 upgrade, as a created document holds them. */
export async function createDocument(
  store: IOperationStore,
  documentId: string,
  protocolVersions: Record<string, number> = { "base-reducer": 2 },
): Promise<void> {
  await store.apply(documentId, DOCUMENT_TYPE, "document", "main", 0, (txn) => {
    txn.addOperations(
      createCreateDocumentOperation(
        documentId,
        DOCUMENT_TYPE,
        {},
        { protocolVersions },
      ),
      createUpgradeDocumentOperation(documentId, 0, 1, {
        document: {
          version: 1,
          hash: { algorithm: "sha256", encoding: "base64" },
        },
        global: {},
        local: {},
      }),
    );
  });
}

/** Global operations 0..count-1. */
export async function appendGlobal(
  store: IOperationStore,
  documentId: string,
  count: number,
): Promise<void> {
  const operations: Operation[] = [];
  for (let index = 0; index < count; index++) {
    operations.push(createTestOperation(documentId, { index, skip: 0 }));
  }
  await store.apply(documentId, DOCUMENT_TYPE, "global", "main", 0, (txn) => {
    txn.addOperations(...operations);
  });
}

/** A history that ends in the marker: it lands at `index` of document scope. */
export async function appendMarkerAt(
  store: IOperationStore,
  marker: PurgeMarkerOperation,
  index: number,
): Promise<void> {
  const { documentId } = marker.action.input;
  await store.apply(
    documentId,
    DOCUMENT_TYPE,
    "document",
    "main",
    index,
    (txn) => {
      txn.addOperations({ ...marker, index });
    },
  );
}

/** Removes every operation of the id, as the purge's delete does. */
export async function deleteOperations(
  db: Kysely<Database>,
  documentId: string,
): Promise<void> {
  await db
    .deleteFrom("Operation")
    .where("documentId", "=", documentId)
    .execute();
}

export async function countKeyframes(
  db: Kysely<Database>,
  documentId: string,
): Promise<number> {
  const rows = await db
    .selectFrom("Keyframe")
    .select("id")
    .where("documentId", "=", documentId)
    .execute();
  return rows.length;
}

/** A migrated database of its own, for code that hardcodes the reactor schema. */
export async function createScratchDatabase(name: string): Promise<{
  db: Kysely<CoreDatabase>;
  drop: () => Promise<void>;
}> {
  const database = `${name}_${process.pid}`;
  const admin = new Pool({ connectionString: PG_TEST_URL });
  await admin.query(`DROP DATABASE IF EXISTS "${database}"`);
  await admin.query(`CREATE DATABASE "${database}"`);

  const url = new URL(PG_TEST_URL);
  url.pathname = `/${database}`;
  const pool = new Pool({ connectionString: url.toString() });
  // pool.end() resolves before its sockets close; the forced drop ends them.
  pool.on("error", (error: Error & { code?: string }) => {
    if (error.code !== "57P01") throw error;
  });
  const db = new Kysely<CoreDatabase>({
    dialect: new PostgresDialect({ pool }),
  });
  const result = await runMigrations(db, REACTOR_SCHEMA);
  if (!result.success && result.error) {
    throw new Error(`Test migration failed: ${result.error.message}`);
  }

  return {
    db,
    drop: async () => {
      try {
        await db.destroy();
        await admin.query(`DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`);
      } finally {
        await admin.end();
      }
    },
  };
}
