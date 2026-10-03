import type { StorageSessionRecreatedEvent } from "../../events/types.js";
import { TIMED_OUT, withDeadline } from "../../shared/utils.js";
import type { IStorageFlusher } from "../storage-flush.js";
import { StorageEpochSupersededError } from "../storage-flush.js";
import type { PGliteSession } from "./pglite-dialect.js";

/**
 * A PGlite instance this coordinator may close and reopen. `close` tears the
 * wasm instance down, which is the only thing that clears a stuck
 * `PORTAL_ACTIVE` portal - no SQL or protocol statement can. Reopening against
 * the same durable storage (idb/OPFS/node-fs) loses nothing that was committed;
 * only an in-memory instance loses data, which is why a memory-backed holder
 * should not enable self-heal.
 *
 * `syncToFs` is PGlite's own filesystem sync. On an instance opened WITHOUT
 * `relaxedDurability` it is awaitable and really flushes, which is what makes
 * it usable as the group-commit barrier of {@link IStorageFlusher}; PGlite
 * also calls it itself after every statement, which is the per-statement cost
 * {@link SelfHealingPGliteClient.setDeferredFlush} removes.
 */
export type RecreatablePGliteInstance = PGliteSession & {
  close: () => Promise<void>;
  syncToFs: () => Promise<void>;
};

export type SelfHealingPGliteClientOptions = {
  /**
   * Opens a fresh PGlite instance against the SAME storage the poisoned one
   * used. The data that was durably committed is read back; the rolled-back
   * tail is re-pulled by sync, whose cursor the hardened dialect already keeps
   * from advancing past durable data.
   */
  openInstance: () => Promise<RecreatablePGliteInstance>;
  /** Observability hook; wired to the reactor event bus by the host. */
  onRecreated: (event: StorageSessionRecreatedEvent) => void;
  /** Where open/close failures during a recreate are reported. */
  onDiagnostic: (message: string, error?: unknown) => void;
  /**
   * Escalation for the one poison this client detects itself: a filesystem sync
   * that neither resolves nor rejects within
   * {@link SelfHealingPGliteClientOptions.flushSyncTimeoutMs}.
   *
   * A hung `syncToFs` is a poisoned session by the same argument a hung
   * statement is - the wasm call is presumed dead, cannot be cancelled, and no
   * error will ever arrive - so it has to reach the same recovery the dialect's
   * `onPoisoned` reaches rather than parking the flush forever. The default
   * recreates in place; a holder that also wants a reload fallback when no
   * replacement opens (Connect's worker) overrides this to do both, exactly as
   * it does for the dialect.
   */
  onSyncStuck: (reason: string) => Promise<boolean>;
  /**
   * How long to wait for the poisoned instance to close before giving up on the
   * recreate. Recovery closes the poisoned instance FIRST and only then opens
   * the replacement (see {@link SelfHealingPGliteClient.recreate}), so this
   * bound sits on the critical path. A wasm instance whose last Execute threw is
   * idle, so close should return promptly; when it does not, the teardown is
   * wedged and may still hold the store, so the recreate is abandoned and the
   * holder escalates (e.g. a worker reload) rather than opening a second
   * instance against a store the poisoned one has not released.
   */
  closeTimeoutMs: number;
  /**
   * An optional independent bound on how long a flush waits for the statements
   * in flight to finish before refusing the group commit. Zero - the default -
   * means no second clock.
   *
   * A flush has to let the statement in flight finish and hold the next one
   * back, because a filesystem sync reads the wasm filesystem asynchronously
   * and would otherwise capture a half-written one; PGlite gets that property
   * from holding its query mutex across the per-statement sync it does for us.
   * The question is only what to do when a statement never settles, and an
   * independent clock here is the wrong answer: every statement reaching this
   * client through {@link HardenedPGliteDialect} is already bounded by its own
   * deadline, and that deadline's expiry escalates into the poison path, which
   * recreates the instance and retires this epoch - releasing every flush
   * waiting on it with {@link PGliteEpochSupersededError}. A shorter clock here
   * could therefore only ever fire FIRST, which is how a sanctioned long
   * statement (a vacuum, an index build, with a 15-minute bound of its own)
   * used to make every concurrent flush stall and then fail. Waiting for the
   * statement means waiting exactly as long as that statement is allowed to
   * run, and no longer.
   *
   * Set it above zero only for a holder whose statements do NOT all go through
   * the hardened dialect - one issuing `query`/`exec` straight at this client -
   * because those carry no deadline and nothing else would ever free the flush.
   */
  flushQuiesceTimeoutMs: number;
  /**
   * How long the filesystem sync itself may take before the session is presumed
   * dead and handed to {@link SelfHealingPGliteClientOptions.onSyncStuck}.
   *
   * This is the bound the flush path was missing: the sync is a wasm call like
   * any other, so it can die mid-flight and never settle, and because the flush
   * holds the statement gate across it a hung sync parked every cursor advance
   * AND every statement - the silent wedge rebuilt one layer above the one the
   * statement deadline cures. Generous, because a real `syncfs` over a whole
   * Postgres data directory under load is slow but finite. Zero disables.
   */
  flushSyncTimeoutMs: number;
};

export const DEFAULT_CLOSE_TIMEOUT_MS = 30_000;

/**
 * Zero: no clock independent of the statement deadlines. See
 * {@link SelfHealingPGliteClientOptions.flushQuiesceTimeoutMs} for why a second
 * bound here can only fire too early.
 */
export const DEFAULT_FLUSH_QUIESCE_TIMEOUT_MS = 0;

/** Two minutes, matching the dialect's bound for an ordinary statement. */
export const DEFAULT_FLUSH_SYNC_TIMEOUT_MS = 120_000;

/** A statement in flight did not finish, so no safe snapshot could be taken. */
export class PGliteFlushQuiesceTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `Timed out after ${timeoutMs}ms waiting for the statement in flight to finish before flushing the PGlite filesystem; no durability barrier was established.`,
    );
    this.name = "PGliteFlushQuiesceTimeoutError";
  }
}

/** The filesystem sync never settled, so the session is presumed dead. */
export class PGliteFlushSyncTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `The PGlite filesystem sync neither resolved nor rejected within ${timeoutMs}ms, so its wasm call is presumed dead and the session poisoned; no durability barrier was established.`,
    );
    this.name = "PGliteFlushSyncTimeoutError";
  }
}

/**
 * The operation belongs to a PGlite session incarnation that has been replaced.
 *
 * Everything the retired incarnation had not flushed fell back to the last
 * durable snapshot, so an answer derived from its state would describe data
 * that no longer exists - a flush "covering" statements that went down with the
 * old instance, a cursor advance over a rolled-back tail. The operation is
 * retriable against the fresh session; nothing about it may touch the fresh
 * session's bookkeeping.
 */
export class PGliteEpochSupersededError extends StorageEpochSupersededError {
  constructor(
    readonly epochId: number,
    readonly currentEpochId: number,
  ) {
    super(
      `The PGlite session incarnation ${epochId} was replaced by incarnation ${currentEpochId}. Everything it had not flushed fell back to the last durable snapshot, so this operation cannot be answered from its state and must be retried against the fresh session.`,
    );
    this.name = "PGliteEpochSupersededError";
  }
}

/**
 * One PGlite incarnation, and every piece of state whose meaning is tied to it.
 *
 * The defect class this type exists to make impossible: the flush and
 * quiescence machinery was correct in isolation but its state was GLOBAL while
 * the instance it described was REPLACEABLE. A statement counter that leaked
 * when a hung call was abandoned leaked forever, so every later flush waited on
 * a statement that no longer existed and then failed - a permanent wedge AFTER
 * a successful self-heal. A flush watermark that survived the swap let a
 * post-recreate flush claim to cover statements that went down with the old
 * instance, which is a sync cursor advancing past data that does not exist: the
 * permanent-gap mechanism of the live incident.
 *
 * Bundling the instance with its sync binding, its statement accounting, its
 * gate and its flush watermark means a recreate replaces all of them in one
 * assignment, and an operation that captured the old epoch can only ever write
 * into the old epoch's fields - which nothing reads again. Every wait is raced
 * against {@link superseded}, so retiring an epoch frees everything parked on it
 * instead of leaving it holding a gate no one will ever release.
 */
class PGliteEpoch {
  /** Statements started on this incarnation. */
  sequence = 0;
  /** The highest {@link sequence} a completed flush here made durable. */
  flushed = 0;
  /**
   * The flush taking a snapshot right now. `covers` is the {@link sequence} the
   * snapshot captured, and is 0 until the snapshot actually starts - a flush
   * requested before then is covered by it, which is what makes the group as
   * wide as it can safely be.
   */
  running: { promise: Promise<void>; covers: number } | undefined = undefined;
  /** Rejects once this incarnation is retired; raced by every wait on it. */
  readonly superseded: Promise<never>;
  /** The instance's real `syncToFs`, captured before any suppression. */
  readonly instanceSync: () => Promise<void>;
  /**
   * Whether the instance offers a filesystem sync at all. A stub session (or a
   * worker proxy that does not surface one) has nothing to flush, so the
   * barrier is trivially satisfied and deferral must stay off.
   */
  readonly hasInstanceSync: boolean;

  private inFlight = 0;
  private idleWaiters: Array<() => void> = [];
  private gatePromise: Promise<void> | undefined = undefined;
  private gateRelease: () => void = () => undefined;
  private retired = false;
  private supersede: (error: Error) => void = () => undefined;

  constructor(
    readonly id: number,
    readonly instance: RecreatablePGliteInstance,
  ) {
    const candidate = (instance as { syncToFs?: unknown }).syncToFs;
    this.hasInstanceSync = typeof candidate === "function";
    this.instanceSync = this.hasInstanceSync
      ? (candidate as () => Promise<void>).bind(instance)
      : () => Promise.resolve();
    this.superseded = new Promise<never>((_resolve, reject) => {
      this.supersede = reject;
    });
    // Consumers reach the rejection through a race, so the promise itself must
    // not look unhandled while no flush happens to be waiting on it.
    this.superseded.catch(() => undefined);
  }

  /** Set while a flush holds statements back; statements wait on it. */
  get gate(): Promise<void> | undefined {
    return this.gatePromise;
  }

  /** Whether a statement is running on this incarnation right now. */
  get busy(): boolean {
    return this.inFlight > 0;
  }

  /** Throws when this incarnation has been replaced by `currentId`. */
  assertCurrent(currentId: number): void {
    if (this.retired) {
      throw new PGliteEpochSupersededError(this.id, currentId);
    }
  }

  begin(): void {
    this.inFlight += 1;
    this.sequence += 1;
  }

  end(): void {
    this.inFlight -= 1;
    if (this.inFlight > 0) {
      return;
    }
    const waiters = this.idleWaiters;
    this.idleWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }

  /** Resolves when no statement is running on this incarnation. */
  idle(): Promise<void> {
    if (this.inFlight === 0) {
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => this.idleWaiters.push(resolve));
  }

  /**
   * Holds statements back and answers how to let them through again. The
   * release is idempotent, so a retire and an ordinary release cannot both
   * open a gate that has since been replaced.
   */
  closeGate(): () => void {
    this.gatePromise = new Promise<void>((resolve) => {
      this.gateRelease = () => {
        this.gatePromise = undefined;
        this.gateRelease = () => undefined;
        resolve();
      };
    });
    return () => this.gateRelease();
  }

  /**
   * Retires this incarnation: statements queued on its gate are let through so
   * they re-read the client's current epoch, and every wait raced against
   * {@link superseded} rejects. Quiescence waiters are deliberately NOT
   * resolved - they settle through the rejection instead, so a wait cannot
   * resolve as "drained" when the truth is "the instance it was waiting on is
   * gone".
   */
  retire(currentId: number): void {
    this.retired = true;
    this.gateRelease();
    this.idleWaiters = [];
    this.supersede(new PGliteEpochSupersededError(this.id, currentId));
  }
}

/**
 * A stable {@link PGliteSession} whose underlying PGlite instance can be
 * swapped out in place. Every holder of the reactor's single Kysely - the
 * operation store, keyframe store, operation index, write cache, watermark,
 * catch-up scheduler and all the sync storages - reaches the database through
 * the dialect, which reaches the client through this one object, so recreating
 * the instance here rewires all of them at once without rebuilding the reactor.
 *
 * It is the self-heal coordinator: {@link recreate} is single-flight, so
 * concurrent poison reports collapse into one instance recreation, and it emits
 * {@link StorageSessionRecreatedEvent} on success so the recovery is observable
 * - and so the sync manager can reset its channels, whose in-memory cursors are
 * stale-high the moment the store falls back to its last flushed snapshot.
 *
 * It is also the reactor's durability barrier ({@link IStorageFlusher}),
 * because the two jobs are the same job: the thing a recreate falls back to is
 * the last flushed snapshot, so whoever owns the instance lifecycle is the only
 * place that can say what "durable" means. {@link setDeferredFlush} takes the
 * filesystem sync off every statement and {@link flush} puts it back at the two
 * acknowledgment boundaries, group-committed.
 *
 * All of that per-instance state lives in one {@link PGliteEpoch} which a
 * recreate replaces atomically, so no flush, watermark or statement count can
 * outlive the instance it describes.
 */
export class SelfHealingPGliteClient implements PGliteSession, IStorageFlusher {
  private epoch: PGliteEpoch;
  private readonly options: SelfHealingPGliteClientOptions;
  private recreatedListener: (event: StorageSessionRecreatedEvent) => void;
  private healing: Promise<boolean> | undefined = undefined;
  /** True while statements have had their own filesystem sync taken away. */
  private deferred = false;

  constructor(
    initial: RecreatablePGliteInstance,
    options: Partial<SelfHealingPGliteClientOptions> = {},
  ) {
    this.epoch = new PGliteEpoch(0, initial);
    this.options = {
      openInstance:
        options.openInstance ??
        (() => {
          throw new Error(
            "SelfHealingPGliteClient has no openInstance; self-heal is disabled for this holder",
          );
        }),
      onRecreated: options.onRecreated ?? (() => undefined),
      onDiagnostic:
        options.onDiagnostic ??
        ((message, error) => {
          console.error(`[self-healing-pglite] ${message}`, error);
        }),
      onSyncStuck:
        options.onSyncStuck ?? ((reason: string) => this.recreate(reason)),
      closeTimeoutMs: options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS,
      flushQuiesceTimeoutMs:
        options.flushQuiesceTimeoutMs ?? DEFAULT_FLUSH_QUIESCE_TIMEOUT_MS,
      flushSyncTimeoutMs:
        options.flushSyncTimeoutMs ?? DEFAULT_FLUSH_SYNC_TIMEOUT_MS,
    };
    this.recreatedListener = this.options.onRecreated;
  }

  /**
   * Replaces the recovery-event sink. The reactor's event bus does not exist
   * until the module is built, which is after this client, so the host wires
   * the bus in once it has one.
   */
  setRecreatedListener(
    listener: (event: StorageSessionRecreatedEvent) => void,
  ): void {
    this.recreatedListener = listener;
  }

  async query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: unknown[]; affectedRows?: number }> {
    const epoch = await this.enterStatement();
    try {
      return await epoch.instance.query(sql, params);
    } finally {
      epoch.end();
    }
  }

  async exec(sql: string): Promise<unknown> {
    const epoch = await this.enterStatement();
    try {
      return await epoch.instance.exec(sql);
    } finally {
      epoch.end();
    }
  }

  isInTransaction(): boolean {
    return this.epoch.instance.isInTransaction();
  }

  get deferringStatementFlush(): boolean {
    return this.deferred;
  }

  /** @see IStorageFlusher.storageEpoch */
  get storageEpoch(): number {
    return this.epoch.id;
  }

  /**
   * Takes the per-statement filesystem sync away, or gives it back.
   *
   * PGlite calls `syncToFs` itself after every statement, and on an instance
   * opened without `relaxedDurability` that call awaits a full filesystem sync.
   * That is what makes committed mean flushed, and it is also what capped bulk
   * sync catch-up at ~2 operations per second. Deferring replaces the
   * instance's `syncToFs` with a no-op for the duration, so statements run at
   * memory speed and {@link flush} becomes the only thing that makes anything
   * durable.
   *
   * Enabling it without flushing at the acknowledgment boundaries would be a
   * data-safety regression, which is why the flusher and the deferral are the
   * same object: a holder that turns this on has, by construction, something to
   * hand {@link IStorageFlusher} consumers. Deferring is remembered across a
   * recreate, so the fresh instance comes up in the same mode.
   *
   * The failure direction is deliberately safe: should a future PGlite stop
   * routing its automatic sync through the instance method, the suppression
   * silently stops working and the store is slow again - never unflushed.
   */
  setDeferredFlush(deferred: boolean): void {
    if (deferred && !this.epoch.hasInstanceSync) {
      this.options.onDiagnostic(
        "this PGlite session exposes no filesystem sync, so there is nothing to defer; statements keep whatever durability they already had",
      );
      return;
    }
    if (this.deferred === deferred) {
      return;
    }
    this.deferred = deferred;
    this.applyDeferral();
  }

  /**
   * @see IStorageFlusher.flush
   *
   * Everything it reads and writes belongs to the epoch captured on entry, so a
   * flush whose instance was replaced mid-flight rejects with
   * {@link PGliteEpochSupersededError} instead of marking the fresh epoch's
   * statements durable. A flush with nothing run since the last completed one
   * is free, which is what keeps a burst of cursor writes over an idle store
   * from costing one filesystem sync each.
   */
  async flush(): Promise<void> {
    const epoch = this.epoch;
    epoch.assertCurrent(this.epoch.id);
    // The caller's watermark, captured once: a flush covers everything issued
    // before this call and owes nothing for a statement that started after it.
    const target = epoch.sequence;
    for (;;) {
      epoch.assertCurrent(this.epoch.id);
      if (epoch.flushed >= target) {
        return;
      }
      const running = epoch.running;
      if (running === undefined) {
        await this.startFlush(epoch);
        continue;
      }
      // A snapshot that has not started yet will capture a sequence at or
      // above this caller's, so it covers these writes; one that started
      // before them does not, and the loop waits for the next.
      if (running.covers === 0 || running.covers >= target) {
        await running.promise;
        continue;
      }
      await running.promise.catch(() => undefined);
    }
  }

  /** The instance currently backing the client; swapped by {@link recreate}. */
  get current(): RecreatablePGliteInstance {
    return this.epoch.instance;
  }

  /** How many times the instance has been recreated over this client's life. */
  get recreateCount(): number {
    return this.epoch.id;
  }

  /**
   * Closes the instance, flushing first.
   *
   * PGlite's own `close` relies on the automatic per-statement sync of its
   * final protocol message for the closing flush, and deferral has taken that
   * away - so without this a clean shutdown would discard everything written
   * since the last group commit. The deferral is lifted before the close so
   * PGlite's own closing sync works again too. A failing flush is reported and
   * the close proceeds, because refusing to close would leave the store held
   * open with the same data unflushed.
   */
  async close(): Promise<void> {
    try {
      await this.flush();
    } catch (error) {
      this.options.onDiagnostic(
        "the closing flush failed; writes since the last group commit are lost",
        error,
      );
    }
    this.setDeferredFlush(false);
    await this.epoch.instance.close();
  }

  /**
   * Replaces the poisoned instance with a fresh one against the same storage,
   * swaps it in so every holder follows, and emits the recovery event.
   *
   * The ordering is close-then-open: the poisoned instance is closed first
   * (bounded by {@link SelfHealingPGliteClientOptions.closeTimeoutMs}), and only
   * once it has let go of the store is the replacement opened and swapped in.
   * This guarantees at most one instance ever touches the durable store, because
   * PGlite's idb VFS is not safe for two live instances on one store: an open
   * replacement and a still-closing poisoned instance would race, and the old
   * instance's close-time flush could clobber writes the new one already made.
   * The database is briefly fully down between close and open, which is the
   * correct trade for recovering a session that was already bricked. Because the
   * close is on the critical path rather than after the swap, the recreate
   * resolves as soon as the replacement is live - callers waiting on the single
   * lease are not held for an extra close afterwards.
   *
   * What the replacement reads back is the last FLUSHED snapshot, and the
   * poisoned instance is not flushed before it is closed - its wasm state is
   * by definition not to be trusted. Under {@link setDeferredFlush} that makes
   * the recreate lose every write since the last group commit, which is exactly
   * the window the two acknowledgment boundaries of {@link IStorageFlusher}
   * make safe: whatever is lost is either sync-applied operations whose cursor
   * did not advance past them, and which the next poll re-pulls, or work no
   * caller was ever told was durable.
   *
   * The swap is one assignment of a fresh {@link PGliteEpoch}, and the old one
   * is retired in the same turn: its gate opens, its waiters reject, and its
   * statement accounting and flush watermark are left behind with the instance
   * they described. That is what makes the state of a dead instance unable to
   * reach the live one - including an abandoned hung statement's leaked count,
   * which used to wedge every later flush permanently.
   *
   * Single-flight: concurrent callers share one recreation and its result.
   * Resolves `true` when the instance was replaced, `false` when the poisoned
   * instance could not be closed within the bound or a replacement could not be
   * opened - the host then decides whether to escalate (e.g. a worker reload).
   */
  recreate(reason: string): Promise<boolean> {
    this.healing ??= this.runRecreate(reason).finally(() => {
      this.healing = undefined;
    });
    return this.healing;
  }

  private async runRecreate(reason: string): Promise<boolean> {
    const old = this.epoch;

    const closed = await this.closeQuietly(old.instance);
    if (!closed) {
      return false;
    }

    let next: RecreatablePGliteInstance;
    try {
      next = await this.options.openInstance();
    } catch (error) {
      this.options.onDiagnostic(
        "failed to open a replacement PGlite instance; session stays poisoned",
        error,
      );
      return false;
    }

    const epoch = new PGliteEpoch(old.id + 1, next);
    this.epoch = epoch;
    old.retire(epoch.id);
    this.applyDeferral();

    const event: StorageSessionRecreatedEvent = {
      reason,
      timestampUtcMs: Date.now(),
      attempt: epoch.id,
    };
    try {
      this.recreatedListener(event);
    } catch (error) {
      this.options.onDiagnostic("onRecreated hook threw", error);
    }
    return true;
  }

  /**
   * Closes the poisoned instance, bounded by
   * {@link SelfHealingPGliteClientOptions.closeTimeoutMs}, and answers whether
   * the close completed. Resolving `true` means the teardown call returned -
   * cleanly, or with an error, which still hands the store back - so a
   * replacement may be opened. Resolving `false` means the close did not settle
   * within the bound: the wasm teardown is wedged and may still hold the store,
   * so the caller must escalate instead of opening a second instance against it.
   */
  private async closeQuietly(
    instance: RecreatablePGliteInstance,
  ): Promise<boolean> {
    const closing = instance
      .close()
      .then(() => true)
      .catch((error: unknown) => {
        this.options.onDiagnostic(
          "closing the poisoned PGlite instance failed; the teardown returned, so proceeding with the replacement",
          error,
        );
        return true;
      });

    const outcome = await withDeadline(closing, this.options.closeTimeoutMs);
    if (outcome === TIMED_OUT) {
      this.options.onDiagnostic(
        "closing the poisoned PGlite instance timed out; it may still hold the store, so not opening a replacement - escalating",
      );
      return false;
    }
    return outcome;
  }

  /**
   * Installs or lifts the no-op that takes the automatic per-statement sync
   * away. The real `syncToFs` is captured by the epoch when it is created, so
   * {@link flush} keeps reaching it while statements see the no-op; lifting
   * writes the captured function back rather than deleting the override, which
   * works whether the instance carries `syncToFs` on its prototype or as an own
   * field.
   */
  private applyDeferral(): void {
    const epoch = this.epoch;
    if (!epoch.hasInstanceSync) {
      return;
    }
    const target = epoch.instance as unknown as {
      syncToFs: () => Promise<void>;
    };
    target.syncToFs = this.deferred
      ? () => Promise.resolve()
      : epoch.instanceSync;
  }

  /**
   * Starts one group commit on `epoch`. Every request made before the snapshot
   * begins is covered by it, which is what lets concurrent callers share a
   * single filesystem sync; a request made after it starts gets the next one.
   */
  private startFlush(epoch: PGliteEpoch): Promise<void> {
    const running: { promise: Promise<void>; covers: number } = {
      promise: Promise.resolve(),
      covers: 0,
    };
    running.promise = this.runFlush(epoch, running).finally(() => {
      if (epoch.running === running) {
        epoch.running = undefined;
      }
    });
    epoch.running = running;
    return running.promise;
  }

  private async runFlush(
    epoch: PGliteEpoch,
    running: { covers: number },
  ): Promise<void> {
    const release = await this.holdStatements(epoch);
    // Nothing is executing now, so every statement started up to this point
    // has its writes in the filesystem and is covered by the snapshot about to
    // be taken. Capturing the watermark here rather than when the flush was
    // requested is what makes the group as wide as it can safely be.
    running.covers = epoch.sequence;
    const covered = running.covers;
    try {
      await this.boundedSync(epoch);
    } finally {
      release();
    }
    epoch.flushed = Math.max(epoch.flushed, covered);
  }

  /**
   * Runs the filesystem sync under {@link
   * SelfHealingPGliteClientOptions.flushSyncTimeoutMs} and routes an expiry
   * into the poison path, because a sync that never settles is a dead wasm call
   * by the same argument a statement that never settles is. The wait is also
   * raced against the epoch's retirement, so a recreate triggered from
   * anywhere frees this flush rather than leaving it holding the statement gate
   * of an instance that no longer exists.
   */
  private async boundedSync(epoch: PGliteEpoch): Promise<void> {
    const timeoutMs = this.options.flushSyncTimeoutMs;
    const syncing = Promise.race([epoch.instanceSync(), epoch.superseded]);
    if (timeoutMs <= 0) {
      await syncing;
      return;
    }

    const outcome = await withDeadline(syncing, timeoutMs);
    if (outcome !== TIMED_OUT) {
      return;
    }

    const expiry = new PGliteFlushSyncTimeoutError(timeoutMs);
    this.options.onDiagnostic(
      "the PGlite filesystem sync never settled within its deadline; treating the session as poisoned",
      expiry,
    );
    await this.options.onSyncStuck(expiry.message);
    throw expiry;
  }

  /**
   * Waits for the statement in flight to finish and holds the next one back,
   * so the snapshot is taken against a filesystem nothing is writing to. The
   * returned function lets statements through again.
   */
  private async holdStatements(epoch: PGliteEpoch): Promise<() => void> {
    let gate = epoch.gate;
    while (gate !== undefined) {
      await gate;
      epoch.assertCurrent(this.epoch.id);
      gate = epoch.gate;
    }
    epoch.assertCurrent(this.epoch.id);

    const release = epoch.closeGate();
    if (!epoch.busy) {
      return release;
    }

    try {
      await this.awaitQuiesce(epoch);
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }

  private async awaitQuiesce(epoch: PGliteEpoch): Promise<void> {
    const drained = Promise.race([epoch.idle(), epoch.superseded]);
    const timeoutMs = this.options.flushQuiesceTimeoutMs;
    if (timeoutMs <= 0) {
      await drained;
      return;
    }

    const outcome = await withDeadline(drained, timeoutMs);
    if (outcome === TIMED_OUT) {
      throw new PGliteFlushQuiesceTimeoutError(timeoutMs);
    }
  }

  /**
   * Admits one statement to the current epoch and hands back the epoch it was
   * admitted to, so the statement runs against that instance and its
   * accounting lands in that epoch's fields. A statement held back by a flush
   * re-reads the client's epoch when the gate opens, which is how a recreate
   * during the wait routes it to the replacement instead of to a dead instance.
   */
  private async enterStatement(): Promise<PGliteEpoch> {
    for (;;) {
      const epoch = this.epoch;
      const gate = epoch.gate;
      if (gate === undefined) {
        epoch.begin();
        return epoch;
      }
      await gate;
    }
  }
}
