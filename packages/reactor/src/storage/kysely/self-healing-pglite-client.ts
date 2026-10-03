import type { StorageSessionRecreatedEvent } from "../../events/types.js";
import type { PGliteSession } from "./pglite-dialect.js";

/**
 * A PGlite instance this coordinator may close and reopen. `close` tears the
 * wasm instance down, which is the only thing that clears a stuck
 * `PORTAL_ACTIVE` portal - no SQL or protocol statement can. Reopening against
 * the same durable storage (idb/OPFS/node-fs) loses nothing that was committed;
 * only an in-memory instance loses data, which is why a memory-backed holder
 * should not enable self-heal.
 */
export type RecreatablePGliteInstance = PGliteSession & {
  close: () => Promise<void>;
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
   * How long to wait for the poisoned instance to close before proceeding with
   * the replacement anyway. A wasm instance whose last Execute threw is idle,
   * so close should return promptly, but the bound keeps a wedged teardown from
   * blocking recovery.
   */
  closeTimeoutMs: number;
};

export const DEFAULT_CLOSE_TIMEOUT_MS = 30_000;

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
 */
export class SelfHealingPGliteClient implements PGliteSession {
  private instance: RecreatablePGliteInstance;
  private readonly options: SelfHealingPGliteClientOptions;
  private recreatedListener: (event: StorageSessionRecreatedEvent) => void;
  private healing: Promise<boolean> | undefined = undefined;
  private attempt = 0;

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

  query(
    sql: string,
    params?: unknown[],
  ): Promise<{ rows: unknown[]; affectedRows?: number }> {
    return this.instance.query(sql, params);
  }

  exec(sql: string): Promise<unknown> {
    return this.instance.exec(sql);
  }

  isInTransaction(): boolean {
    return this.instance.isInTransaction();
  }

  /** The instance currently backing the client; swapped by {@link recreate}. */
  get current(): RecreatablePGliteInstance {
    return this.instance;
  }

  /** How many times the instance has been recreated over this client's life. */
  get recreateCount(): number {
    return this.attempt;
  }

  async close(): Promise<void> {
    await this.instance.close();
  }

  /**
   * Replaces the poisoned instance with a fresh one against the same storage,
   * swaps it in so every holder follows, and emits the recovery event.
   * Single-flight: concurrent callers share one recreation and its result.
   * Resolves `true` when the instance was replaced, `false` when a replacement
   * could not be opened - the host then decides whether to escalate (e.g. a
   * worker reload).
   */
  recreate(reason: string): Promise<boolean> {
    this.healing ??= this.runRecreate(reason).finally(() => {
      this.healing = undefined;
    });
    return this.healing;
  }

  private async runRecreate(reason: string): Promise<boolean> {
    const old = this.instance;
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
    this.attempt += 1;
    await this.closeQuietly(old);

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

  private async closeQuietly(
    instance: RecreatablePGliteInstance,
  ): Promise<void> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const bounded = new Promise<void>((resolve) => {
      timer = setTimeout(() => {
        this.options.onDiagnostic(
          "closing the poisoned PGlite instance timed out; proceeding with the replacement",
        );
        resolve();
      }, this.options.closeTimeoutMs);
    });
    try {
      await Promise.race([
        instance.close().catch((error) => {
          this.options.onDiagnostic(
            "closing the poisoned PGlite instance failed; proceeding with the replacement",
            error,
          );
        }),
        bounded,
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
}
