import type { Kysely, Transaction } from "kysely";
import type { Database } from "./types.js";

/**
 * The largest timestamp in a document's branch. Asked separately from the scope
 * heads because the largest timestamp is not always on the last-indexed
 * operation: a reshuffle can leave a later one behind it.
 */
export function latestTimestampQuery(
  db: Kysely<Database> | Transaction<Database>,
  documentId: string,
  branch: string,
) {
  return db
    .selectFrom("Operation")
    .select((eb) => eb.fn.max("timestampUtcMs").as("latestTimestamp"))
    .where("documentId", "=", documentId)
    .where("branch", "=", branch);
}
