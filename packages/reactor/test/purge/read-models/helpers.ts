import {
  deriveOperationId,
  generateId,
  type Action,
  type OperationWithContext,
  type PHDocument,
} from "@powerhousedao/shared/document-model";
import { sql, type Kysely, type Transaction } from "kysely";
import { expect, vi } from "vitest";
import type {
  IOperationIndex,
  OperationIndexEntry,
} from "../../../src/cache/operation-index-types.js";
import type { IWriteCache } from "../../../src/cache/write/interfaces.js";
import type { BaseReadModel } from "../../../src/read-models/base-read-model.js";
import { DocumentPurgedError } from "../../../src/shared/errors.js";
import {
  acquirePurgeLocks,
  PURGE_NS,
} from "../../../src/storage/kysely/document-purges.js";
import type { Database } from "../../../src/storage/kysely/types.js";
import { PURGE_TEST_DOCUMENT_TYPE, seedTombstone } from "../helpers.js";

export const DOCUMENT_TYPE = PURGE_TEST_DOCUMENT_TYPE;

export function entry(
  documentId: string,
  index: number,
  type: string,
  input: unknown,
  scope = "document",
): OperationIndexEntry {
  const actionId = generateId();
  const timestampUtcMs = new Date(1_704_067_200_000 + index).toISOString();
  return {
    id: deriveOperationId(documentId, scope, "main", actionId),
    documentId,
    documentType: DOCUMENT_TYPE,
    branch: "main",
    scope,
    sourceRemote: "",
    index,
    timestampUtcMs,
    hash: scope === "document" ? "" : `hash-${index}`,
    skip: 0,
    action: {
      id: actionId,
      type,
      scope,
      timestampUtcMs,
      input,
    } as Action,
  };
}

export function createEntry(documentId: string): OperationIndexEntry {
  return entry(documentId, 0, "CREATE_DOCUMENT", {
    documentId,
    model: DOCUMENT_TYPE,
    version: 0,
  });
}

export function addRelationshipEntry(
  sourceId: string,
  index: number,
  targetId: string,
): OperationIndexEntry {
  return entry(sourceId, index, "ADD_RELATIONSHIP", {
    sourceId,
    targetId,
    relationshipType: "child",
  });
}

export async function commitEntries(
  index: IOperationIndex,
  entries: OperationIndexEntry[],
): Promise<number[]> {
  const txn = index.start();
  txn.write(entries);
  return index.commit(txn);
}

export function documentState(documentId: string) {
  return {
    header: {
      id: documentId,
      slug: `slug-${documentId}`,
      name: `name-${documentId}`,
      documentType: DOCUMENT_TYPE,
    },
    document: { isDeleted: false },
    auth: {},
    global: { name: `name-${documentId}` },
  };
}

/** What the executor's JOB_WRITE_READY carries: the index rows plus state. */
export async function writeReadyItems(
  index: IOperationIndex,
  ordinals: number[],
): Promise<OperationWithContext[]> {
  const items = await index.getByOrdinals(ordinals);
  return items.map((item) => ({
    ...item,
    context: {
      ...item.context,
      resultingState: JSON.stringify(documentState(item.context.documentId)),
    },
  }));
}

/** Rebuilds any document; a purged id throws as the write cache will. */
export function stubWriteCache(purged: Set<string> = new Set()): IWriteCache {
  return {
    getState: vi.fn((documentId: string) => {
      if (purged.has(documentId)) {
        return Promise.reject(new DocumentPurgedError(documentId));
      }
      const { header, ...state } = documentState(documentId);
      return Promise.resolve({ header, state } as unknown as PHDocument);
    }),
    putState: vi.fn(),
    putRun: vi.fn(),
    invalidate: vi.fn().mockReturnValue(0),
    clear: vi.fn(),
    startup: vi.fn().mockResolvedValue(undefined),
    shutdown: vi.fn().mockResolvedValue(undefined),
  } as unknown as IWriteCache;
}

/** Sweeps to the index head: other suites' open writes hold the real watermark. */
export async function sweepToHead(
  model: BaseReadModel,
  index: IOperationIndex,
) {
  const present = await index.getOrdinalsInRange(0, 2 ** 31 - 1, 100_000);
  const head = present.length > 0 ? Math.max(...present) : 0;
  return model.sweep(
    head,
    present.filter((ordinal) => ordinal > model.appliedThrough),
  );
}

/** The purge's deletes, for the tables this test can have written. */
export async function deleteDocumentRows(
  db: Kysely<any>,
  documentId: string,
): Promise<void> {
  await db
    .deleteFrom("DocumentRelationship")
    .where((eb: any) =>
      eb.or([eb("sourceId", "=", documentId), eb("targetId", "=", documentId)]),
    )
    .execute();
  await db.deleteFrom("Document").where("id", "=", documentId).execute();
  for (const table of [
    "DocumentSnapshot",
    "SlugMapping",
    "Keyframe",
    "Operation",
    "operation_index_operations",
    "group_references",
  ]) {
    await db.deleteFrom(table).where("documentId", "=", documentId).execute();
  }
  for (const table of ["sync_dead_letters", "sync_holds"]) {
    await db.deleteFrom(table).where("document_id", "=", documentId).execute();
  }
}

/** Deletes the id's rows and writes its tombstone under the exclusive lock. */
export async function purgeInTransaction(
  trx: Transaction<Database>,
  documentId: string,
  ordinal = 0,
): Promise<void> {
  await acquirePurgeLocks(trx, [documentId], "exclusive");
  await deleteDocumentRows(trx, documentId);
  await seedTombstone(trx, documentId, ordinal);
}

/** Resolves once a transaction holds, or waits on, the purge lock for the id. */
export async function waitForPurgeLock(
  db: Kysely<Database>,
  documentId: string,
  mode: "ShareLock" | "ExclusiveLock",
  granted: boolean,
): Promise<void> {
  await vi.waitUntil(
    async () => {
      const result = await sql<{ n: string | number }>`
        select count(*) as n from pg_locks
        where locktype = 'advisory' and granted = ${granted} and mode = ${mode}
          and classid = ${PURGE_NS}::int::oid
          and objid = (hashtext(${documentId}) & 1023)::oid
          and objsubid = 2
      `.execute(db);
      return Number(result.rows[0]!.n) > 0;
    },
    { timeout: 10_000, interval: 20 },
  );
}

type Counts = Record<string, number>;

/** Row counts per table of the spec's delete list; markers are not counted. */
export async function rowsFor(
  db: Kysely<any>,
  documentId: string,
): Promise<Counts> {
  const count = async (table: string, column: string, notMarker = false) => {
    let query = db
      .selectFrom(table)
      .select((eb: any) => eb.fn.countAll().as("n"))
      .where(column, "=", documentId);
    if (notMarker) {
      query = query.where(sql`action->>'type'`, "!=", "PURGE_DOCUMENT");
    }
    const row = await query.executeTakeFirst();
    return Number((row as { n: string | number } | undefined)?.n ?? 0);
  };
  const relationships = await db
    .selectFrom("DocumentRelationship")
    .select((eb: any) => eb.fn.countAll().as("n"))
    .where((eb: any) =>
      eb.or([eb("sourceId", "=", documentId), eb("targetId", "=", documentId)]),
    )
    .executeTakeFirst();
  return {
    Operation: await count("Operation", "documentId", true),
    operation_index_operations: await count(
      "operation_index_operations",
      "documentId",
      true,
    ),
    Keyframe: await count("Keyframe", "documentId"),
    DocumentSnapshot: await count("DocumentSnapshot", "documentId"),
    SlugMapping: await count("SlugMapping", "documentId"),
    Document: await count("Document", "id"),
    DocumentRelationship: Number(
      (relationships as { n: string | number } | undefined)?.n ?? 0,
    ),
    group_references: await count("group_references", "documentId"),
    sync_dead_letters: await count("sync_dead_letters", "document_id"),
    sync_holds: await count("sync_holds", "document_id"),
  };
}

export async function expectNoRowsFor(
  db: Kysely<any>,
  documentId: string,
): Promise<void> {
  const counts = await rowsFor(db, documentId);
  expect(counts).toEqual(
    Object.fromEntries(Object.keys(counts).map((table) => [table, 0])),
  );
}
