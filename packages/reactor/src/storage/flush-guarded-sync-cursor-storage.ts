import type { RemoteCursor } from "../sync/types.js";
import type { ISyncCursorStorage } from "./interfaces.js";
import type { IStorageFlusher } from "./storage-flush.js";
import { StorageEpochSupersededError } from "./storage-flush.js";

/**
 * Durability boundary 1 of {@link IStorageFlusher}, as a seam rather than as
 * part of one storage implementation.
 *
 * A persisted cursor is a promise that everything up to it has been applied and
 * need never be sent again. A cursor durable ahead of its data is the
 * permanent-gap mechanism of the live incident: the rolled-back tail is never
 * re-pulled, and every later operation touching those documents dead-letters
 * with a missing ancestor. So the flush comes first, and a flush that fails
 * takes the cursor write with it, leaving the caller's watermark where it was
 * so the next advance retries.
 *
 * The cursor row itself is deliberately NOT flushed afterwards: a crash between
 * the two loses the advance but keeps the data, and a re-pull of already-applied
 * operations is idempotent. The next flush - which covers strictly more data -
 * makes the row durable. The one direction that is never allowed is the reverse.
 *
 * Wrapping instead of inlining matters because the sync module accepts a
 * caller-supplied {@link ISyncCursorStorage}, and a future one (the stage-1
 * LocalChannel) would otherwise have to remember the invariant for itself.
 * Every cursor write in the system - inbox, outbox, the rewind lever, and the
 * response channel - goes through one of these.
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

  /**
   * Flushes the data this cursor covers, then writes the row - and refuses the
   * write if the store's session was replaced around either step.
   *
   * The epoch check is the half a flush alone cannot give: a flush that
   * succeeded against an instance which is then recreated covered data that has
   * since fallen back to the last durable snapshot, so writing the row would
   * persist exactly the advance-past-missing-data this boundary exists to
   * prevent. On a mismatch the write is refused with
   * {@link StorageEpochSupersededError}; the channel re-initialises from the
   * last row that did stand, which is at or behind durable data, and re-pulls
   * the tail.
   *
   * The token is read BEFORE the flush and compared after the write, so the
   * whole window is bracketed. That includes a recreate that happened just
   * before the flush: the operations this cursor describes were applied to the
   * previous incarnation, so they fell back with it, and a flush issued after
   * the swap covers different data than the caller believes.
   *
   * What remains is a crash-window, not a correctness hole: the inner write's
   * statements run against whichever incarnation is live when they execute, so
   * a recreate landing inside the write leaves the row in the replacement's
   * memory, UNFLUSHED, while this call refuses. The next flush would make it
   * durable - which is why the recreate also resets every channel, re-reading
   * cursors and re-pulling from them. Closing it completely needs the cursor
   * row to be written in the same transaction as the operations it covers,
   * which is a property only a local channel can have.
   */
  async upsert(cursor: RemoteCursor, signal?: AbortSignal): Promise<void> {
    const flushedEpoch = this.flusher.storageEpoch;
    await this.flusher.flush();

    await this.inner.upsert(cursor, signal);

    if (this.flusher.storageEpoch !== flushedEpoch) {
      throw new StorageEpochSupersededError(
        `The storage session was replaced while the ${cursor.cursorType} cursor for '${cursor.remoteName}' was being written, so the operations the flush covered fell back to the last durable snapshot. The cursor advance to ${cursor.cursorOrdinal} is refused; the channel re-initialises from the last cursor that stood and re-pulls the tail.`,
      );
    }
  }

  /**
   * Removing a cursor needs no barrier: forgetting an advance is the safe
   * direction, and a crash that loses the removal leaves a cursor that is still
   * behind durable data.
   */
  remove(remoteName: string, signal?: AbortSignal): Promise<void> {
    return this.inner.remove(remoteName, signal);
  }
}
