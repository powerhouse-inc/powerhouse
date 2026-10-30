import { sql, type Kysely } from "kysely";
import type { CatchUpPriority } from "../processors/catch-up-priority.js";
import { pauseFor } from "../processors/backfill-slots.js";
import {
  resolveKeyframeRule,
  type KeyframeSettings,
} from "../storage/keyframes/keyframe-settings.js";
import type { Database } from "../core/types.js";
import type {
  IKeyframeCleanup,
  IStoreMaintenance,
  KeyframeCleanupReason,
  KeyframeCleanupRun,
  KeyframeCleanupStreamReport,
  KeyframeCleanupTotals,
  KeyframeCleanupTypeReport,
  KeyframeReclaim,
} from "./keyframe-cleanup-types.js";

export const DEFAULT_KEYFRAME_CLEANUP_LIMITS = {
  /** Documents read per page of the keyset walk. */
  documentsPerPage: 200,
  /** Rows one DELETE statement removes at most. */
  rowsPerStatement: 100,
  /** Stored bytes one DELETE statement removes at most, unless one row is more. */
  bytesPerStatement: 32 * 1024 * 1024,
  /** The floor on the wait between statements, whatever the catch-up priority. */
  pauseMs: 20,
  /** How often a parked run looks at the priority again. */
  parkedPollMs: 1_000,
  /** The streams a report names. */
  topStreams: 20,
} as const;

export type KeyframeCleanupLimits = {
  -readonly [K in keyof typeof DEFAULT_KEYFRAME_CLEANUP_LIMITS]: number;
};

export type KeyframeCleanupOptions = {
  /** The schema `db` is bound to; raw size queries need it spelled out. */
  schema: string;
  settings: KeyframeSettings;
  /** Runs give way at its pace; absent, they wait `pauseMs` between statements. */
  priority?: CatchUpPriority;
  /** Absent: reclaim answers with what to do by hand. */
  maintenance?: IStoreMaintenance;
  limits?: Partial<KeyframeCleanupLimits>;
};

type KeyframeRow = {
  id: number;
  documentId: string;
  documentType: string;
  scope: string;
  branch: string;
  revision: number;
  bytes: number;
};

type RemovableRow = {
  id: number;
  documentType: string;
  bytes: number;
};

const MANUAL_RECLAIM =
  'This store has no maintenance lane to rewrite a table through. On Postgres, run VACUUM FULL reactor."Keyframe" in a quiet moment (it locks the table and needs free disk of about its live size), or use pg_repack, which does not hold the lock. Plain VACUUM makes the space reusable without giving it back.';

function emptyTotals(): KeyframeCleanupTotals {
  return {
    streams: 0,
    rows: 0,
    bytes: 0,
    removableRows: 0,
    removableBytes: 0,
    removedRows: 0,
    removedBytes: 0,
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function streamKey(row: KeyframeRow): string {
  return JSON.stringify([row.documentId, row.scope, row.branch]);
}

function documentBranchKey(documentId: string, branch: string): string {
  return JSON.stringify([documentId, branch]);
}

/** Chunks `rows` to the statement limits, in order. */
function statementsOf(
  rows: RemovableRow[],
  maxRows: number,
  maxBytes: number,
): RemovableRow[][] {
  const statements: RemovableRow[][] = [];
  let current: RemovableRow[] = [];
  let bytes = 0;
  for (const row of rows) {
    if (
      current.length > 0 &&
      (current.length >= maxRows || bytes + row.bytes > maxBytes)
    ) {
      statements.push(current);
      current = [];
      bytes = 0;
    }
    current.push(row);
    bytes += row.bytes;
  }
  if (current.length > 0) statements.push(current);
  return statements;
}

/**
 * Applies the keyframe rules to the rows already stored, and removes all
 * keyframes of deleted documents.
 *
 * Safe beside live traffic because a keyframe is a cache of a fold of the
 * operation log: a read takes the latest one at or below its revision and
 * replays the rest, so a missing row costs time, never correctness. A plan
 * made here stays right after it goes stale, since new keyframes only push old
 * rows further past `keep`. Each DELETE is its own statement, outside any job's
 * transaction, skips rows a job holds, and is limited in rows and bytes.
 * A run holds its progress in memory; a second run after a partial one
 * continues where the first stopped, because it finds only what is left.
 */
export class KeyframeCleanupService implements IKeyframeCleanup {
  private readonly db: Kysely<Database>;
  private readonly schema: string;
  private readonly settings: KeyframeSettings;
  private readonly priority?: CatchUpPriority;
  private readonly maintenance?: IStoreMaintenance;
  private readonly limits: KeyframeCleanupLimits;

  private run?: KeyframeCleanupRun;
  private stop?: AbortController;
  private finished: Promise<void> = Promise.resolve();
  private lastReclaim?: KeyframeReclaim;
  private typeReports = new Map<string, KeyframeCleanupTypeReport>();
  private reasonReports = new Map<
    KeyframeCleanupReason,
    { rows: number; bytes: number }
  >();

  constructor(db: Kysely<Database>, options: KeyframeCleanupOptions) {
    this.db = db;
    this.schema = options.schema;
    this.settings = options.settings;
    this.priority = options.priority;
    this.maintenance = options.maintenance;
    this.limits = { ...DEFAULT_KEYFRAME_CLEANUP_LIMITS, ...options.limits };
  }

  start(options: { dryRun: boolean }): KeyframeCleanupRun {
    if (this.run?.state === "running") {
      throw new Error("A keyframe clean-up is already running");
    }
    if (this.lastReclaim?.state === "running") {
      throw new Error("The Keyframe table is being rewritten");
    }

    const run: KeyframeCleanupRun = {
      id: crypto.randomUUID(),
      dryRun: options.dryRun,
      state: "running",
      startedAtUtcMs: Date.now(),
      finishedAtUtcMs: null,
      documentsTotal: 0,
      documentsSeen: 0,
      parked: false,
      totals: emptyTotals(),
      types: [],
      reasons: [],
      topStreams: [],
      error: null,
    };
    const stop = new AbortController();
    this.run = run;
    this.stop = stop;
    this.typeReports = new Map();
    this.reasonReports = new Map();
    this.finished = this.execute(run, stop.signal);
    return structuredClone(run);
  }

  status(): KeyframeCleanupRun | null {
    return this.run ? structuredClone(this.run) : null;
  }

  cancel(): void {
    this.stop?.abort();
  }

  async reclaim(): Promise<KeyframeReclaim> {
    if (this.run?.state === "running") {
      throw new Error(
        "A keyframe clean-up is running; reclaim once it has finished",
      );
    }
    if (this.lastReclaim?.state === "running") {
      return { ...this.lastReclaim };
    }

    const startedAtUtcMs = Date.now();
    const maintenance = this.maintenance;
    if (!maintenance) {
      this.lastReclaim = {
        state: "unsupported",
        startedAtUtcMs,
        finishedAtUtcMs: startedAtUtcMs,
        tableBytesBefore: null,
        tableBytesAfter: null,
        durationMs: null,
        message: MANUAL_RECLAIM,
      };
      return { ...this.lastReclaim };
    }

    const reclaim: KeyframeReclaim = {
      state: "running",
      startedAtUtcMs,
      finishedAtUtcMs: null,
      tableBytesBefore: null,
      tableBytesAfter: null,
      durationMs: null,
      message:
        "Waiting for a quiet moment, then rewriting the Keyframe table. The store answers nothing while it rewrites.",
    };
    this.lastReclaim = reclaim;
    try {
      reclaim.tableBytesBefore = await this.tableBytes();
      // The new table, and the write-ahead log that carries it.
      const requiredFreeBytes = 2 * (await this.liveBytes());
      this.finished = this.rewrite(reclaim, maintenance, requiredFreeBytes);
    } catch (error) {
      this.finishReclaim(reclaim, "failed", errorMessage(error));
    }
    return { ...reclaim };
  }

  reclaimStatus(): KeyframeReclaim | null {
    return this.lastReclaim ? { ...this.lastReclaim } : null;
  }

  async shutdown(): Promise<void> {
    this.cancel();
    await this.finished;
  }

  private async execute(
    run: KeyframeCleanupRun,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      run.documentsTotal = await this.countDocuments();
      let after = "";
      for (;;) {
        await this.giveWay(run, signal);
        if (signal.aborted) {
          this.finishRun(run, "cancelled");
          return;
        }
        const page = await this.nextDocuments(after);
        if (page.length === 0) {
          break;
        }
        await this.processPage(run, page, signal);
        run.documentsSeen += page.length;
        after = page[page.length - 1]!;
      }
      this.finishRun(run, "done");
    } catch (error) {
      run.error = errorMessage(error);
      this.finishRun(run, "failed");
    }
  }

  private async processPage(
    run: KeyframeCleanupRun,
    documentIds: string[],
    signal: AbortSignal,
  ): Promise<void> {
    const rows = await this.readRows(documentIds);
    const deleted = await this.readDeleted(documentIds);

    const streams = new Map<string, KeyframeRow[]>();
    for (const row of rows) {
      const key = streamKey(row);
      const stream = streams.get(key);
      if (stream) stream.push(row);
      else streams.set(key, [row]);
    }

    const removable: RemovableRow[] = [];
    for (const stream of streams.values()) {
      removable.push(...this.planStream(run, stream, deleted));
    }
    this.publishReports(run);

    if (run.dryRun) {
      return;
    }
    const statements = statementsOf(
      removable,
      this.limits.rowsPerStatement,
      this.limits.bytesPerStatement,
    );
    for (const statement of statements) {
      await this.giveWay(run, signal);
      if (signal.aborted) {
        return;
      }
      await this.remove(run, statement);
    }
    this.publishReports(run);
  }

  /** Tallies one stream, whose rows are newest first, and returns what goes. */
  private planStream(
    run: KeyframeCleanupRun,
    stream: KeyframeRow[],
    deleted: Set<string>,
  ): RemovableRow[] {
    const newest = stream[0]!;
    const rule = resolveKeyframeRule(this.settings, newest.documentType);
    const isDeleted = deleted.has(
      documentBranchKey(newest.documentId, newest.branch),
    );
    const reason: KeyframeCleanupReason = isDeleted
      ? "deleted-document"
      : "beyond-keep";
    const kept = isDeleted ? 0 : (rule.keep ?? stream.length);
    const removable = stream.slice(kept);

    const type = this.typeReport(newest.documentType);
    const bytes = stream.reduce((sum, row) => sum + row.bytes, 0);
    const removableBytes = removable.reduce((sum, row) => sum + row.bytes, 0);

    for (const totals of [run.totals, type]) {
      totals.streams += 1;
      totals.rows += stream.length;
      totals.bytes += bytes;
      totals.removableRows += removable.length;
      totals.removableBytes += removableBytes;
    }

    if (removable.length > 0) {
      const tally = this.reasonReports.get(reason) ?? { rows: 0, bytes: 0 };
      tally.rows += removable.length;
      tally.bytes += removableBytes;
      this.reasonReports.set(reason, tally);
      this.noteTopStream(run, {
        documentId: newest.documentId,
        documentType: newest.documentType,
        scope: newest.scope,
        branch: newest.branch,
        reason,
        rows: stream.length,
        bytes,
        removableRows: removable.length,
        removableBytes,
      });
    }

    return removable.map((row) => ({
      id: row.id,
      documentType: row.documentType,
      bytes: row.bytes,
    }));
  }

  private noteTopStream(
    run: KeyframeCleanupRun,
    stream: KeyframeCleanupStreamReport,
  ): void {
    run.topStreams.push(stream);
    run.topStreams.sort((a, b) => b.removableBytes - a.removableBytes);
    run.topStreams.length = Math.min(
      run.topStreams.length,
      this.limits.topStreams,
    );
  }

  private typeReport(documentType: string): KeyframeCleanupTypeReport {
    const existing = this.typeReports.get(documentType);
    if (existing) return existing;
    const rule = resolveKeyframeRule(this.settings, documentType);
    const report: KeyframeCleanupTypeReport = {
      documentType,
      keep: rule.keep,
      interval: rule.interval,
      ...emptyTotals(),
    };
    this.typeReports.set(documentType, report);
    return report;
  }

  private publishReports(run: KeyframeCleanupRun): void {
    run.types = [...this.typeReports.values()].sort(
      (a, b) => b.removableBytes - a.removableBytes || b.bytes - a.bytes,
    );
    run.reasons = [...this.reasonReports.entries()].map(([reason, tally]) => ({
      reason,
      rows: tally.rows,
      bytes: tally.bytes,
    }));
  }

  private async remove(
    run: KeyframeCleanupRun,
    statement: RemovableRow[],
  ): Promise<void> {
    const rows = await this.db
      .deleteFrom("Keyframe")
      .where("id", "in", (eb) =>
        eb
          .selectFrom("Keyframe")
          .select("id")
          .where(
            "id",
            "in",
            statement.map((row) => row.id),
          )
          .forUpdate()
          .skipLocked(),
      )
      .returning("id")
      .execute();

    const removed = new Set(rows.map((row) => row.id));
    for (const row of statement) {
      if (!removed.has(row.id)) continue;
      const type = this.typeReport(row.documentType);
      for (const totals of [run.totals, type]) {
        totals.removedRows += 1;
        totals.removedBytes += row.bytes;
      }
    }
  }

  private async giveWay(
    run: KeyframeCleanupRun,
    signal: AbortSignal,
  ): Promise<void> {
    let settings = this.priority?.get().settings;
    while (settings?.giveWay === "stop" && !signal.aborted) {
      run.parked = true;
      await pauseFor(this.limits.parkedPollMs, signal);
      settings = this.priority?.get().settings;
    }
    run.parked = false;
    await pauseFor(
      Math.max(this.limits.pauseMs, settings?.pauseMs ?? 0),
      signal,
    );
  }

  private async countDocuments(): Promise<number> {
    const row = await this.db
      .selectFrom("Keyframe")
      .select(sql<string | number>`count(distinct "documentId")`.as("count"))
      .executeTakeFirstOrThrow();
    return Number(row.count);
  }

  private async nextDocuments(after: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom("Keyframe")
      .select("documentId")
      .distinct()
      .where("documentId", ">", after)
      .orderBy("documentId")
      .limit(this.limits.documentsPerPage)
      .execute();
    return rows.map((row) => row.documentId);
  }

  /** `pg_column_size` reads a TOAST pointer, so no document body is fetched. */
  private async readRows(documentIds: string[]): Promise<KeyframeRow[]> {
    const rows = await this.db
      .selectFrom("Keyframe")
      .select([
        "id",
        "documentId",
        "documentType",
        "scope",
        "branch",
        "revision",
        sql<number>`pg_column_size("document")`.as("bytes"),
      ])
      .where("documentId", "in", documentIds)
      .orderBy("documentId")
      .orderBy("scope")
      .orderBy("branch")
      .orderBy("revision", "desc")
      .execute();
    return rows.map((row) => ({ ...row, bytes: Number(row.bytes) }));
  }

  /** The write side's flag, or the view's for a document it never recorded. */
  private async readDeleted(documentIds: string[]): Promise<Set<string>> {
    const identities = await this.db
      .selectFrom("WriteIdentity")
      .select(["documentId", "branch"])
      .where("isDeleted", "=", true)
      .where("documentId", "in", documentIds)
      .execute();
    const views = await this.db
      .selectFrom("DocumentSnapshot")
      .select(["documentId", "branch"])
      .where("scope", "=", "header")
      .where("isDeleted", "=", true)
      .where("documentId", "in", documentIds)
      .execute();
    return new Set(
      [...identities, ...views].map((row) =>
        documentBranchKey(row.documentId, row.branch),
      ),
    );
  }

  private async tableBytes(): Promise<number> {
    const result = await sql<{ bytes: string | number }>`
      select pg_total_relation_size(${`"${this.schema}"."Keyframe"`}::regclass) as bytes
    `.execute(this.db);
    return Number(result.rows[0]?.bytes ?? 0);
  }

  /** What the rewrite copies, TOAST included: stored sizes of the live rows. */
  private async liveBytes(): Promise<number> {
    const row = await this.db
      .selectFrom("Keyframe")
      .select(
        sql<string | number | null>`sum(pg_column_size("document"))`.as(
          "bytes",
        ),
      )
      .executeTakeFirstOrThrow();
    return Number(row.bytes ?? 0);
  }

  private async rewrite(
    reclaim: KeyframeReclaim,
    maintenance: IStoreMaintenance,
    requiredFreeBytes: number,
  ): Promise<void> {
    let message: string;
    try {
      const result = await maintenance.rewriteTable({
        schema: this.schema,
        table: "Keyframe",
        requiredFreeBytes,
      });
      if (result.outcome === "busy") {
        this.finishReclaim(reclaim, "busy", result.reason);
        return;
      }
      if (result.outcome === "refused") {
        this.finishReclaim(reclaim, "failed", result.reason);
        return;
      }
      reclaim.durationMs = result.durationMs;
      message = "The Keyframe table was rewritten.";
    } catch (error) {
      this.finishReclaim(reclaim, "failed", errorMessage(error));
      return;
    }
    try {
      reclaim.tableBytesAfter = await this.tableBytes();
    } catch (error) {
      message = `The Keyframe table was rewritten, but its new size could not be read: ${errorMessage(error)}`;
    }
    this.finishReclaim(reclaim, "done", message);
  }

  private finishRun(
    run: KeyframeCleanupRun,
    state: KeyframeCleanupRun["state"],
  ): void {
    this.publishReports(run);
    run.parked = false;
    run.state = state;
    run.finishedAtUtcMs = Date.now();
  }

  private finishReclaim(
    reclaim: KeyframeReclaim,
    state: KeyframeReclaim["state"],
    message: string,
  ): void {
    reclaim.state = state;
    reclaim.message = message;
    reclaim.finishedAtUtcMs = Date.now();
  }
}
