// Workflow execution is a SINGLETON pinned to one reactor (multi-reactor plan,
// agreed decision 3). Non-Node reactors cannot compose the engine at all — it
// forks child processes — so the real hazard is TWO NODE REPLICAS over one
// journal, which is not a theoretical one: `WorkflowRunStore.create` runs
// `recoverOrphanedRuns`/`recoverAbandonedRuns` when the journal opens, and
// those sweeps close out every RUNNING and PENDING run that is not in THIS
// process's `runsInFlight`. A second replica booting therefore marks the first
// replica's live runs FAILED, and then both of them arm every trigger.
//
// This is that guard, made structural rather than documented: a durable claim
// on the run journal's own database, taken before the runtime is built. One
// row, one owner, a heartbeat, and takeover once the lease expires.
//
// A dedicated table rather than the `trigger_state.lease_owner` /
// `lease_expires_at` columns: those are PER TRIGGER, which is the wrong
// granularity (the sweeps and the supervisor are per PROCESS), and a lease is
// not trigger state — it outlives every row in that table. They stay in the
// schema, always null and unread.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { sql } from "kysely";
import { childLogger, type ILogger } from "document-model";
import { hostname } from "node:os";
import { createHash, randomUUID } from "node:crypto";

const logger = childLogger(["workflow", "runtime", "singleton"]);

/**
 * Names this process as the workflow singleton's owner.
 *
 * Set it to a STABLE name per deployment slot (`switchboard-0`, the
 * StatefulSet pod name, the Render service id). The owner name is the
 * operator's contract: a restart under the same name re-claims its own lease
 * once the old heartbeat is stale instead of waiting out
 * {@link SINGLETON_LEASE_TTL_MS}.
 *
 * Unset, the owner is derived from a STABLE identity — the hostname and a
 * fingerprint of the journal's own storage location ({@link
 * AcquireSingletonOptions.storageId}) — not from the pid and a random suffix.
 * A random per-process owner meant every unclean kill locked the next boot out
 * for the whole {@link SINGLETON_LEASE_TTL_MS}: the dead process's lease was
 * nobody's to re-claim, and `release()` never ran. One deployment slot
 * restarting is the common case and it has to be quick; a genuine second
 * replica still differs, by hostname or by the journal it points at.
 */
export const WORKFLOW_SINGLETON_OWNER_ENV = "PH_WORKFLOWS_SINGLETON_OWNER";

/** How long a claim stays valid without a heartbeat. */
export const SINGLETON_LEASE_TTL_MS = 60_000;

/** How often the holder renews it; a third of the TTL, so two renewals may be
 * lost (a GC pause, a slow database) before anyone may take over. */
export const SINGLETON_HEARTBEAT_MS = SINGLETON_LEASE_TTL_MS / 3;

/**
 * How long the holder's heartbeat must have been silent before a claim under
 * the SAME owner name takes the lease over, short of its expiry. Two renewal
 * periods: a live holder renews well inside it, and its self-fence fires
 * before it passes.
 */
export const SINGLETON_STALE_HEARTBEATS = 2;

/** The one row. The table holds a single lease, named rather than keyed by a
 * magic empty string, so a `SELECT *` reads legibly in an operator's shell. */
const LEASE_ID = "workflow-runtime";

// Timestamps are the database's own clock: two hosts never compare their
// process clocks against each other.
interface SingletonLeaseRow {
  id: string;
  owner: string;
  /** Random per claim, never configured: two processes under one stable
   * owner name still hold different instances. */
  instance: string;
  acquired_at: Date;
  heartbeat_at: Date;
  expires_at: Date;
}

// Not `singleton_lease`: an unreleased branch build created that name with
// text timestamps and no instance column, which CREATE IF NOT EXISTS would
// keep and every claim would then fail on.
interface SingletonLeaseDB {
  workflow_singleton: SingletonLeaseRow;
}

const dbNow = () => sql<Date>`now()`;
const dbNowPlus = (ms: number) =>
  sql<Date>`now() + ${ms} * interval '1 millisecond'`;

/** Another live process holds the singleton. The refusal is the point: a host
 * that cannot own workflow execution must not compose the engine. */
export class WorkflowSingletonConflictError extends Error {
  constructor(
    readonly owner: string,
    readonly expiresAt: string,
    readonly wouldBe: string,
  ) {
    super(
      `Workflow execution is a singleton and "${owner}" holds it until ` +
        `${expiresAt}; this process ("${wouldBe}") must not compose the ` +
        "workflow runtime. Two replicas over one run journal fail each " +
        "other's live runs and arm every trigger twice. Run workflows on " +
        `exactly one reactor, or set ${WORKFLOW_SINGLETON_OWNER_ENV} to the ` +
        "same stable owner name on the slot that owns them so a restart " +
        "re-claims its own lease.",
    );
    this.name = "WorkflowSingletonConflictError";
  }
}

/** A held claim, renewed from the moment it is taken. The host releases it on
 * shutdown, so the next boot does not wait out the TTL. */
export interface WorkflowSingletonLease {
  readonly owner: string;
  /** Renews once; false when the lease is no longer ours. */
  heartbeat(): Promise<boolean>;
  /** Stops renewing and drops the row if it is still ours. */
  release(): Promise<void>;
}

export interface AcquireSingletonOptions {
  relationalDb: IRelationalDb;
  logger?: ILogger;
  /** Defaults to {@link WORKFLOW_SINGLETON_OWNER_ENV}, then
   * `<hostname>/<storageId fingerprint>`. */
  owner?: string;
  /**
   * Where this host's journal lives — a Postgres URL, an absolute PGlite
   * directory — as the stable half of the default owner name. Hashed, so a
   * connection string's credentials never reach the lease row or a log line.
   *
   * It is what separates two hosts that share a hostname but not a journal,
   * and it is stable across restarts, which is the whole point.
   */
  storageId?: string;
  ttlMs?: number;
  heartbeatMs?: number;
  /** Called once, when a heartbeat finds the lease held by another claim
   * (another process, or a newer one under the same owner name). Receives
   * the current holder's owner name, if any. */
  onLost?: (heldBy: string | undefined) => void;
  env?: Record<string, string | undefined>;
}

/**
 * The owner name this process claims under.
 *
 * `<hostname>/<storage fingerprint>`, so it is the same name on every boot of
 * one deployment slot — a restart re-claims its OWN lease once the dead
 * process's heartbeat is stale, rather than waiting out the TTL — and a different
 * name on any host or journal that is genuinely somebody else.
 *
 * The storage location is hashed, never printed: it can be a Postgres URL with
 * credentials in it, and the owner name goes into a database row an operator
 * reads and into every log line about the lease.
 *
 * The residual case a stable name cannot tell apart is two processes on ONE
 * host over ONE journal, which is a misconfiguration those two already share
 * (one read-model directory, one run journal). It is not silent: the loser's
 * heartbeat finds the lease taken and says so by name.
 */
export function singletonOwnerName(
  env: Record<string, string | undefined> = process.env,
  storageId?: string,
): string {
  const configured = env[WORKFLOW_SINGLETON_OWNER_ENV]?.trim();
  if (configured) return configured;
  return `${hostname()}/${storageFingerprint(storageId)}`;
}

function storageFingerprint(storageId: string | undefined): string {
  const source = storageId?.trim();
  if (!source) return "default";
  return createHash("sha256").update(source).digest("hex").slice(0, 12);
}

async function ensureTable(db: IRelationalDb<SingletonLeaseDB>): Promise<void> {
  await db.schema
    .createTable("workflow_singleton")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner", "text", (col) => col.notNull())
    .addColumn("instance", "text", (col) => col.notNull())
    .addColumn("acquired_at", "timestamptz", (col) => col.notNull())
    .addColumn("heartbeat_at", "timestamptz", (col) => col.notNull())
    .addColumn("expires_at", "timestamptz", (col) => col.notNull())
    .ifNotExists()
    .execute();
}

// unique_violation and duplicate_table/schema: two hosts on a fresh database
// both passed IF NOT EXISTS, and the loser hit the catalog's unique index.
// The schema and the table can each race once, so three attempts suffice.
const DDL_ATTEMPTS = 3;
const CONCURRENT_DDL_CODES = new Set(["23505", "42P06", "42P07"]);

function isConcurrentDdl(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && CONCURRENT_DDL_CODES.has(code);
}

async function openLeaseTable(
  relationalDb: IRelationalDb,
): Promise<IRelationalDb<SingletonLeaseDB>> {
  const open = async () => {
    const db = (await relationalDb.createNamespace(
      "workflow_runtime",
    )) as IRelationalDb<SingletonLeaseDB>;
    await ensureTable(db);
    return db;
  };
  for (let attempt = 1; ; attempt++) {
    try {
      return await open();
    } catch (error) {
      if (attempt >= DDL_ATTEMPTS || !isConcurrentDdl(error)) throw error;
    }
  }
}

/**
 * Claims the workflow singleton, or refuses.
 *
 * Three steps, each one a single statement whose own outcome is the claim — a
 * prior `SELECT` would be a race:
 *
 * 1. `INSERT … ON CONFLICT DO NOTHING RETURNING` — the first ever boot.
 * 2. `UPDATE … WHERE expires_at <= now OR (owner = me AND heartbeat stale)
 *    RETURNING` — a dead lease taken over once it has expired, or our own
 *    slot's lease once its holder stopped renewing (a restart under a stable
 *    owner name), never a live holder's. Either way the row gets this claim's
 *    instance, so the previous holder's heartbeat and release no longer
 *    match.
 * 3. Neither matched: someone live holds it, and we refuse by name.
 */
export async function acquireWorkflowSingletonLease(
  options: AcquireSingletonOptions,
): Promise<WorkflowSingletonLease> {
  const log = options.logger ?? logger;
  const ttlMs = options.ttlMs ?? SINGLETON_LEASE_TTL_MS;
  const heartbeatMs = options.heartbeatMs ?? SINGLETON_HEARTBEAT_MS;
  const staleMs = heartbeatMs * SINGLETON_STALE_HEARTBEATS;
  const owner =
    options.owner ?? singletonOwnerName(options.env, options.storageId);
  const instance = randomUUID();

  const db = await openLeaseTable(options.relationalDb);

  const stamps = () => ({
    heartbeat_at: dbNow(),
    expires_at: dbNowPlus(ttlMs),
  });

  const claim = async (): Promise<boolean> => {
    const inserted = await db
      .insertInto("workflow_singleton")
      .values({
        id: LEASE_ID,
        owner,
        instance,
        acquired_at: dbNow(),
        ...stamps(),
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .returning("owner")
      .executeTakeFirst();
    if (inserted !== undefined) return true;
    const taken = await db
      .updateTable("workflow_singleton")
      .set({ owner, instance, acquired_at: dbNow(), ...stamps() })
      .where("id", "=", LEASE_ID)
      .where((eb) =>
        eb.or([
          eb("expires_at", "<=", dbNow()),
          // Never from a live holder, even under our own name: the new
          // process opening the journal would fail the old one's live runs.
          eb.and([
            eb("owner", "=", owner),
            eb("heartbeat_at", "<=", dbNowPlus(-staleMs)),
          ]),
        ]),
      )
      .returning("owner")
      .executeTakeFirst();
    return taken !== undefined;
  };

  const claimSentAt = performance.now();
  if (!(await claim())) {
    const held = await db
      .selectFrom("workflow_singleton")
      .selectAll()
      .where("id", "=", LEASE_ID)
      .executeTakeFirst();
    throw new WorkflowSingletonConflictError(
      held?.owner ?? "unknown",
      held ? new Date(held.expires_at).toISOString() : "unknown",
      owner,
    );
  }
  log.info(
    `Workflow singleton claimed by "${owner}" (lease ${ttlMs}ms, renewed every ${heartbeatMs}ms)`,
  );

  // Local monotonic time, never compared with the database's: only how long
  // this process has gone without a renewal it knows landed.
  const localNow = () => performance.now();
  const tickMs = heartbeatMs / 4;
  // Before anyone may take the lease: a stale same-owner claim, or expiry.
  const takeableAfterMs = Math.min(staleMs, ttlMs);
  const fenceMs = takeableAfterMs - Math.min(heartbeatMs, ttlMs) / 2;
  let renewedAt = claimSentAt;
  let renewFailed = false;
  let inFlight: Promise<boolean> | undefined;
  let timer: NodeJS.Timeout | undefined;
  let lost = false;
  let releasing = false;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  const markLost = (heldBy: string | undefined, why: string) => {
    if (lost) return;
    lost = true;
    stop();
    log.error(
      `Workflow singleton lease of "${owner}" ${why}; this process no ` +
        "longer owns workflow execution and stops running it.",
    );
    options.onLost?.(heldBy);
  };

  // Keyed on the instance as well as the owner: under a stable owner name an
  // old process must never renew a newer process's claim.
  const renew = async (): Promise<boolean> => {
    const sentAt = localNow();
    const renewed = await db
      .updateTable("workflow_singleton")
      .set(stamps())
      .where("id", "=", LEASE_ID)
      .where("owner", "=", owner)
      .where("instance", "=", instance)
      .returning("owner")
      .executeTakeFirst();
    if (renewed !== undefined) {
      renewedAt = sentAt;
      return true;
    }
    if (releasing || lost) return false;
    let heldBy: string | undefined;
    try {
      const held = await db
        .selectFrom("workflow_singleton")
        .select("owner")
        .where("id", "=", LEASE_ID)
        .executeTakeFirst();
      heldBy = held?.owner;
    } catch {
      heldBy = undefined;
    }
    markLost(heldBy, `is now held by "${heldBy ?? "nobody"}"`);
    return false;
  };

  const heartbeat = (): Promise<boolean> => {
    if (lost) return Promise.resolve(false);
    inFlight ??= renew().finally(() => {
      inFlight = undefined;
    });
    return inFlight;
  };

  // From the claim, not from the host's start: composing can outlast the TTL.
  timer = setInterval(() => {
    if (lost || releasing) return;
    const silentMs = localNow() - renewedAt;
    // Checked even while a renewal hangs: journal writes are best-effort, so
    // a holder that cannot renew would otherwise keep running workflows.
    if (silentMs >= fenceMs) {
      markLost(
        undefined,
        `could not be renewed for ${Math.round(silentMs)}ms and may be ` +
          "taken over",
      );
      return;
    }
    if (inFlight) return;
    // A failed renewal retries every tick rather than every period.
    if (!renewFailed && silentMs < heartbeatMs - tickMs / 2) return;
    heartbeat().then(
      () => {
        renewFailed = false;
      },
      (error: unknown) => {
        renewFailed = true;
        log.warn("Workflow singleton heartbeat failed: @error", error);
      },
    );
  }, tickMs);
  // The claim must not be what keeps the process alive.
  timer.unref();

  return {
    owner,
    heartbeat,
    async release() {
      releasing = true;
      stop();
      if (lost) return;
      // A renewal answered after the DELETE would read as a lost lease.
      if (inFlight) {
        await Promise.race([
          inFlight.catch(() => false),
          new Promise((resolve) => setTimeout(resolve, tickMs).unref()),
        ]);
      }
      if (lost) return;
      try {
        await db
          .deleteFrom("workflow_singleton")
          .where("id", "=", LEASE_ID)
          .where("owner", "=", owner)
          .where("instance", "=", instance)
          .execute();
      } catch (error) {
        // The lease expires on its own; a failed release costs the next boot
        // the TTL, nothing more.
        log.warn(
          "Could not release the workflow singleton lease: @error",
          error,
        );
      }
    },
  };
}
