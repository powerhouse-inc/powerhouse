/**
 * The durability barrier the reactor's two acknowledgment boundaries sit
 * behind.
 *
 * Embedded stores keep their committed state in process memory and copy it to
 * durable storage out of band: PGlite's `COMMIT` returns once Postgres has
 * written its own WAL inside the wasm filesystem, and only an `syncToFs`
 * carries that filesystem into IndexedDB, OPFS or node-fs. Opening the store
 * so that every statement flushes makes committed mean flushed - the W0.7
 * posture - at the cost of one full filesystem sync per statement, which
 * measured ~2 operations per second during bulk sync catch-up and made the
 * ~16,600-operation Accounts collection a two-hour, tab-freezing grind
 * (regression run 3, finding A).
 *
 * Group commit restores the throughput without giving the invariant back: the
 * statements stop flushing themselves and the flush moves to the two places
 * where the reactor makes a promise it cannot take back.
 *
 *  1. **A sync cursor.** A persisted cursor says "everything up to here has
 *     been applied, never send it again". A cursor durable ahead of the data
 *     it covers is the permanent-gap mechanism of addendum 2: the rolled-back
 *     tail is never re-pulled and every later operation on those documents
 *     dead-letters. {@link KyselySyncCursorStorage} therefore flushes before
 *     it writes a cursor row. The cursor row itself is not flushed, which is
 *     the safe direction: a crash then loses the cursor advance but keeps the
 *     data, and the next poll re-pulls operations that are already applied -
 *     which inbox application is idempotent about.
 *  2. **A job reported terminally successful.** `waitForJob` resolving as
 *     success is what the client's consistency token, and W0.5's "drop the
 *     dead-letter row only once the retry is durably written", are built on.
 *     The executor therefore flushes before announcing a job write-ready -
 *     except for `load` jobs, whose operations came from a remote and whose
 *     durability is established by boundary 1 instead. A load job's writes
 *     lost to a crash are re-pulled, because the cursor did not advance past
 *     them.
 *
 * Everything else - read models, the write cache, the relational store - is
 * derived state that is rebuilt from the operation log, so it needs no
 * barrier.
 *
 * A store whose statements already flush themselves (per-statement durable
 * PGlite, or any server Postgres) satisfies the barrier trivially and uses
 * {@link NoopStorageFlusher}, so both boundaries behave exactly as before.
 */
export interface IStorageFlusher {
  /**
   * Resolves once every write issued before this call is durable.
   *
   * Concurrent callers are coalesced into one filesystem sync - the group
   * commit - but a caller is only ever given a sync that STARTED after its own
   * call, because an earlier sync may have begun before the writes the caller
   * cares about. Rejects when the sync failed, which must stop the caller from
   * advancing whatever acknowledgment it was about to make.
   *
   * Rejects with {@link StorageEpochSupersededError} when the store's session
   * was replaced under the caller: the writes the flush was to cover fell back
   * to an earlier snapshot and no longer exist, which is a different answer
   * from "the sync failed and the data is still there". A caller that was
   * about to acknowledge must treat the first as lost work to be redone and
   * the second as work that will be durable at the next successful flush.
   */
  flush(): Promise<void>;

  /**
   * Whether statements have stopped flushing themselves, so {@link flush} is
   * the only thing making writes durable. False for a store that is durable
   * per statement, where `flush` is a no-op that is already satisfied.
   */
  readonly deferringStatementFlush: boolean;

  /**
   * Identifies the store's current session incarnation.
   *
   * It changes when the session is replaced - the self-heal recreate - which
   * is the moment everything not yet flushed falls back to the last durable
   * snapshot. A caller that flushes and then writes an acknowledgment (a sync
   * cursor row) compares the token across the two: an unchanged token means the
   * flush it relied on still describes the live store, and a changed one means
   * the data under its acknowledgment is gone and the write must not stand.
   * Constant for a store that is durable per statement, where no fallback
   * exists.
   */
  readonly storageEpoch: number;
}

/**
 * The store's session was replaced, so the writes a flush was to cover fell
 * back to the last durable snapshot and are gone.
 *
 * It is retriable in the sense that the work can be redone against the fresh
 * session - the operations were never acknowledged - and it is NOT the same as
 * a failed sync, where the writes are still in the live session and the next
 * successful flush makes them durable. Callers that distinguish the two are
 * the two acknowledgment boundaries: a cursor write refuses outright, and a
 * committed job reports failure (its commit was undone) rather than withholding
 * an announcement for data that still exists.
 */
export class StorageEpochSupersededError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "StorageEpochSupersededError";
  }
}

/**
 * The barrier for a store that is already durable per statement: every write
 * is flushed by the time it is acknowledged, so there is nothing to wait for.
 * This is the default, which keeps the two acknowledgment boundaries behaving
 * exactly as they did before group commit existed.
 */
export class NoopStorageFlusher implements IStorageFlusher {
  readonly deferringStatementFlush = false;

  /** Constant: a store durable per statement has no snapshot to fall back to. */
  readonly storageEpoch = 0;

  flush(): Promise<void> {
    return Promise.resolve();
  }
}
