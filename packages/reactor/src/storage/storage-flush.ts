/**
 * The durability barrier the reactor's two acknowledgment boundaries sit
 * behind, for an embedded store whose statements do not flush themselves.
 *
 *  1. A sync cursor write flushes first, so no cursor row is ever durable
 *     ahead of the operations it covers (FlushGuardedSyncCursorStorage).
 *  2. A job's write-ready announcement, which `waitForJob` turns into terminal
 *     success, waits for a flush covering the job's commit - except a load a
 *     sync cursor protects, whose operations are re-pulled if lost.
 *
 * A store durable per statement uses {@link NoopStorageFlusher}.
 */
export interface IStorageFlusher {
  /**
   * Resolves once every write issued before the call is durable. Rejects with
   * {@link StoragePoisonedError} once the store can make nothing durable again.
   */
  flush(): Promise<void>;
}

/** The store's session is poisoned; only a host restart recovers it. */
export class StoragePoisonedError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = "StoragePoisonedError";
  }
}

export class NoopStorageFlusher implements IStorageFlusher {
  flush(): Promise<void> {
    return Promise.resolve();
  }
}
