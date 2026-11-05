import { sql, type Kysely } from "kysely";
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
