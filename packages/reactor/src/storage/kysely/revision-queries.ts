import type { Kysely, Transaction } from "kysely";
import type { Database } from "./types.js";

/**
 * The largest timestamp in one stream (document, scope, branch): a single
 * probe of idx_operation_scope_timestamp.
 */
export function streamLatestTimestampQuery(
  db: Kysely<Database> | Transaction<Database>,
  documentId: string,
  scope: string,
  branch: string,
) {
  return db
    .selectFrom("Operation")
    .select((eb) => eb.fn.max("timestampUtcMs").as("latestTimestamp"))
    .where("documentId", "=", documentId)
    .where("scope", "=", scope)
    .where("branch", "=", branch);
}

/**
 * The head index and newest timestamp of each scope in a document's branch, in
 * one skip scan: a recursive CTE hops from one distinct scope to the next
 * (`scope >` the previous, one index probe each), then per scope a backward
 * probe of unique_revision reads its largest index and a probe of
 * idx_operation_scope_timestamp reads its newest timestamp. The cost follows
 * the number of scopes, not the number of operations.
 *
 * The largest timestamp is not always on the last-indexed operation (a
 * reshuffle can leave a later one behind it), but the document's largest
 * timestamp is the largest of its scopes' newest ones, so callers take the max
 * of `latestTimestamp` over the rows. A scope that exists only on another
 * branch comes back with null index and timestamp; callers drop rows where
 * either is null.
 */
export function scopeHeadsQuery(
  db: Kysely<Database> | Transaction<Database>,
  documentId: string,
  branch: string,
) {
  return db
    .withRecursive("scopes(scope)", (qb) =>
      qb
        .selectNoFrom((eb) =>
          eb
            .selectFrom("Operation")
            .select("scope")
            .where("documentId", "=", documentId)
            .orderBy("scope")
            .limit(1)
            .as("scope"),
        )
        .unionAll((eb) =>
          eb
            .selectFrom("scopes as s")
            .select((eb2) =>
              eb2
                .selectFrom("Operation as hop")
                .select("hop.scope")
                .where("hop.documentId", "=", documentId)
                .whereRef("hop.scope", ">", "s.scope")
                .orderBy("hop.scope")
                .limit(1)
                .as("scope"),
            )
            .where("s.scope", "is not", null),
        ),
    )
    .selectFrom("scopes as s")
    .select((eb) => [
      "s.scope",
      eb
        .selectFrom("Operation as head")
        .select("head.index")
        .where("head.documentId", "=", documentId)
        .whereRef("head.scope", "=", "s.scope")
        .where("head.branch", "=", branch)
        .orderBy("head.index", "desc")
        .limit(1)
        .as("index"),
      eb
        .selectFrom("Operation as ts")
        .select("ts.timestampUtcMs")
        .where("ts.documentId", "=", documentId)
        .whereRef("ts.scope", "=", "s.scope")
        .where("ts.branch", "=", branch)
        .orderBy("ts.timestampUtcMs", "desc")
        .limit(1)
        .as("latestTimestamp"),
    ])
    .where("s.scope", "is not", null);
}
