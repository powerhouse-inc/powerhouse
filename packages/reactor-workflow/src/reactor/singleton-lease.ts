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
 * immediately instead of waiting out {@link SINGLETON_LEASE_TTL_MS}, which is
 * exactly the rolling-deploy overlap the dead lease columns were written for.
 *
 * Unset, the owner is derived from a STABLE identity — the hostname and a
 * fingerprint of the journal's own storage location ({@link
 * AcquireSingletonOptions.storageId}) — not from the pid and a random suffix.
 * A random per-process owner meant every unclean kill locked the next boot out
 * for the whole {@link SINGLETON_LEASE_TTL_MS}: the dead process's lease was
 * nobody's to re-claim, and `release()` never ran. One deployment slot
 * restarting is the common case and it has to be instant; a genuine second
 * replica still differs, by hostname or by the journal it points at.
 */
export const WORKFLOW_SINGLETON_OWNER_ENV = "PH_WORKFLOWS_SINGLETON_OWNER";

/** How long a claim stays valid without a heartbeat. */
export const SINGLETON_LEASE_TTL_MS = 60_000;

/** How often the holder renews it; a third of the TTL, so two renewals may be
 * lost (a GC pause, a slow database) before anyone may take over. */
export const SINGLETON_HEARTBEAT_MS = SINGLETON_LEASE_TTL_MS / 3;

/** The one row. The table holds a single lease, named rather than keyed by a
 * magic empty string, so a `SELECT *` reads legibly in an operator's shell. */
const LEASE_ID = "workflow-runtime";

interface SingletonLeaseRow {
  id: string;
  owner: string;
  /** Random per claim, never configured: two processes under one stable
   * owner name still hold different instances. */
  instance: string;
  acquired_at: string;
  heartbeat_at: string;
  expires_at: string;
}

interface SingletonLeaseDB {
  singleton_lease: SingletonLeaseRow;
}

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
  now?: () => Date;
  env?: Record<string, string | undefined>;
}

/**
 * The owner name this process claims under.
 *
 * `<hostname>/<storage fingerprint>`, so it is the same name on every boot of
 * one deployment slot — a restart re-claims its OWN lease at once rather than
 * waiting out the TTL for a dead process's claim to expire — and a different
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
    .createTable("singleton_lease")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner", "text", (col) => col.notNull())
    .addColumn("instance", "text", (col) => col.notNull())
    .addColumn("acquired_at", "text", (col) => col.notNull())
    .addColumn("heartbeat_at", "text", (col) => col.notNull())
    .addColumn("expires_at", "text", (col) => col.notNull())
    .ifNotExists()
    .execute();
}

/**
 * Claims the workflow singleton, or refuses.
 *
 * Three steps, each one a single statement whose own outcome is the claim — a
 * prior `SELECT` would be a race:
 *
 * 1. `INSERT … ON CONFLICT DO NOTHING RETURNING` — the first ever boot.
 * 2. `UPDATE … WHERE owner = me OR expires_at <= now RETURNING` — our own
 *    lease back (a restart under a stable owner name), or a dead one taken
 *    over once it has expired. Either way the row gets this claim's instance,
 *    so the previous holder's heartbeat and release no longer match.
 * 3. Neither matched: someone live holds it, and we refuse by name.
 */
export async function acquireWorkflowSingletonLease(
  options: AcquireSingletonOptions,
): Promise<WorkflowSingletonLease> {
  const log = options.logger ?? logger;
  const now = options.now ?? (() => new Date());
  const ttlMs = options.ttlMs ?? SINGLETON_LEASE_TTL_MS;
  const heartbeatMs = options.heartbeatMs ?? SINGLETON_HEARTBEAT_MS;
  const owner =
    options.owner ?? singletonOwnerName(options.env, options.storageId);
  const instance = randomUUID();

  const db = (await options.relationalDb.createNamespace(
    "workflow_runtime",
  )) as IRelationalDb<SingletonLeaseDB>;
  await ensureTable(db);

  const stamps = () => {
    const at = now();
    return {
      heartbeat_at: at.toISOString(),
      expires_at: new Date(at.getTime() + ttlMs).toISOString(),
    };
  };

  const claim = async (): Promise<boolean> => {
    const times = stamps();
    const inserted = await db
      .insertInto("singleton_lease")
      .values({
        id: LEASE_ID,
        owner,
        instance,
        acquired_at: times.heartbeat_at,
        ...times,
      })
      .onConflict((oc) => oc.column("id").doNothing())
      .returning("owner")
      .executeTakeFirst();
    if (inserted !== undefined) return true;
    const taken = await db
      .updateTable("singleton_lease")
      .set({ owner, instance, acquired_at: times.heartbeat_at, ...times })
      .where("id", "=", LEASE_ID)
      .where((eb) =>
        eb.or([
          eb("owner", "=", owner),
          eb("expires_at", "<=", times.heartbeat_at),
        ]),
      )
      .returning("owner")
      .executeTakeFirst();
    return taken !== undefined;
  };

  if (!(await claim())) {
    const held = await db
      .selectFrom("singleton_lease")
      .selectAll()
      .where("id", "=", LEASE_ID)
      .executeTakeFirst();
    throw new WorkflowSingletonConflictError(
      held?.owner ?? "unknown",
      held?.expires_at ?? "unknown",
      owner,
    );
  }
  log.info(
    `Workflow singleton claimed by "${owner}" (lease ${ttlMs}ms, renewed every ${heartbeatMs}ms)`,
  );

  let timer: NodeJS.Timeout | undefined;
  let lost = false;

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = undefined;
  };

  // Idempotent: two renewals in flight can both find the lease gone.
  const markLost = async () => {
    if (lost) return;
    lost = true;
    stop();
    let heldBy: string | undefined;
    try {
      const held = await db
        .selectFrom("singleton_lease")
        .select("owner")
        .where("id", "=", LEASE_ID)
        .executeTakeFirst();
      heldBy = held?.owner;
    } catch {
      heldBy = undefined;
    }
    log.error(
      `Workflow singleton lease of "${owner}" is now held by ` +
        `"${heldBy ?? "nobody"}"; this process no longer owns workflow ` +
        "execution and stops running it.",
    );
    options.onLost?.(heldBy);
  };

  // Keyed on the instance as well as the owner: under a stable owner name an
  // old process must never renew a newer process's claim.
  const heartbeat = async (): Promise<boolean> => {
    if (lost) return false;
    const renewed = await db
      .updateTable("singleton_lease")
      .set(stamps())
      .where("id", "=", LEASE_ID)
      .where("owner", "=", owner)
      .where("instance", "=", instance)
      .returning("owner")
      .executeTakeFirst();
    if (renewed !== undefined) return true;
    await markLost();
    return false;
  };

  // From the claim, not from the host's start: composing can outlast the TTL.
  timer = setInterval(() => {
    // A failed renewal is not a lost lease: the lease and the journal share
    // one database, so a process that cannot renew cannot write either. The
    // next tick retries.
    heartbeat().catch((error: unknown) => {
      log.warn("Workflow singleton heartbeat failed: @error", error);
    });
  }, heartbeatMs);
  // The claim must not be what keeps the process alive.
  timer.unref();

  return {
    owner,
    heartbeat,
    async release() {
      stop();
      if (lost) return;
      try {
        await db
          .deleteFrom("singleton_lease")
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
