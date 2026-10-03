import type { StorageSessionRecreatedEvent } from "../../events/types.js";
import type { IStorageFlusher } from "../storage-flush.js";
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
   * How long {@link SelfHealingPGliteClient.flush} waits for the statement in
   * flight to finish before giving up on the group commit.
   *
   * A filesystem sync reads the wasm filesystem asynchronously, so a statement
   * running concurrently would be captured half-written - which is why PGlite
   * holds its own query mutex across the per-statement sync it does for us. The
   * explicit flush reproduces that by letting the statement in flight finish
   * and holding the next one back, and the single PGlite lease means there is
   * at most one to wait for. The bound exists because a statement that never
   * settles would otherwise park the flush forever and with it every cursor
   * advance; the statement deadline in the dialect settles such a statement
   * first, so passing this bound means something stranger happened and the
   * honest answer is a rejected flush, which simply stops the acknowledgment
   * the caller was about to make.
   */
  flushQuiesceTimeoutMs: number;
};

export const DEFAULT_CLOSE_TIMEOUT_MS = 30_000;

export const DEFAULT_FLUSH_QUIESCE_TIMEOUT_MS = 180_000;

/** A statement in flight did not finish, so no safe snapshot could be taken. */
export class PGliteFlushQuiesceTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `Timed out after ${timeoutMs}ms waiting for the statement in flight to finish before flushing the PGlite filesystem; no durability barrier was established.`,
    );
    this.name = "PGliteFlushQuiesceTimeoutError";
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
 * {@link StorageSessionRecreatedEvent} on success so the recovery is observable.
 *
 * It is also the reactor's durability barrier ({@link IStorageFlusher}),
 * because the two jobs are the same job: the thing a recreate falls back to is
 * the last flushed snapshot, so whoever owns the instance lifecycle is the only
 * place that can say what "durable" means. {@link setDeferredFlush} takes the
 * filesystem sync off every statement and {@link flush} puts it back at the two
 * acknowledgment boundaries, group-committed.
 */
export class SelfHealingPGliteClient implements PGliteSession, IStorageFlusher {
  private instance: RecreatablePGliteInstance;
  private readonly options: SelfHealingPGliteClientOptions;
  private recreatedListener: (event: StorageSessionRecreatedEvent) => void;
  private healing: Promise<boolean> | undefined = undefined;
  private attempt = 0;
  /** True while statements have had their own filesystem sync taken away. */
  private deferred = false;
  /** The current instance's real `syncToFs`, captured before any suppression. */
  private instanceSync: () => Promise<void> = () => Promise.resolve();
  /**
   * Whether the instance offers a filesystem sync at all. A stub session (or a
   * worker proxy that does not surface one) has nothing to flush, so the
   * barrier is trivially satisfied and deferral must stay off.
   */
  private hasInstanceSync = false;
  /** Statements running right now; a flush waits for this to reach zero. */
  private statementsInFlight = 0;
  /** Set while a flush is taking its snapshot; new statements wait on it. */
  private statementGate: Promise<void> | undefined = undefined;
  /** Resolvers waiting for {@link statementsInFlight} to reach zero. */
  private quiesceWaiters: Array<() => void> = [];
  /** Monotonic statement counter, so a flush with nothing to do can say so. */
  private statementSequence = 0;
  /** The statement count a completed flush has already made durable. */
  private flushedStatements = 0;
  /** Monotonic request counter; a flush covers every request up to its own. */
  private flushRequests = 0;
  /** The highest request number a completed flush has covered. */
  private flushCompleted = 0;
  private flushInFlight: Promise<void> | undefined = undefined;
  /** The request number the in-flight flush covers; 0 until its snapshot starts. */
  private flushInFlightCovers = 0;

  constructor(
    initial: RecreatablePGliteInstance,
    options: Partial<SelfHealingPGliteClientOptions> = {},
  ) {
    this.instance = initial;
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
      closeTimeoutMs: options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS,
      flushQuiesceTimeoutMs:
        options.flushQuiesceTimeoutMs ?? DEFAULT_FLUSH_QUIESCE_TIMEOUT_MS,
    };
    this.recreatedListener = this.options.onRecreated;
    this.bindInstanceSync();
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
    await this.enterStatement();
    try {
      return await this.instance.query(sql, params);
    } finally {
      this.leaveStatement();
    }
  }

  async exec(sql: string): Promise<unknown> {
    await this.enterStatement();
    try {
      return await this.instance.exec(sql);
    } finally {
      this.leaveStatement();
    }
  }

  isInTransaction(): boolean {
    return this.instance.isInTransaction();
  }

  get deferringStatementFlush(): boolean {
    return this.deferred;
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
    if (deferred && !this.hasInstanceSync) {
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

  /** @see IStorageFlusher.flush */
  async flush(): Promise<void> {
    if (this.statementSequence === this.flushedStatements) {
      // Nothing has run since the snapshot that is already durable, so there
      // is nothing to make durable. This is what keeps a burst of cursor
      // writes over an idle store from costing one filesystem sync each.
      return;
    }
    const target = ++this.flushRequests;
    for (;;) {
      if (this.flushCompleted >= target) {
        return;
      }
      const inFlight = this.flushInFlight;
      if (inFlight === undefined) {
        await this.startFlush();
        return;
      }
      if (this.flushInFlightCovers >= target) {
        await inFlight;
        return;
      }
      await inFlight.catch(() => undefined);
    }
  }

  /** The instance currently backing the client; swapped by {@link recreate}. */
  get current(): RecreatablePGliteInstance {
    return this.instance;
  }

  /** How many times the instance has been recreated over this client's life. */
  get recreateCount(): number {
    return this.attempt;
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
    await this.instance.close();
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
    const old = this.instance;

    const closed = await this.closeQuietly(old);
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

    this.instance = next;
    this.bindInstanceSync();
    this.applyDeferral();
    this.attempt += 1;

    const event: StorageSessionRecreatedEvent = {
      reason,
      timestampUtcMs: Date.now(),
      attempt: this.attempt,
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
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bounded = new Promise<boolean>((resolve) => {
      timer = setTimeout(() => {
        this.options.onDiagnostic(
          "closing the poisoned PGlite instance timed out; it may still hold the store, so not opening a replacement - escalating",
        );
        resolve(false);
      }, this.options.closeTimeoutMs);
    });
    const closing = instance
      .close()
      .then(() => true)
      .catch((error) => {
        this.options.onDiagnostic(
          "closing the poisoned PGlite instance failed; the teardown returned, so proceeding with the replacement",
          error,
        );
        return true;
      });
    try {
      return await Promise.race([closing, bounded]);
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Installs or lifts the no-op that takes the automatic per-statement sync
   * away. The real `syncToFs` is captured when the instance is bound, so
   * {@link flush} keeps reaching it while statements see the no-op; lifting
   * writes the captured function back rather than deleting the override, which
   * works whether the instance carries `syncToFs` on its prototype or as an own
   * field.
   */
  private applyDeferral(): void {
    if (!this.hasInstanceSync) {
      return;
    }
    const target = this.instance as unknown as {
      syncToFs: () => Promise<void>;
    };
    target.syncToFs = this.deferred
      ? () => Promise.resolve()
      : this.instanceSync;
  }

  /**
   * Captures the instance's real filesystem sync before any suppression can
   * shadow it, so {@link flush} keeps reaching the genuine one while statements
   * see the no-op.
   */
  private bindInstanceSync(): void {
    const candidate = (this.instance as { syncToFs?: unknown }).syncToFs;
    this.hasInstanceSync = typeof candidate === "function";
    this.instanceSync = this.hasInstanceSync
      ? (candidate as () => Promise<void>).bind(this.instance)
      : () => Promise.resolve();
  }

  /**
   * Starts one group commit. Every request made before the snapshot begins is
   * covered by it, which is what lets concurrent callers share a single
   * filesystem sync; a request made after it starts gets the next one.
   */
  private startFlush(): Promise<void> {
    const run = this.runFlush().finally(() => {
      this.flushInFlight = undefined;
    });
    this.flushInFlight = run;
    this.flushInFlightCovers = 0;
    return run;
  }

  private async runFlush(): Promise<void> {
    const release = await this.holdStatements();
    // Nothing is executing now, so every request made up to this point has its
    // writes in the filesystem and is covered by the snapshot about to be
    // taken. Capturing the watermark here rather than when the flush was
    // requested is what makes the group as wide as it can safely be.
    const covers = this.flushRequests;
    const statementsCovered = this.statementSequence;
    this.flushInFlightCovers = covers;
    try {
      await this.instanceSync();
    } finally {
      release();
    }
    this.flushCompleted = Math.max(this.flushCompleted, covers);
    this.flushedStatements = Math.max(
      this.flushedStatements,
      statementsCovered,
    );
  }

  /**
   * Waits for the statement in flight to finish and holds the next one back,
   * so the snapshot is taken against a filesystem nothing is writing to. The
   * returned function lets statements through again.
   */
  private async holdStatements(): Promise<() => void> {
    while (this.statementGate !== undefined) {
      await this.statementGate;
    }

    let released = false;
    let release: () => void = () => undefined;
    this.statementGate = new Promise<void>((resolve) => {
      release = () => {
        if (released) {
          return;
        }
        released = true;
        this.statementGate = undefined;
        resolve();
      };
    });

    if (this.statementsInFlight === 0) {
      return release;
    }

    const drained = await this.awaitQuiesce();
    if (!drained) {
      release();
      throw new PGliteFlushQuiesceTimeoutError(
        this.options.flushQuiesceTimeoutMs,
      );
    }
    return release;
  }

  private async awaitQuiesce(): Promise<boolean> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const expiry = new Promise<boolean>((resolve) => {
      timer = setTimeout(
        () => resolve(false),
        this.options.flushQuiesceTimeoutMs,
      );
    });
    const drained = new Promise<boolean>((resolve) => {
      this.quiesceWaiters.push(() => resolve(true));
    });
    try {
      return await Promise.race([drained, expiry]);
    } finally {
      clearTimeout(timer);
    }
  }

  private async enterStatement(): Promise<void> {
    while (this.statementGate !== undefined) {
      await this.statementGate;
    }
    this.statementsInFlight += 1;
    this.statementSequence += 1;
  }

  private leaveStatement(): void {
    this.statementsInFlight -= 1;
    if (this.statementsInFlight > 0) {
      return;
    }
    const waiters = this.quiesceWaiters;
    this.quiesceWaiters = [];
    for (const waiter of waiters) {
      waiter();
    }
  }
}
