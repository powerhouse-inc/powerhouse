import { TIMED_OUT, withDeadline } from "../../shared/utils.js";
import type { IStorageFlusher } from "../storage-flush.js";
import { StoragePoisonedError } from "../storage-flush.js";
import type { PGliteSession } from "./pglite-dialect.js";

/** A PGlite instance; PGlite awaits `syncToFs` after each statement. */
export type GroupCommitPGliteInstance = PGliteSession & {
  close: () => Promise<void>;
  syncToFs: () => Promise<void>;
};

export type GroupCommitPGliteClientOptions = {
  onDiagnostic: (message: string, error?: unknown) => void;
  /** The sync hung or kept failing: the session is poisoned. */
  onSyncStuck: (cause: Error) => void;
  /** A sync that hangs past this poisons the session; 0 disables. */
  flushSyncTimeoutMs: number;
  /** Consecutive failed syncs before the session is poisoned. */
  maxConsecutiveSyncFailures: number;
  /** Bounds the closing flush and the instance close; 0 disables. */
  closeTimeoutMs: number;
};

export const DEFAULT_FLUSH_SYNC_TIMEOUT_MS = 120_000;

export const DEFAULT_MAX_CONSECUTIVE_SYNC_FAILURES = 3;

export const DEFAULT_CLOSE_TIMEOUT_MS = 30_000;

/** The filesystem sync never settled. */
export class PGliteFlushSyncTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(
      `The PGlite filesystem sync neither resolved nor rejected within ${timeoutMs}ms; no durability barrier was established.`,
    );
    this.name = "PGliteFlushSyncTimeoutError";
  }
}

type RunningFlush = { promise: Promise<void>; covers: number };

/** Group-commits PGlite's per-statement sync; see `withGroupCommitPGlite`. */
export class GroupCommitPGliteClient implements PGliteSession, IStorageFlusher {
  private readonly options: GroupCommitPGliteClientOptions;
  private readonly deferred: boolean;
  /** The instance's own `syncToFs`, captured before deferral replaces it. */
  private readonly instanceSync: () => Promise<void>;
  /** Statements started. */
  private sequence = 0;
  /** The highest {@link sequence} a completed flush made durable. */
  private flushed = 0;
  /** `covers` is 0 until the snapshot starts; earlier requests join it. */
  private running: RunningFlush | undefined = undefined;
  private syncFailures = 0;
  /** PGlite returns at once from a sync requested while one is scheduled. */
  private lastSync: Promise<void> = Promise.resolve();
  private inFlight = 0;
  private idleWaiters: Array<() => void> = [];
  private gate: Promise<void> | undefined = undefined;
  private releaseGate: () => void = () => undefined;
  private poisonCause: StoragePoisonedError | undefined = undefined;
  /** Rejects once the session is poisoned; every wait races it. */
  private readonly poisonedSignal: Promise<never>;
  private signalPoisoned: (error: Error) => void = () => undefined;

  constructor(
    private readonly instance: GroupCommitPGliteInstance,
    options: Partial<GroupCommitPGliteClientOptions> = {},
  ) {
    this.options = {
      onDiagnostic:
        options.onDiagnostic ??
        ((message, error) => {
          console.error(`[group-commit-pglite] ${message}`, error);
        }),
      onSyncStuck: options.onSyncStuck ?? (() => undefined),
      flushSyncTimeoutMs:
        options.flushSyncTimeoutMs ?? DEFAULT_FLUSH_SYNC_TIMEOUT_MS,
      maxConsecutiveSyncFailures:
        options.maxConsecutiveSyncFailures ??
        DEFAULT_MAX_CONSECUTIVE_SYNC_FAILURES,
      closeTimeoutMs: options.closeTimeoutMs ?? DEFAULT_CLOSE_TIMEOUT_MS,
    };
    this.poisonedSignal = new Promise<never>((_resolve, reject) => {
      this.signalPoisoned = reject;
    });
    this.poisonedSignal.catch(() => undefined);

    const candidate = (instance as { syncToFs?: unknown }).syncToFs;
    this.deferred = typeof candidate === "function";
    this.instanceSync = this.deferred
      ? (candidate as () => Promise<void>).bind(instance)
      : () => Promise.resolve();
    if (!this.deferred) {
      this.options.onDiagnostic(
        "this PGlite session exposes no filesystem sync, so statements keep their own durability",
      );
    }
    this.setStatementSync(!this.deferred);
  }

  async query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: unknown[]; affectedRows?: number }> {
    await this.enterStatement();
    try {
      return await this.instance.query(sql, params);
    } finally {
      this.endStatement();
    }
  }

  async exec(sql: string): Promise<unknown> {
    await this.enterStatement();
    try {
      return await this.instance.exec(sql);
    } finally {
      this.endStatement();
    }
  }

  isInTransaction(): boolean {
    return this.instance.isInTransaction();
  }

  /** Whether statements have stopped flushing themselves. */
  get deferringStatementFlush(): boolean {
    return this.deferred;
  }

  /** Every later and parked flush rejects: nothing can be made durable again. */
  markPoisoned(cause: unknown): void {
    if (this.poisonCause) return;
    this.poisonCause = new StoragePoisonedError(
      "The PGlite session is poisoned; nothing more can be made durable until the host restarts.",
      cause,
    );
    this.releaseGate();
    this.idleWaiters = [];
    this.signalPoisoned(this.poisonCause);
  }

  /** Shares one sync between callers whose statements it covers. */
  async flush(): Promise<void> {
    if (!this.deferred) {
      return;
    }
    const target = this.sequence;
    for (;;) {
      this.assertHealthy();
      if (this.flushed >= target) {
        return;
      }
      const running = this.running;
      if (running === undefined) {
        await this.startFlush();
        continue;
      }
      if (running.covers === 0 || running.covers >= target) {
        await running.promise;
        continue;
      }
      await running.promise.catch(() => undefined);
    }
  }

  /** PGlite's own close relies on the per-statement sync, so it is restored. */
  async close(): Promise<void> {
    const flushing = this.flush();
    flushing.catch(() => undefined);
    let failure: unknown;
    try {
      if ((await this.bounded(flushing)) === TIMED_OUT) {
        failure = new Error("the closing flush did not settle");
      }
    } catch (error) {
      failure = error;
    }
    if (failure !== undefined) {
      this.options.onDiagnostic(
        "the closing flush failed; writes since the last group commit are lost",
        failure,
      );
    }
    this.setStatementSync(true);
    const closing = this.instance.close();
    if ((await this.bounded(closing)) === TIMED_OUT) {
      this.options.onDiagnostic("closing the PGlite instance did not settle");
    }
  }

  /** Hands the instance back to per-statement durability, unclosed. */
  restoreStatementSync(): void {
    this.setStatementSync(true);
  }

  /** A statement that died in flight would otherwise hold a close forever. */
  private bounded<T>(pending: Promise<T>): Promise<T | typeof TIMED_OUT> {
    const timeoutMs = this.options.closeTimeoutMs;
    return timeoutMs > 0 ? withDeadline(pending, timeoutMs) : pending;
  }

  private assertHealthy(): void {
    if (this.poisonCause) throw this.poisonCause;
  }

  /** Restores by assignment so a prototype or own-field `syncToFs` both work. */
  private setStatementSync(enabled: boolean): void {
    if (!this.deferred) {
      return;
    }
    const target = this.instance as unknown as {
      syncToFs: () => Promise<void>;
    };
    target.syncToFs = enabled ? this.instanceSync : () => Promise.resolve();
  }

  private startFlush(): Promise<void> {
    const running: RunningFlush = { promise: Promise.resolve(), covers: 0 };
    running.promise = this.runFlush(running).finally(() => {
      if (this.running === running) {
        this.running = undefined;
      }
    });
    this.running = running;
    return running.promise;
  }

  private async runFlush(running: RunningFlush): Promise<void> {
    const release = await this.holdStatements();
    running.covers = this.sequence;
    const covered = running.covers;
    try {
      await this.boundedSync();
    } finally {
      release();
    }
    this.flushed = Math.max(this.flushed, covered);
  }

  /** Chained, so PGlite's scheduled-sync shortcut never stands in for a sync. */
  private async boundedSync(): Promise<void> {
    const started = this.lastSync.then(() => this.instanceSync());
    this.lastSync = started.then(
      () => undefined,
      () => undefined,
    );
    const syncing = Promise.race([started, this.poisonedSignal]);
    syncing.catch(() => undefined);

    let failure: Error;
    try {
      const timeoutMs = this.options.flushSyncTimeoutMs;
      const outcome =
        timeoutMs > 0 ? await withDeadline(syncing, timeoutMs) : await syncing;
      if (outcome !== TIMED_OUT) {
        this.syncFailures = 0;
        return;
      }
      failure = new PGliteFlushSyncTimeoutError(timeoutMs);
    } catch (error) {
      this.assertHealthy();
      this.syncFailures += 1;
      if (this.syncFailures < this.options.maxConsecutiveSyncFailures) {
        throw error;
      }
      failure = error instanceof Error ? error : new Error(String(error));
    }

    this.options.onDiagnostic(
      "the PGlite filesystem sync is stuck; treating the session as poisoned",
      failure,
    );
    this.markPoisoned(failure);
    try {
      this.options.onSyncStuck(failure);
    } catch (error) {
      this.options.onDiagnostic("onSyncStuck threw", error);
    }
    throw this.poisonCause ?? failure;
  }

  /** Waits for the statement in flight to finish and holds the next one back. */
  private async holdStatements(): Promise<() => void> {
    while (this.gate !== undefined) {
      await Promise.race([this.gate, this.poisonedSignal]);
    }
    this.assertHealthy();

    this.gate = new Promise<void>((resolve) => {
      this.releaseGate = () => {
        this.gate = undefined;
        this.releaseGate = () => undefined;
        resolve();
      };
    });
    const release = () => this.releaseGate();
    if (this.inFlight === 0) {
      return release;
    }
    try {
      await Promise.race([
        new Promise<void>((resolve) => this.idleWaiters.push(resolve)),
        this.poisonedSignal,
      ]);
    } catch (error) {
      release();
      throw error;
    }
    return release;
  }

  private async enterStatement(): Promise<void> {
    while (this.gate !== undefined) {
      await this.gate;
    }
    this.inFlight += 1;
    this.sequence += 1;
  }

  private endStatement(): void {
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
}
