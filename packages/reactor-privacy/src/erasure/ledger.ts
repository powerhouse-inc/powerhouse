import type { PurgeRemovedRows, StorageDatabase } from "@powerhousedao/reactor";
import { sql, type Kysely } from "kysely";
import type {
  ErasureAuditEvent,
  ReactorPrivacyDatabase,
} from "../schema/tables.js";
import type { DeploymentSecret } from "../subject-hash.js";
import { redactDetail } from "./redact.js";

/** Both ledgers live in the reactor schema: the handle is already scoped to it. */
export type ErasureDb = Kysely<ReactorPrivacyDatabase & StorageDatabase>;

export type Tombstone = {
  ordinal: number;
  removedRows: PurgeRemovedRows;
  purgedAtUtc: Date;
};

export async function readTombstone(
  db: ErasureDb,
  documentId: string,
): Promise<Tombstone | undefined> {
  const row = await db
    .selectFrom("document_purges")
    .select(["ordinal", "removedRows", "purgedAtUtc"])
    .where("documentId", "=", documentId)
    .executeTakeFirst();
  if (!row) return undefined;
  return {
    ordinal: Number(row.ordinal),
    removedRows: row.removedRows,
    purgedAtUtc: new Date(row.purgedAtUtc),
  };
}

/** Appends one audit row; every string in `detail` is redacted first. */
export async function appendAudit(
  db: ErasureDb,
  secret: DeploymentSecret,
  entry: {
    requestId: string;
    documentId: string | null;
    event: ErasureAuditEvent;
    detail?: unknown;
    at: Date;
  },
): Promise<void> {
  const detail =
    entry.detail === undefined
      ? null
      : JSON.stringify(redactDetail(secret, entry.detail));
  await db
    .insertInto("erasure_audit")
    .values({
      requestId: entry.requestId,
      documentId: entry.documentId,
      event: entry.event,
      detail: detail === null ? null : sql`${detail}::jsonb`,
      atUtc: entry.at,
    })
    .execute();
}

export type AuditRow = {
  event: ErasureAuditEvent;
  detail: unknown;
  atUtc: Date;
};

export async function auditOf(
  db: ErasureDb,
  requestId: string,
  documentId: string | null,
  events: ErasureAuditEvent[],
): Promise<AuditRow[]> {
  let query = db
    .selectFrom("erasure_audit")
    .select(["event", "detail", "atUtc"])
    .where("requestId", "=", requestId)
    .where("event", "in", events)
    .orderBy("ordinal");
  query =
    documentId === null
      ? query.where("documentId", "is", null)
      : query.where("documentId", "=", documentId);
  return query.execute();
}
