import type { ILogger } from "document-model";
import { sql, type Kysely } from "kysely";
import { createKyselyWatermarkProbe } from "../catch-up/settled-watermark.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";
import {
  RELEASED_CURSOR_STATUS,
  SKIPPED_DOCUMENT_MARKER,
  type DocumentViewDatabase,
} from "./types.js";

export type CursorRowsDatabase = StorageDatabase & DocumentViewDatabase;

export type CatchUpCursorKind = "read-model" | "processor";

export type CatchUpCursorRow = {
  kind: CatchUpCursorKind;
  id: string;
  lastOrdinal: number;
};

/** Every read model and live processor cursor; skipped-document records left out. */
export async function readCursors(
  db: Kysely<CursorRowsDatabase>,
): Promise<CatchUpCursorRow[]> {
  const views = await db
    .selectFrom("ViewState")
    .select(["readModelId", "lastOrdinal"])
    .where("readModelId", "not like", `%${SKIPPED_DOCUMENT_MARKER}%`)
    .orderBy("readModelId")
    .execute();
  const processors = await db
    .selectFrom("ProcessorCursor")
    .select(["processorId", "lastOrdinal"])
    .where("status", "!=", RELEASED_CURSOR_STATUS)
    .orderBy("processorId")
    .execute();
  return [
    ...views.map((row) => ({
      kind: "read-model" as const,
      id: row.readModelId,
      lastOrdinal: row.lastOrdinal,
    })),
    ...processors.map((row) => ({
      kind: "processor" as const,
      id: row.processorId,
      lastOrdinal: row.lastOrdinal,
    })),
  ];
}

/** Lowers the given cursors to at most `to`, never raising one. */
export async function lowerCursors(
  db: Kysely<CursorRowsDatabase>,
  cursors: readonly CatchUpCursorRow[],
  to: number,
): Promise<void> {
  const lower = (column: string) =>
    sql<number>`least(${sql.ref(column)}, ${to})`;
  const viewIds = cursors
    .filter((cursor) => cursor.kind === "read-model")
    .map((cursor) => cursor.id);
  if (viewIds.length > 0) {
    await db
      .updateTable("ViewState")
      .set({ lastOrdinal: lower("lastOrdinal") })
      .where("readModelId", "in", viewIds)
      .execute();
  }
  const processorIds = cursors
    .filter((cursor) => cursor.kind === "processor")
    .map((cursor) => cursor.id);
  if (processorIds.length > 0) {
    await db
      .updateTable("ProcessorCursor")
      .set({ lastOrdinal: lower("lastOrdinal") })
      .where("processorId", "in", processorIds)
      .execute();
  }
}

/**
 * Lowers each chosen cursor that is above the ordinal sequence's head to that
 * head, logging an error for each. A cursor passes the head only when the
 * index lost its newest rows while the cursors survived, as in a failover onto
 * a lagging replica: the sequence then hands those ordinals out again, and a
 * consumer left above them skips every new operation. Run at boot, before the
 * consumer catches up; a store it cannot probe is left as it is.
 */
export async function lowerCursorsAboveHead(
  db: Kysely<CursorRowsDatabase>,
  choose: (cursor: CatchUpCursorRow) => boolean,
  logger: ILogger,
): Promise<CatchUpCursorRow[]> {
  let head: number;
  let ahead: CatchUpCursorRow[];
  try {
    const probe = createKyselyWatermarkProbe(
      db as unknown as Kysely<StorageDatabase>,
    );
    // Above any head, so the probe takes no xid.
    head = (await probe(Number.MAX_SAFE_INTEGER)).head;
    ahead = (await readCursors(db)).filter(
      (cursor) => cursor.lastOrdinal > head && choose(cursor),
    );
  } catch (error) {
    logger.warn(
      "could not compare cursors with the operation index head at boot: @error",
      error,
    );
    return [];
  }
  if (ahead.length === 0) return [];

  for (const cursor of ahead) {
    logger.error(
      "@kind @consumer cursor @cursor is above the operation index head @head; " +
        "the index lost its newest operations (a database failover?). " +
        "Lowering the cursor to the head so new operations are not skipped",
      cursor.kind,
      cursor.id,
      cursor.lastOrdinal,
      head,
    );
  }
  await lowerCursors(db, ahead, head);
  return ahead;
}
