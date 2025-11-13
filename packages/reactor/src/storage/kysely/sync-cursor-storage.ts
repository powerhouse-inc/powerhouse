import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { RemoteCursor } from "../../sync/types.js";
import type { ISyncCursorStorage } from "../interfaces.js";
import type { Database, InsertableSyncCursor, SyncCursorRow } from "./types.js";

function rowToRemoteCursor(row: SyncCursorRow): RemoteCursor {
  return {
    remoteName: row.remote_name,
    cursorOrdinal: Number(row.cursor_ordinal),
    lastSyncedAtUtcMs: row.last_synced_at_utc_ms
      ? Number(row.last_synced_at_utc_ms)
      : undefined,
  };
}

function remoteCursorToRow(cursor: RemoteCursor): InsertableSyncCursor {
  return {
    remote_name: cursor.remoteName,
    cursor_ordinal: BigInt(cursor.cursorOrdinal),
    last_synced_at_utc_ms: cursor.lastSyncedAtUtcMs
      ? BigInt(cursor.lastSyncedAtUtcMs)
      : null,
  };
}

export class KyselySyncCursorStorage implements ISyncCursorStorage {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    remoteName: string,
    signal?: AbortSignal,
  ): Promise<RemoteCursor[]> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const rows = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remote_name", "=", remoteName)
      .execute();

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    return rows.map(rowToRemoteCursor);
  }

  async get(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const row = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remote_name", "=", remoteName)
      .executeTakeFirst();

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

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
          oc.column("remote_name").doUpdateSet({
            ...insertable,
            updated_at: sql`NOW()`,
          }),
        )
        .execute();
    });

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }

  async remove(remoteName: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("sync_cursors")
        .where("remote_name", "=", remoteName)
        .execute();
    });

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }
  }
}
