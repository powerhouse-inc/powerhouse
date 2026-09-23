import type {
  Expression,
  ExpressionBuilder,
  Kysely,
  SqlBool,
  Transaction,
} from "kysely";
import { sql } from "kysely";
import type { Database, DocumentPurgeTable } from "./types.js";

type PurgeDatabase = { document_purges: DocumentPurgeTable };

/** Serializes purges; held from the first delete through commit. */
export const PURGE_LOCK_KEY = "purge";

/** Taken shared by admission and exclusive by the purger. */
export function purgeLockKey(documentId: string): string {
  return `purge:${documentId}`;
}

/** The guard a resurrecting insert carries: no tombstone for the id. */
export function notPurged<DB, TB extends keyof DB>(
  eb: ExpressionBuilder<DB, TB>,
  documentId: string | Expression<string>,
): Expression<SqlBool> {
  const purges = eb as unknown as ExpressionBuilder<PurgeDatabase, never>;
  return purges.not(
    purges.exists(
      purges
        .selectFrom("document_purges")
        .select(sql<number>`1`.as("one"))
        .where("document_purges.documentId", "=", documentId),
    ),
  );
}

/** Locks in sorted key order, so two holders never wait on each other. */
export async function takePurgeLocks<DB>(
  executor: Kysely<DB> | Transaction<DB>,
  keys: string[],
  mode: "shared" | "exclusive",
): Promise<void> {
  if (keys.length === 0) return;

  const sorted = sql.join([...new Set(keys)].sort());
  const lock =
    mode === "shared"
      ? sql`pg_advisory_xact_lock_shared(hashtext(key))`
      : sql`pg_advisory_xact_lock(hashtext(key))`;

  await sql`
    with ordered as materialized (
      select key
      from unnest(array[${sorted}]::text[]) with ordinality as t(key, ord)
      order by ord
    )
    select ${lock} from ordered
  `.execute(executor);
}

export async function findPurgedIds<DB>(
  executor: Kysely<DB> | Transaction<DB>,
  documentIds: string[],
): Promise<string[]> {
  if (documentIds.length === 0) return [];

  const rows = await (executor as unknown as Kysely<PurgeDatabase>)
    .selectFrom("document_purges")
    .select("documentId")
    .where("documentId", "in", [...new Set(documentIds)])
    .execute();
  return rows.map((row) => row.documentId);
}

/** Admission's view of the tombstones, bound to a job's transaction. */
export interface IDocumentPurgeGate {
  /** Takes the shared purge lock on each id, then returns those purged. */
  admit(documentIds: string[]): Promise<string[]>;

  /** Returns the purged ids without locking. */
  findPurged(documentIds: string[]): Promise<string[]>;
}

export class KyselyDocumentPurgeGate implements IDocumentPurgeGate {
  constructor(
    private readonly executor: Kysely<Database> | Transaction<Database>,
  ) {}

  async admit(documentIds: string[]): Promise<string[]> {
    await takePurgeLocks(
      this.executor,
      documentIds.map(purgeLockKey),
      "shared",
    );
    return findPurgedIds(this.executor, documentIds);
  }

  findPurged(documentIds: string[]): Promise<string[]> {
    return findPurgedIds(this.executor, documentIds);
  }
}
