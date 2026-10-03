import type { Kysely } from "kysely";
import { sql } from "kysely";
import type { RemoteCursor } from "../../sync/types.js";
import type { ISyncCursorStorage } from "../interfaces.js";
import type { IStorageFlusher } from "../storage-flush.js";
import { NoopStorageFlusher } from "../storage-flush.js";
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

export class KyselySyncCursorStorage implements ISyncCursorStorage {
  private readonly flusher: IStorageFlusher;

  constructor(
    private readonly db: Kysely<Database>,
    flusher: IStorageFlusher = new NoopStorageFlusher(),
  ) {
    this.flusher = flusher;
  }

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

  async get(
    remoteName: string,
    cursorType: "inbox" | "outbox",
    signal?: AbortSignal,
  ): Promise<RemoteCursor> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    const row = await this.db
      .selectFrom("sync_cursors")
      .selectAll()
      .where("remote_name", "=", remoteName)
      .where("cursor_type", "=", cursorType)
      .executeTakeFirst();

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    if (!row) {
      return {
        remoteName,
        cursorType,
        cursorOrdinal: 0,
      };
    }

    return rowToRemoteCursor(row);
  }

  /**
   * Writes a cursor row, but never before the data it covers is durable.
   *
   * This is durability boundary 1 of {@link IStorageFlusher}. A persisted
   * cursor is a promise that everything up to it has been applied and need
   * never be sent again; a cursor durable ahead of its data is the
   * permanent-gap mechanism of the live incident - the rolled-back tail is
   * never re-pulled, and every later operation touching those documents
   * dead-letters with a missing ancestor. So the flush comes first, and a
   * flush that fails takes the cursor write with it, leaving the caller's
   * watermark where it was so the next advance retries.
   *
   * The cursor row itself is deliberately NOT flushed afterwards: a crash
   * between the two loses the advance but keeps the data, and a re-pull of
   * already-applied operations is idempotent. The next flush - which covers
   * strictly more data - makes the row durable. The one direction that is never
   * allowed is the reverse.
   */
  async upsert(cursor: RemoteCursor, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

    await this.flusher.flush();

    if (signal?.aborted) {
      throw new Error("Operation aborted");
    }

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
