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

/**
 * The head index of each scope in a document's branch, as a skip scan: a
 * recursive CTE hops from one distinct scope to the next (`scope >` the
 * previous, one unique_revision probe each), then a backward probe per scope
 * reads its largest index. The cost follows the number of scopes, not the
 * number of operations. A scope that exists only on another branch comes back
 * with a null index; callers drop rows where either column is null.
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
                .selectFrom("Operation as o")
                .select("o.scope")
                .where("o.documentId", "=", documentId)
                .whereRef("o.scope", ">", "s.scope")
                .orderBy("o.scope")
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
        .selectFrom("Operation as o")
        .select("o.index")
        .where("o.documentId", "=", documentId)
        .whereRef("o.scope", "=", "s.scope")
        .where("o.branch", "=", branch)
        .orderBy("o.index", "desc")
        .limit(1)
        .as("index"),
    ])
    .where("s.scope", "is not", null);
}
