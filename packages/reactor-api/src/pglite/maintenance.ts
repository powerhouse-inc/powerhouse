import { protocol, type PGlite } from "@electric-sql/pglite";
import type {
  IStoreMaintenance,
  TableRewriteRequest,
  TableRewriteResult,
} from "@powerhousedao/reactor";
import { promises as fs } from "node:fs";
import path from "node:path";

export const DEFAULT_MAINTENANCE_INTERVAL_MS = 5 * 60 * 1000;
export const DEFAULT_VACUUM_FULL_ABOVE_BYTES = 256 * 1024 * 1024;
export const DEFAULT_VACUUM_FULL_QUIET_MS = 60 * 1000;
/**
 * How long a pending VACUUM FULL waits for a quiet store before it runs
 * anyway: by default it never does (0), because a forced rewrite of a large
 * store under load holds the only connection for minutes, every caller times
 * out, and the dir needs about twice its size in free space meanwhile.
 * `PH_PGLITE_VACUUM_FULL=forced` restores a deadline.
 */
export const DEFAULT_VACUUM_FULL_MAX_DEFER_MS = 0;
/** The deadline `PH_PGLITE_VACUUM_FULL=forced` sets. */
export const FORCED_VACUUM_FULL_MAX_DEFER_MS = 30 * 60_000;
const MAINTENANCE_RETRY_MS = 1000;
/**
 * A table rewrite waits for this long a gap between the store's statements.
 * Short, because PGlite syncs after every statement and an idle reactor still
 * reads every 2 s (catch-up, sync polls), so a longer gap never comes.
 */
export const DEFAULT_REWRITE_QUIET_MS = 1_000;
/** How long a table rewrite waits for that gap before it reports the store busy. */
export const DEFAULT_REWRITE_MAX_WAIT_MS = 15 * 60_000;
const REWRITE_POLL_MS = 250;

export type MaintenanceOutcome =
  | "vacuum"
  | "vacuum-full"
  | "idle"
  | "not-ready"
  | "in-transaction"
  | "failed";

export interface MaintenanceLogger {
  warn(message: string): void;
  /** A finished VACUUM FULL is reported here; `warn` when absent. */
  info?(message: string): void;
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
   * The longest a pending VACUUM FULL waits for that quiet window, counted
   * from open; past it the next pass runs VACUUM FULL anyway. Default 0,
   * which waits for the quiet window however long it takes.
   */
  vacuumFullMaxDeferMs?: number;
  /**
   * Queues each pass with the store's other work, e.g. behind a worker's
   * pending requests, so a pass never starts ahead of a statement already
   * admitted. A pass still waiting here when the store closes is skipped.
   */
  gate?: MaintenanceGate;
  logger?: MaintenanceLogger;
  /** Clock for the quiet window; tests pass their own. */
  now?: () => number;
  /** The gap between statements a table rewrite waits for. Default 1 s. */
  rewriteQuietMs?: number;
  /** How long a table rewrite waits for that gap. Default 15 min. */
  rewriteMaxWaitMs?: number;
}

export class PgliteMaintenance implements IStoreMaintenance {
  private readonly intervalMs: number;
  private readonly vacuumFullAboveBytes: number;
  private readonly vacuumFullQuietMs: number;
  private readonly vacuumFullMaxDeferMs: number;
  private readonly gate?: MaintenanceGate;
  private readonly logger?: MaintenanceLogger;
  private readonly now: () => number;
  private readonly rewriteQuietMs: number;
  private readonly rewriteMaxWaitMs: number;

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
  private openedAt = 0;
  private rewriting?: Promise<TableRewriteResult | undefined>;

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
    this.vacuumFullMaxDeferMs = Math.max(
      0,
      options.vacuumFullMaxDeferMs ?? DEFAULT_VACUUM_FULL_MAX_DEFER_MS,
    );
    this.gate = options.gate;
    this.logger = options.logger;
    this.now = options.now ?? Date.now;
    this.rewriteQuietMs = options.rewriteQuietMs ?? DEFAULT_REWRITE_QUIET_MS;
    this.rewriteMaxWaitMs =
      options.rewriteMaxWaitMs ?? DEFAULT_REWRITE_MAX_WAIT_MS;
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
    this.openedAt = this.lastSyncAt;
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
    await this.rewriting;
  }

  async run(): Promise<MaintenanceOutcome> {
    if (this.gate) return this.gate(() => this.runNow());
    return this.runNow();
  }

  /**
   * Rewrites one table with VACUUM FULL and a CHECKPOINT, in the turn of the
   * store's other work, never the whole store. Waits for a gap in the store's
   * statements first; nothing else runs on it while the table is rewritten.
   */
  async rewriteTable(
    request: TableRewriteRequest,
  ): Promise<TableRewriteResult> {
    const shortOfDisk = await this.diskShortage(request.requiredFreeBytes);
    if (shortOfDisk !== undefined) {
      return { outcome: "refused", reason: shortOfDisk };
    }
    const relation = `${quoteIdentifier(request.schema)}.${quoteIdentifier(request.table)}`;
    const deadline = this.now() + this.rewriteMaxWaitMs;
    for (;;) {
      if (this.closing || !this.pg?.ready) {
        return { outcome: "refused", reason: "the store is closing" };
      }
      if (this.now() - this.lastSyncAt >= this.rewriteQuietMs) {
        const attempt = this.gate
          ? this.gate(() => this.rewriteNow(relation))
          : this.rewriteNow(relation);
        this.rewriting = attempt.catch(() => undefined);
        const result = await attempt;
        this.rewriting = undefined;
        if (result !== undefined) return result;
      }
      if (this.now() >= deadline) {
        return {
          outcome: "busy",
          reason: `The store had no gap of ${this.rewriteQuietMs} ms between statements in ${this.rewriteMaxWaitMs} ms, so ${relation} was not rewritten. Try again in a quieter moment.`,
        };
      }
      await new Promise((resolve) => {
        setTimeout(resolve, REWRITE_POLL_MS);
      });
    }
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
    const now = this.now();
    const overdue =
      this.vacuumFullMaxDeferMs > 0 &&
      now - this.openedAt >= this.vacuumFullMaxDeferMs;
    const full =
      this.vacuumFullPending &&
      (now - this.lastSyncAt >= this.vacuumFullQuietMs || overdue);
    if (this.vacuumFullPending && !full && !this.deferralLogged) {
      this.deferralLogged = true;
      this.logger?.warn(
        `DurableNodeFs: ${this.label}/base exceeds ${this.vacuumFullAboveBytes} bytes; VACUUM FULL waits until the store has had no writes for ${this.vacuumFullQuietMs} ms${this.vacuumFullMaxDeferMs > 0 ? `, or at most ${this.vacuumFullMaxDeferMs} ms from open` : ""}`,
      );
    }
    if (!full && this.syncsSinceMaintenance === 0) {
      return "idle";
    }
    const baseDir = path.join(this.label, "base");
    const bytesBefore = full ? await dirBytes(baseDir) : 0;
    const startedAt = this.now();
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
    if (full) {
      this.vacuumFullPending = false;
      const bytesAfter = await dirBytes(baseDir);
      const message = `DurableNodeFs: ${this.label}/base VACUUM FULL finished in ${this.now() - startedAt} ms; ${bytesBefore} -> ${bytesAfter} bytes`;
      if (this.logger?.info) this.logger.info(message);
      else this.logger?.warn(message);
    }
    return outcome;
  }

  /** Undefined when a transaction is open, so the caller waits and tries again. */
  private async rewriteNow(
    relation: string,
  ): Promise<TableRewriteResult | undefined> {
    const pg = this.pg;
    if (this.closing || !pg?.ready) {
      return { outcome: "refused", reason: "the store is closing" };
    }
    const isReady = (): boolean => pg.ready && !this.closing;
    const startedAt = this.now();
    const bytesBefore = await dirBytes(path.join(this.label, "base"));
    let completed: boolean | undefined;
    try {
      completed = await pg._runExclusiveQuery(async () => {
        if (!isReady()) return false;
        const { messages } = await pg.execProtocol(
          protocol.serialize.query(""),
          { syncToFs: false },
        );
        if (transactionStatus(messages) !== "I") return undefined;
        this.logger?.warn(
          `DurableNodeFs: ${this.label}: running VACUUM FULL ${relation}`,
        );
        for (const statement of [`VACUUM FULL ${relation}`, "CHECKPOINT"]) {
          if (!isReady()) return false;
          await pg.execProtocol(protocol.serialize.query(statement), {
            syncToFs: false,
          });
        }
        return true;
      });
    } catch (err) {
      return {
        outcome: "refused",
        reason: `VACUUM FULL ${relation} failed: ${errorMessage(err)}`,
      };
    }
    if (completed === undefined) return undefined;
    if (!completed) {
      return { outcome: "refused", reason: "the store is closing" };
    }
    const durationMs = this.now() - startedAt;
    const bytesAfter = await dirBytes(path.join(this.label, "base"));
    const message = `DurableNodeFs: ${this.label}/base VACUUM FULL ${relation} finished in ${durationMs} ms; ${bytesBefore} -> ${bytesAfter} bytes`;
    if (this.logger?.info) this.logger.info(message);
    else this.logger?.warn(message);
    return { outcome: "done", durationMs };
  }

  /** Why the disk cannot hold the rewrite; undefined when it can or nobody can tell. */
  private async diskShortage(
    requiredFreeBytes: number,
  ): Promise<string | undefined> {
    if (requiredFreeBytes <= 0 || !this.label) return undefined;
    let freeBytes: number;
    try {
      const stats = await fs.statfs(this.label);
      freeBytes = stats.bavail * stats.bsize;
    } catch {
      return undefined;
    }
    return freeBytes < requiredFreeBytes
      ? `The rewrite needs about ${requiredFreeBytes} bytes of free disk at ${this.label}; ${freeBytes} are free.`
      : undefined;
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

function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

/** The maintenance of a store opened on DurableNodeFs; undefined for any other. */
export function maintenanceOf(store: {
  fs?: unknown;
}): PgliteMaintenance | undefined {
  const maintenance = (store.fs as { maintenance?: unknown } | undefined)
    ?.maintenance;
  return maintenance instanceof PgliteMaintenance ? maintenance : undefined;
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
