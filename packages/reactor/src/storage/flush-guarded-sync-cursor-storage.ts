import type { RemoteCursor } from "../sync/types.js";
import type { ISyncCursorStorage } from "./interfaces.js";
import type { IStorageFlusher } from "./storage-flush.js";

/**
 * Durability boundary 1 as a seam around whatever cursor storage sync uses: no
 * cursor row is written before a flush covering its operations, and a failed
 * flush takes the write with it. The row itself is not flushed after: a crash
 * then loses the advance, never the data, and a re-pull is idempotent.
 */
export class FlushGuardedSyncCursorStorage implements ISyncCursorStorage {
  constructor(
    private readonly inner: ISyncCursorStorage,
    private readonly flusher: IStorageFlusher,
  ) {}

  list(remoteName: string, signal?: AbortSignal): Promise<RemoteCursor[]> {
    return this.inner.list(remoteName, signal);
  }

  get(
    remoteName: string,
    cursorType: "inbox" | "outbox",
    signal?: AbortSignal,
  ): Promise<RemoteCursor> {
    return this.inner.get(remoteName, cursorType, signal);
  }

  async upsert(cursor: RemoteCursor, signal?: AbortSignal): Promise<void> {
    await this.flusher.flush();
    await this.inner.upsert(cursor, signal);
  }

  /** Forgetting an advance is the safe direction, so it needs no barrier. */
  remove(remoteName: string, signal?: AbortSignal): Promise<void> {
    return this.inner.remove(remoteName, signal);
  }
}
