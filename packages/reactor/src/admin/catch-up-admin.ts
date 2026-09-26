import { ConsoleLogger } from "document-model";
import { sql, type Kysely } from "kysely";
import {
  createKyselyWatermarkProbe,
  describeWaitingSessions,
  SettledWatermark,
  type WatermarkSession,
} from "../catch-up/settled-watermark.js";
import type { DocumentViewDatabase } from "../read-models/types.js";
import type { Database as StorageDatabase } from "../storage/kysely/types.js";

export type CatchUpAdminDatabase = StorageDatabase & DocumentViewDatabase;

export type CatchUpCursorKind = "read-model" | "processor";

export type CatchUpCursorRow = {
  kind: CatchUpCursorKind;
  id: string;
  lastOrdinal: number;
};

export type CatchUpStoreStatus = {
  head: number;
  settledThrough: number;
  waitingOn: string[];
  sessions: WatermarkSession[];
  cursors: Array<CatchUpCursorRow & { lag: number }>;
};

export type RescanChange = CatchUpCursorRow & { lowered: number };

export type RescanResult = {
  changes: RescanChange[];
  /** Index rows above --from: what the lowered consumers will replay. */
  rowsAbove: number;
};

export type RescanRequest = {
  from: number;
  consumers: string[];
  all: boolean;
  dryRun: boolean;
};

async function readCursors(
  db: Kysely<CatchUpAdminDatabase>,
): Promise<CatchUpCursorRow[]> {
  const views = await db
    .selectFrom("ViewState")
    .select(["readModelId", "lastOrdinal"])
    .orderBy("readModelId")
    .execute();
  const processors = await db
    .selectFrom("ProcessorCursor")
    .select(["processorId", "lastOrdinal"])
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

/** One probe, the sessions it waits on, and every cursor with its lag. */
export async function readCatchUpStatus(
  db: Kysely<CatchUpAdminDatabase>,
): Promise<CatchUpStoreStatus> {
  const watermark = new SettledWatermark(
    createKyselyWatermarkProbe(db as unknown as Kysely<StorageDatabase>),
    new ConsoleLogger(["catchup"]),
  );
  await watermark.refresh();
  const { head, settledThrough, waitingOn } = watermark.status();
  const sessions = await describeWaitingSessions(db, waitingOn);
  const cursors = await readCursors(db);
  return {
    head,
    settledThrough,
    waitingOn,
    sessions,
    cursors: cursors.map((cursor) => ({
      ...cursor,
      lag: Math.max(0, head - cursor.lastOrdinal),
    })),
  };
}

/** Lowers the chosen cursors to at most `from`. */
export async function rescanCatchUp(
  db: Kysely<CatchUpAdminDatabase>,
  request: RescanRequest,
): Promise<RescanResult> {
  const cursors = await readCursors(db);
  const chosen = request.all
    ? cursors
    : cursors.filter((cursor) => request.consumers.includes(cursor.id));
  if (!request.all) {
    const missing = request.consumers.filter(
      (id) => !cursors.some((cursor) => cursor.id === id),
    );
    if (missing.length > 0) {
      throw new Error(`No cursor row for: ${missing.join(", ")}`);
    }
  }

  const counted = await db
    .selectFrom("operation_index_operations")
    .select((eb) => eb.fn.countAll<string | number>().as("count"))
    .where("ordinal", ">", request.from)
    .executeTakeFirst();
  const changes = chosen.map((cursor) => ({
    ...cursor,
    lowered: Math.min(cursor.lastOrdinal, request.from),
  }));
  const result = { changes, rowsAbove: Number(counted?.count ?? 0) };
  if (request.dryRun) return result;

  const lower = (column: string) =>
    sql<number>`least(${sql.ref(column)}, ${request.from})`;
  const viewIds = chosen
    .filter((cursor) => cursor.kind === "read-model")
    .map((cursor) => cursor.id);
  if (viewIds.length > 0) {
    await db
      .updateTable("ViewState")
      .set({ lastOrdinal: lower("lastOrdinal") })
      .where("readModelId", "in", viewIds)
      .execute();
  }
  const processorIds = chosen
    .filter((cursor) => cursor.kind === "processor")
    .map((cursor) => cursor.id);
  if (processorIds.length > 0) {
    await db
      .updateTable("ProcessorCursor")
      .set({ lastOrdinal: lower("lastOrdinal") })
      .where("processorId", "in", processorIds)
      .execute();
  }
  return result;
}
