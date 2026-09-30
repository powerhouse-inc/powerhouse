import { sql, type Kysely, type Transaction } from "kysely";
import type { Database } from "./types.js";

/** Class key of every purge lock; the stream locks use the single-key space. */
export const PURGE_NS = 1_347_571_013;

/** Ids share this many lock keys, so a job's lock count stays bounded. */
export const PURGE_LOCK_BUCKETS = 1024;

export type PurgeLockMode = "shared" | "exclusive";

// Bucket order, not id order: two ids may share a key, and lockers must agree.
export async function acquirePurgeLocks(
  trx: Transaction<any>,
  ids: Iterable<string>,
  mode: PurgeLockMode,
): Promise<void> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return;

  const lock = sql.raw(
    mode === "shared"
      ? "pg_advisory_xact_lock_shared"
      : "pg_advisory_xact_lock",
  );
  await sql`
    with keys as materialized (
      select distinct hashtext(id) & ${sql.lit(PURGE_LOCK_BUCKETS - 1)} as key
      from unnest(${unique}::text[]) as t(id)
      order by key
    )
    select ${lock}(${sql.lit(PURGE_NS)}, key) from keys order by key
  `.execute(trx);
}

/** The ids among `ids` that have a tombstone, read in the handle's schema. */
export async function findPurged(
  db: Kysely<any>,
  ids: Iterable<string>,
): Promise<Set<string>> {
  const unique = [...new Set(ids)];
  if (unique.length === 0) return new Set();

  const rows = await (db as Kysely<Database>)
    .selectFrom("document_purges")
    .select("documentId")
    .where(sql<boolean>`"documentId" = any(${unique}::text[])`)
    .execute();
  return new Set(rows.map((row) => row.documentId));
}

/** Every tombstoned id, read in the handle's schema. */
export async function listPurged(db: Kysely<any>): Promise<string[]> {
  const rows = await (db as Kysely<Database>)
    .selectFrom("document_purges")
    .select("documentId")
    .orderBy("documentId")
    .execute();
  return rows.map((row) => row.documentId);
}
