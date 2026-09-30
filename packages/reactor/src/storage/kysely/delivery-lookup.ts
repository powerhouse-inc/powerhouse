import type { Kysely } from "kysely";
import type { OperationIndexEntry } from "../../cache/operation-index-types.js";
import type { DeliveryRow } from "../../sync/delivery-tracking.js";
import type { Database } from "./types.js";

/** The index row at `ordinal` and every membership of its document. */
export async function deliveryAt(
  db: Kysely<Database>,
  documentId: string,
  ordinal: number,
): Promise<DeliveryRow | undefined> {
  const row = await db
    .selectFrom("operation_index_operations")
    .selectAll()
    .where("ordinal", "=", ordinal)
    .where("documentId", "=", documentId)
    .executeTakeFirst();
  if (!row) return undefined;

  const memberships = await db
    .selectFrom("document_collections")
    .select(["collectionId", "joinedOrdinal", "leftOrdinal"])
    .where("documentId", "=", documentId)
    .execute();

  const entry: OperationIndexEntry = {
    ordinal: row.ordinal,
    documentId: row.documentId,
    documentType: row.documentType,
    branch: row.branch,
    scope: row.scope,
    index: row.index,
    timestampUtcMs: row.timestampUtcMs,
    hash: row.hash,
    skip: row.skip,
    action: row.action as OperationIndexEntry["action"],
    deniedReason: row.deniedReason ?? undefined,
    id: row.opId,
    sourceRemote: row.sourceRemote,
  };
  return {
    entry,
    memberships: memberships.map((membership) => ({
      collectionId: membership.collectionId,
      joinedOrdinal: Number(membership.joinedOrdinal),
      leftOrdinal:
        membership.leftOrdinal === null ? null : Number(membership.leftOrdinal),
    })),
  };
}
