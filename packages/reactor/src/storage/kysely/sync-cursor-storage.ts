import type { Kysely } from "kysely";
import { sql } from "kysely";
import { throwIfAborted } from "../../shared/utils.js";
import type { RemoteCursor } from "../../sync/types.js";
import type { ISyncCursorStorage } from "../interfaces.js";
import type { Database, InsertableSyncCursor, SyncCursorRow } from "./types.js";

function rowToRemoteCursor(row: SyncCursorRow): RemoteCursor {
  return {
    remoteName: row.remote_name,
    cursorType: row.cursor_type as "inbox" | "outbox",
    cursorOrdinal: Number(row.cursor_ordinal),
    lastSyncedAtUtcMs: row.last_synced_at_utc_ms
      ? new Date(row.last_synced_at_utc_ms).getTime()
      : undefined,
  };
}

function remoteCursorToRow(cursor: RemoteCursor): InsertableSyncCursor {
  return {
    remote_name: cursor.remoteName,
    cursor_type: cursor.cursorType,
    cursor_ordinal: BigInt(cursor.cursorOrdinal),
    last_synced_at_utc_ms: cursor.lastSyncedAtUtcMs
      ? new Date(cursor.lastSyncedAtUtcMs).toISOString()
      : null,
  };
}

/**
 * Cursor rows in the reactor's own store.
 *
 * It persists cursors and nothing else. Durability boundary 1 - no cursor row
 * durable ahead of the operations it covers - is enforced one seam out by
 * {@link FlushGuardedSyncCursorStorage}, which wraps whatever cursor storage
 * the sync module ends up with. Putting the barrier in the decorator rather
 * than here is what makes it hold for a caller-supplied storage too.
 */
export class KyselySyncCursorStorage implements ISyncCursorStorage {
  constructor(private readonly db: Kysely<Database>) {}

  async list(
    remoteName: string,
    signal?: AbortSignal,
  ): Promise<RemoteCursor[]> {
    throwIfAborted(signal);

    const rows = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remote_name", "=", remoteName)
      .execute();

    throwIfAborted(signal);

    return rows.map(rowToRemoteCursor);
  }

  async get(
    remoteName: string,
    cursorType: "inbox" | "outbox",
    signal?: AbortSignal,
  ): Promise<RemoteCursor> {
    throwIfAborted(signal);

    const row = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remote_name", "=", remoteName)
      .where("cursor_type", "=", cursorType)
      .executeTakeFirst();

    throwIfAborted(signal);

    if (!row) {
      return {
        remoteName,
        cursorType,
        cursorOrdinal: 0,
      };
    }

    return rowToRemoteCursor(row);
  }

  async upsert(cursor: RemoteCursor, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    await this.db.transaction().execute(async (trx) => {
      const insertable = remoteCursorToRow(cursor);

      await trx
        .insertInto("sync_cursors")
        .values(insertable)
        .onConflict((oc) =>
          oc.columns(["remote_name", "cursor_type"]).doUpdateSet({
            ...insertable,
            updated_at: sql`NOW()`,
          }),
        )
        .execute();
    });

    throwIfAborted(signal);
  }

  async remove(remoteName: string, signal?: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("sync_cursors")
        .where("remote_name", "=", remoteName)
        .execute();
    });

    throwIfAborted(signal);
  }
}
