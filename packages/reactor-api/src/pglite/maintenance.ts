import { protocol, type PGlite } from "@electric-sql/pglite";
import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_VACUUM_FULL_ABOVE_BYTES = 256 * 1024 * 1024;
export const DEFAULT_VACUUM_FULL_QUIET_MS = 60 * 1000;
const MAINTENANCE_RETRY_MS = 1000;

export type MaintenanceOutcome =
  | "vacuum"
  | "vacuum-full"
  | "idle"
  | "not-ready"
  | "in-transaction"
  | "failed";

export interface MaintenanceLogger {
  warn(message: string): void;
}

/** Runs a maintenance pass in the owner's turn; see {@link MaintenanceOptions.gate}. */
export type MaintenanceGate = <T>(task: () => Promise<T>) => Promise<T>;

export interface MaintenanceOptions {
  /** VACUUM + CHECKPOINT cadence; PGlite has no autovacuum. Default 5 min; 0 disables. */
  intervalMs?: number;
  /** First pass runs VACUUM FULL when `base/` exceeds this at open. Default 256 MB; 0 disables. */
  vacuumFullAboveBytes?: number;
  /**
   * VACUUM FULL holds the store for minutes on a large dir, so it waits for a
   * store with no synced statement (no write, no catch-up) for this long,
   * counted from open; until then a pass runs plain VACUUM and keeps the
   * VACUUM FULL pending. Default 60 s; 0 runs it on the first pass.
   */
  vacuumFullQuietMs?: number;
  /**
   * Queues each pass with the store's other work, e.g. behind a worker's
   * pending requests, so a pass never starts ahead of a statement already
   * admitted. A pass still waiting here when the store closes is skipped.
   */
  gate?: MaintenanceGate;
  logger?: MaintenanceLogger;
  /** Clock for the quiet window; tests pass their own. */
  now?: () => number;
}

export class PgliteMaintenance {
  private readonly intervalMs: number;
  private readonly vacuumFullAboveBytes: number;
  private readonly vacuumFullQuietMs: number;
  private readonly gate?: MaintenanceGate;
  private readonly logger?: MaintenanceLogger;
  private readonly now: () => number;

  private pg?: PGlite;
  private label = "";
  private closing = false;
  private syncsSinceMaintenance = 0;
  private vacuumFullPending = false;
  private timer?: ReturnType<typeof setTimeout>;
  private inFlight?: Promise<MaintenanceOutcome>;
  private active = false;
  private deferralLogged = false;
  private lastSyncAt = 0;

  constructor(options: MaintenanceOptions = {}) {
    this.intervalMs = Math.max(
      0,
      options.intervalMs ?? DEFAULT_MAINTENANCE_INTERVAL_MS,
    );
    this.vacuumFullAboveBytes = Math.max(
      0,
      options.vacuumFullAboveBytes ?? DEFAULT_VACUUM_FULL_ABOVE_BYTES,
    );
    this.vacuumFullQuietMs = Math.max(
      0,
      options.vacuumFullQuietMs ?? DEFAULT_VACUUM_FULL_QUIET_MS,
    );
    this.gate = options.gate;
    this.logger = options.logger;
    this.now = options.now ?? Date.now;
  }

  get scheduled(): boolean {
    return this.timer !== undefined;
  }

  get running(): boolean {
    return this.inFlight !== undefined;
  }

  start(pg: PGlite, label: string, baseBytes: number): void {
    this.pg = pg;
    this.label = label;
    this.vacuumFullPending =
      this.vacuumFullAboveBytes > 0 && baseBytes > this.vacuumFullAboveBytes;
    this.lastSyncAt = this.now();
    this.schedule(this.intervalMs);
  }

  noteSync(): void {
    this.syncsSinceMaintenance++;
    this.lastSyncAt = this.now();
  }

  /** Waits for a pass that has started; one still queued at the gate is left to skip itself. */
  async stop(): Promise<void> {
    this.closing = true;
    this.cancel();
    if (this.active) await this.inFlight;
  }

  async run(): Promise<MaintenanceOutcome> {
    if (this.gate) return this.gate(() => this.runNow());
    return this.runNow();
  }

  private async runNow(): Promise<MaintenanceOutcome> {
    this.active = true;
    try {
      return await this.pass();
    } finally {
      this.active = false;
    }
  }

  private async pass(): Promise<MaintenanceOutcome> {
    const pg = this.pg;
    if (this.closing || !pg?.ready) return "not-ready";
    // pg.close() does not take the query mutex; recheck before each statement.
    const isReady = (): boolean => pg.ready && !this.closing;
    const full =
      this.vacuumFullPending &&
      this.now() - this.lastSyncAt >= this.vacuumFullQuietMs;
    if (this.vacuumFullPending && !full && !this.deferralLogged) {
      this.deferralLogged = true;
      this.logger?.warn(
        `DurableNodeFs: ${this.label}/base exceeds ${this.vacuumFullAboveBytes} bytes; VACUUM FULL waits until the store has had no writes for ${this.vacuumFullQuietMs} ms`,
      );
    }
    if (!full && this.syncsSinceMaintenance === 0) {
      return "idle";
    }
    let outcome: MaintenanceOutcome;
    try {
      outcome = await pg._runExclusiveQuery(async () => {
        // isInTransaction() misses START TRANSACTION; ReadyForQuery status does not.
        if (!isReady()) return "not-ready";
        const { messages } = await pg.execProtocol(
          protocol.serialize.query(""),
          { syncToFs: false },
        );
        if (transactionStatus(messages) !== "I") return "in-transaction";
        if (full) {
          this.logger?.warn(
            `DurableNodeFs: ${this.label}/base exceeds ${this.vacuumFullAboveBytes} bytes; running VACUUM FULL`,
          );
        }
        for (const statement of [
          full ? "VACUUM FULL" : "VACUUM",
          "CHECKPOINT",
        ]) {
          if (!isReady()) return "not-ready";
          await pg.execProtocol(protocol.serialize.query(statement), {
            syncToFs: false,
          });
        }
        return full ? "vacuum-full" : "vacuum";
      });
    } catch (err) {
      this.logger?.warn(
        `DurableNodeFs maintenance failed: ${errorMessage(err)}`,
      );
      return "failed";
    }
    if (outcome !== "vacuum" && outcome !== "vacuum-full") return outcome;
    this.syncsSinceMaintenance = 0;
    if (full) this.vacuumFullPending = false;
    return outcome;
  }

  private schedule(delayMs: number): void {
    if (this.intervalMs === 0 || this.closing) return;
    this.timer = setTimeout(() => {
      this.timer = undefined;
      this.inFlight = this.run()
        .then((outcome) => {
          this.schedule(
            outcome === "in-transaction"
              ? Math.min(MAINTENANCE_RETRY_MS, this.intervalMs)
              : this.intervalMs,
          );
          return outcome;
        })
        .finally(() => {
          this.inFlight = undefined;
        });
    }, delayMs);
    this.timer.unref();
  }

  private cancel(): void {
    if (!this.timer) return;
    clearTimeout(this.timer);
    this.timer = undefined;
  }
}

/** Total size of the regular files under `dir`; 0 when `dir` is missing. */
export async function dirBytes(dir: string): Promise<number> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return 0;
    throw err;
  }
  let total = 0;
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      total += await dirBytes(full);
    } else if (entry.isFile()) {
      total += (await fs.stat(full)).size;
    }
  }
  return total;
}

function transactionStatus(messages: readonly { name: string }[]): unknown {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.name === "readyForQuery") return (m as { status?: unknown }).status;
  }
  return undefined;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
