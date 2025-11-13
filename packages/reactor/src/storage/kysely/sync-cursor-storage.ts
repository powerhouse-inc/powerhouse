import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { ISyncCursorStorage } from "../interfaces.js";
import type { RemoteCursor } from "../../sync/types.js";
import type {
  Database,
  SyncCursorRow,
  InsertableSyncCursor,
} from "./types.js";

function rowToRemoteCursor(row: SyncCursorRow): RemoteCursor {
  return {
    remoteName: row.remoteName,
    cursorOrdinal: Number(row.cursorOrdinal),
    lastSyncedAtUtcMs: row.lastSyncedAtUtcMs
      ? Number(row.lastSyncedAtUtcMs)
      : undefined,
  };
}

function remoteCursorToRow(cursor: RemoteCursor): InsertableSyncCursor {
  return {
    remoteName: cursor.remoteName,
    cursorOrdinal: BigInt(cursor.cursorOrdinal),
    lastSyncedAtUtcMs: cursor.lastSyncedAtUtcMs
      ? BigInt(cursor.lastSyncedAtUtcMs)
      : null,
  };
}

export class KyselySyncCursorStorage implements ISyncCursorStorage {
  constructor(private db: Kysely<Database>) {}

  async list(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remoteName", "=", remoteName)
      .execute();

    return rows.map(rowToRemoteCursor);
  }

  async get(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const row = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remoteName", "=", remoteName)
      .executeTakeFirst();

    if (!row) {
      return {
        remoteName,
        cursorOrdinal: 0,
      };
    }

    return rowToRemoteCursor(row);
  }

  async upsert(cursor: RemoteCursor, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      const insertable = remoteCursorToRow(cursor);

      await trx
        .insertInto("sync_cursors")
        .values(insertable)
        .onConflict((oc) =>
          oc.column("remoteName").doUpdateSet({
            ...insertable,
            updatedAt: sql`NOW()`,
          }),
        )
        .execute();
    });
  }

  async remove(remoteName: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("sync_cursors")
        .where("remoteName", "=", remoteName)
        .execute();
    });
  }
}
