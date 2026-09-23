import type { Kysely, Transaction } from "kysely";
import { sql } from "kysely";
import type { Database } from "../../core/types.js";
import type {
  OrdinalRange,
  PurgeDirective,
  PurgeRows,
} from "../../shared/purge-types.js";
import {
  findPurgedIds,
  PURGE_LOCK_KEY,
  purgeLockKey,
  takePurgeLocks,
} from "./document-purge-gate.js";

/** Bounds one delete statement, not the transaction: its locks last to commit. */
export const DEFAULT_PURGE_DELETE_BATCH = 5000;

export type PurgeJournalEntry = {
  ordinal: number;
  documentId: string;
  directiveId: string;
  purgedBy: string | null;
  purgedOrdinals: OrdinalRange[];
};

type PurgeDatabase = Pick<Database, "document_purges">;

/** Journal rows above `afterOrdinal`, in ordinal order. */
export async function readPurgeJournal<DB>(
  db: Kysely<DB> | Transaction<DB>,
  afterOrdinal: number,
  limit = 500,
): Promise<PurgeJournalEntry[]> {
  const rows = await (db as unknown as Kysely<PurgeDatabase>)
    .selectFrom("document_purges")
    .select([
      "ordinal",
      "documentId",
      "directiveId",
      "purgedBy",
      sql<
        Array<[number | string, number | string]>
      >`(select coalesce(json_agg(json_build_array(lower(r), upper(r) - 1) order by lower(r)), '[]'::json) from unnest("purgedOrdinals") as r)`.as(
        "ranges",
      ),
    ])
    .where("ordinal", ">", afterOrdinal)
    .orderBy("ordinal", "asc")
    .limit(limit)
    .execute();

  return rows.map((row) => ({
    ordinal: Number(row.ordinal),
    documentId: row.documentId,
    directiveId: row.directiveId,
    purgedBy: row.purgedBy,
    purgedOrdinals: row.ranges.map(([from, to]) => ({
      from: Number(from),
      to: Number(to),
    })),
  }));
}

/** Every tombstoned id. */
export async function listPurgedDocumentIds<DB>(
  db: Kysely<DB> | Transaction<DB>,
): Promise<string[]> {
  const rows = await (db as unknown as Kysely<PurgeDatabase>)
    .selectFrom("document_purges")
    .select("documentId")
    .execute();
  return rows.map((row) => row.documentId);
}

/** Owns the SQL that removes a document from every reactor-schema table. */
export class KyselyDocumentPurger {
  constructor(
    private readonly db: Kysely<Database>,
    private readonly deleteBatch: number = DEFAULT_PURGE_DELETE_BATCH,
  ) {}

  /** One transaction under the purge lock; appends one tombstone per new id. */
  async purge(ids: string[], directive: PurgeDirective): Promise<PurgeRows> {
    const unique = [...new Set(ids)];

    return this.db.transaction().execute(async (trx) => {
      await takePurgeLocks(trx, [PURGE_LOCK_KEY], "exclusive");
      await takePurgeLocks(trx, unique.map(purgeLockKey), "exclusive");

      const alreadyPurged = await findPurgedIds(trx, unique);
      const purged = unique.filter((id) => !alreadyPurged.includes(id));
      if (purged.length === 0) {
        return { purged, alreadyPurged, rowsDeleted: {}, purgedOrdinals: {} };
      }

      const { rowsDeleted, purgedOrdinals } = await this.deleteRows(
        trx,
        purged,
      );

      const purgedAtUtc = new Date();
      for (const documentId of purged) {
        await trx
          .insertInto("document_purges")
          .values({
            documentId,
            directiveId: directive.directiveId,
            purgedOrdinals: rangesArray(purgedOrdinals[documentId] ?? []),
            purgedAtUtc,
            purgedBy: directive.purgedBy ?? null,
          })
          .execute();
      }

      return { purged, alreadyPurged, rowsDeleted, purgedOrdinals };
    });
  }

  /** Idempotent: deletes rows that arrived for ids already tombstoned. */
  async sweep(ids: string[]): Promise<PurgeRows> {
    const unique = [...new Set(ids)];

    return this.db.transaction().execute(async (trx) => {
      await takePurgeLocks(trx, unique.map(purgeLockKey), "exclusive");

      const tombstoned = await findPurgedIds(trx, unique);
      if (tombstoned.length === 0) {
        return {
          purged: [],
          alreadyPurged: [],
          rowsDeleted: {},
          purgedOrdinals: {},
        };
      }

      const { rowsDeleted, purgedOrdinals } = await this.deleteRows(
        trx,
        tombstoned,
      );

      // A swept index row is a new gap, and a gap-parking cursor must see it.
      for (const [documentId, ranges] of Object.entries(purgedOrdinals)) {
        if (ranges.length === 0) continue;
        await trx
          .updateTable("document_purges")
          .set({
            purgedOrdinals: sql`"purgedOrdinals" || ${rangesArray(ranges)}`,
          })
          .where("documentId", "=", documentId)
          .execute();
      }

      return {
        purged: [],
        alreadyPurged: tombstoned,
        rowsDeleted,
        purgedOrdinals,
      };
    });
  }

  private async deleteRows(
    trx: Transaction<Database>,
    ids: string[],
  ): Promise<Pick<PurgeRows, "rowsDeleted" | "purgedOrdinals">> {
    const rowsDeleted: Record<string, number> = {};
    const count = (table: string, n: number | bigint) => {
      rowsDeleted[table] = (rowsDeleted[table] ?? 0) + Number(n);
    };

    const purgedOrdinals = await this.ordinalRanges(trx, ids);

    for (const id of ids) {
      const result = await trx
        .deleteFrom("document_collections")
        .where((eb) =>
          eb.or([
            eb("documentId", "=", id),
            eb.and([
              eb("collectionId", "like", "drive.%"),
              eb(
                sql<string>`right("collectionId", ${id.length + 1})`,
                "=",
                `.${id}`,
              ),
            ]),
          ]),
        )
        .executeTakeFirst();
      count("document_collections", result.numDeletedRows);
    }

    const small = [
      ["group_references", "documentId"],
      ["sync_dead_letters", "document_id"],
      ["ProcessorCursor", "driveId"],
      ["DocumentSnapshot", "documentId"],
      ["SlugMapping", "documentId"],
      ["Document", "id"],
    ] as const;
    for (const [table, column] of small) {
      // Each of these keys its rows by a text id column.
      const result = await trx
        .deleteFrom(table as "Document")
        .where(column as "id", "in", ids)
        .executeTakeFirst();
      count(table, result.numDeletedRows);
    }

    count("Keyframe", await this.deleteBatched(trx, "Keyframe", ids));
    count("Operation", await this.deleteBatched(trx, "Operation", ids));
    count(
      "operation_index_operations",
      await this.deleteBatched(trx, "operation_index_operations", ids),
    );

    count("sync_remotes", await this.stripRemoteFilters(trx, ids));

    return { rowsDeleted, purgedOrdinals };
  }

  private async deleteBatched(
    trx: Transaction<Database>,
    table: "Keyframe" | "Operation" | "operation_index_operations",
    ids: string[],
  ): Promise<number> {
    const key = table === "operation_index_operations" ? "ordinal" : "id";
    let total = 0;

    for (;;) {
      // One shape for all three tables: each has documentId and a numeric key.
      const batch = trx
        .selectFrom(table as "Operation")
        .select(key as "id")
        .where("documentId", "in", ids)
        .limit(this.deleteBatch);
      const result = await trx
        .deleteFrom(table as "Operation")
        .where(key as "id", "in", batch)
        .executeTakeFirst();

      const deleted = Number(result.numDeletedRows);
      total += deleted;
      if (deleted < this.deleteBatch) return total;
    }
  }

  /** Runs of consecutive ordinals per id, from the rows about to go. */
  private async ordinalRanges(
    trx: Transaction<Database>,
    ids: string[],
  ): Promise<Record<string, OrdinalRange[]>> {
    const rows = await trx
      .selectFrom(
        trx
          .selectFrom("operation_index_operations")
          .select([
            "documentId",
            "ordinal",
            sql<number>`ordinal - row_number() over (partition by "documentId" order by ordinal)`.as(
              "run",
            ),
          ])
          .where("documentId", "in", ids)
          .as("t"),
      )
      .select([
        "t.documentId",
        sql<number | string>`min(t.ordinal)`.as("lo"),
        sql<number | string>`max(t.ordinal)`.as("hi"),
      ])
      .groupBy(["t.documentId", "t.run"])
      .orderBy("lo", "asc")
      .execute();

    const ranges: Record<string, OrdinalRange[]> = {};
    for (const row of rows) {
      (ranges[row.documentId] ??= []).push({
        from: Number(row.lo),
        to: Number(row.hi),
      });
    }
    return ranges;
  }

  /** Emptying a filter would widen it to the whole collection, so one never is. */
  private async stripRemoteFilters(
    trx: Transaction<Database>,
    ids: string[],
  ): Promise<number> {
    const remotes = await trx
      .selectFrom("sync_remotes")
      .select(["name", "filter_document_ids"])
      .execute();

    let updated = 0;
    for (const remote of remotes) {
      const filter = (remote.filter_document_ids ?? []) as string[];
      const kept = filter.filter((id) => !ids.includes(id));
      if (kept.length === filter.length || kept.length === 0) continue;

      await trx
        .updateTable("sync_remotes")
        .set({ filter_document_ids: JSON.stringify(kept) })
        .where("name", "=", remote.name)
        .execute();
      updated++;
    }
    return updated;
  }
}

function rangesArray(ranges: OrdinalRange[]) {
  if (ranges.length === 0) {
    return sql<unknown>`'{}'::int8range[]`;
  }
  return sql<unknown>`array[${sql.join(
    ranges.map(
      (range) =>
        sql`int8range(${range.from}::bigint, ${range.to}::bigint, '[]')`,
    ),
  )}]::int8range[]`;
}
