// Persisted run journal in the relational "workflow_runtime" namespace.
// Dates are ISO text columns: PGlite parses `timestamp` as local time.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import {
  redact,
  redactMessage,
  type StepExecutionRecord,
  type WorkflowRunResult,
} from "../pieces/index.js";
import { childLogger } from "document-model";
import { randomUUID } from "node:crypto";
import { PROJECT_SCOPE_KEY } from "./piece-store-port.js";

export interface RunRow {
  id: string;
  workflow_id: string;
  workflow_name: string;
  workflow_version: number;
  trigger_kind: string;
  trigger_payload: string | null;
  status: string;
  error: string | null;
  started_at: string;
  ended_at: string | null;
  // Failed run this one resumes; null for first-hand runs.
  rerun_of: string | null;
}

export interface StepExecutionRow {
  id: string;
  run_id: string;
  // Execution order; runs journaled before per-step journaling landed hold
  // the definition index. Both are per-run, and nothing compares across runs.
  ordinal: number;
  step_id: string;
  step_key: string;
  block_type: string;
  status: string;
  input: string | null;
  output: string | null;
  port: string | null;
  error: string | null;
}

export interface TriggerStateRow {
  workflow_id: string;
  block_type: string;
  config_hash: string;
  status: string; // ENABLED | DISABLED | ERROR
  // Vestigial: hook state lives in piece_store now, and this is written "{}"
  // and never read. Rolling back past the migration re-delivers; see up().
  store_state: string;
  interval_ms: number;
  next_poll_at: string | null;
  last_poll_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  // Written for rolling-deploy overlap; not enforced yet.
  lease_owner: string | null;
  lease_expires_at: string | null;
  updated_at: string;
}

export interface TriggerDedupeRow {
  workflow_id: string;
  dedupe_key: string;
  run_id: string | null;
  created_at: string;
}

// One key a piece wrote through `ctx.store`, from an action or a trigger hook
// alike — the same table for both, as Activepieces has.

// `scope` mirrors their StoreScope: FLOW partitions by workflow, PROJECT by
// the reactor, which is the only project identity we have. See issue #16.
export interface PieceStoreRow {
  scope: string; // FLOW | PROJECT
  scope_key: string;
  key: string;
  value: string; // JSON
  updated_at: string;
}

export interface WorkflowRuntimeDB {
  run: RunRow;
  step_execution: StepExecutionRow;
  trigger_state: TriggerStateRow;
  trigger_dedupe: TriggerDedupeRow;
  piece_store: PieceStoreRow;
}

const logger = childLogger(["workflow", "runtime", "store"]);

// Recorded as the run's error when the reactor died mid-run, so the cause is
// legible in the UI rather than the run just stopping.
export const ORPHANED_RUN_ERROR =
  "Reactor stopped before the run finished; steps completed before then were journaled";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Postgres 42P07: the constraint's backing index is already there, which is
// what a re-run migration looks like. Bad data raises 23505 instead.
function isDuplicateObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === "42P07";
}

async function up(db: IRelationalDb<WorkflowRuntimeDB>): Promise<Set<string>> {
  await db.schema
    .createTable("run")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("workflow_id", "text", (col) => col.notNull())
    .addColumn("workflow_name", "text", (col) => col.notNull())
    .addColumn("workflow_version", "integer", (col) => col.notNull())
    .addColumn("trigger_kind", "text", (col) => col.notNull())
    .addColumn("trigger_payload", "text")
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("error", "text")
    .addColumn("started_at", "text", (col) => col.notNull())
    .addColumn("ended_at", "text")
    .addColumn("rerun_of", "text")
    .ifNotExists()
    .execute();

  // Additive migration for journals created before rerun support.
  try {
    await db.schema.alterTable("run").addColumn("rerun_of", "text").execute();
  } catch {
    // column already exists
  }

  await db.schema
    .createTable("trigger_state")
    .addColumn("workflow_id", "text", (col) => col.primaryKey())
    .addColumn("block_type", "text", (col) => col.notNull())
    .addColumn("config_hash", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("store_state", "text", (col) => col.notNull())
    .addColumn("interval_ms", "integer", (col) => col.notNull())
    .addColumn("next_poll_at", "text")
    .addColumn("last_poll_at", "text")
    .addColumn("last_error", "text")
    .addColumn("consecutive_failures", "integer", (col) => col.notNull())
    .addColumn("lease_owner", "text")
    .addColumn("lease_expires_at", "text")
    .addColumn("updated_at", "text", (col) => col.notNull())
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("trigger_dedupe")
    .addColumn("workflow_id", "text", (col) => col.notNull())
    .addColumn("dedupe_key", "text", (col) => col.notNull())
    .addColumn("run_id", "text")
    .addColumn("created_at", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("trigger_dedupe_pk", ["workflow_id", "dedupe_key"])
    .ifNotExists()
    .execute();

  await db.schema
    .createTable("step_execution")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("run_id", "text", (col) => col.notNull())
    .addColumn("ordinal", "integer", (col) => col.notNull())
    .addColumn("step_id", "text", (col) => col.notNull())
    .addColumn("step_key", "text", (col) => col.notNull())
    .addColumn("block_type", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("input", "text")
    .addColumn("output", "text")
    .addColumn("port", "text")
    .addColumn("error", "text")
    .addUniqueConstraint("step_execution_run_step", ["run_id", "step_id"])
    .ifNotExists()
    .execute();

  // Additive migration for journals created before per-step journaling: the
  // upsert in recordStep/finishRun needs this constraint to conflict on.
  try {
    await db.schema
      .alterTable("step_execution")
      .addUniqueConstraint("step_execution_run_step", ["run_id", "step_id"])
      .execute();
  } catch (error) {
    // Only "already there" is benign. Swallowing anything else would leave
    // every later upsert failing on a missing ON CONFLICT target.
    if (!isDuplicateObject(error)) {
      throw new Error(
        `Could not add the step_execution (run_id, step_id) unique constraint, ` +
          `which per-step journaling upserts against: ${errorMessage(error)}`,
        { cause: error },
      );
    }
  }

  await db.schema
    .createTable("piece_store")
    .addColumn("scope", "text", (col) => col.notNull())
    .addColumn("scope_key", "text", (col) => col.notNull())
    .addColumn("key", "text", (col) => col.notNull())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("updated_at", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("piece_store_pk", ["scope", "scope_key", "key"])
    .ifNotExists()
    .execute();

  // The reactor's webhook service owns tokens now, in its own namespace, so
  // the local table is dead weight wherever the GraphQL ingress once ran.

  // Nothing is migrated: those tokens addressed a mutation that no longer
  // exists, so a trigger re-enables onto a freshly minted endpoint.
  try {
    await db.schema.dropTable("webhook_endpoint").ifExists().execute();
  } catch {
    // Never blocks the journal: a leftover table costs nothing.
  }

  return migrateTriggerStoreState(db);
}

// MIGRATION: trigger store state used to round-trip through
// trigger_state.store_state as one JSON blob; it lives in piece_store now.

// Stranding it would strand a WEBHOOK trigger's registered endpoint id, and
// then onDisable can never delete that endpoint: it leaks at the provider.

// ONE-WAY DOOR: the blob is blanked once moved and never written again, so a
// reactor rolled back past this point reads an empty cursor and re-delivers.
interface LegacyStoreStateRow {
  workflow_id: string;
  store_state: string;
}

interface LegacyEntry {
  scope: "FLOW" | "PROJECT";
  scopeKey: string;
  key: string;
  value: unknown;
}

interface PendingMigration {
  workflowId: string;
  entries: LegacyEntry[];
}

// Returns the workflows whose blob did not move: nothing reads store_state any
// more, so their hooks would run against an empty piece_store.
async function migrateTriggerStoreState(
  db: IRelationalDb<WorkflowRuntimeDB>,
): Promise<Set<string>> {
  const unmigrated = new Set<string>();
  let rows: LegacyStoreStateRow[];
  try {
    // Oldest first, so a later row's project key overwrites an earlier one;
    // workflow_id settles a tie rather than leaving it to row order.
    rows = await db
      .selectFrom("trigger_state")
      .select(["workflow_id", "store_state"])
      .orderBy("updated_at", "asc")
      .orderBy("workflow_id", "asc")
      .execute();
  } catch (error) {
    // Never blocks the journal: a store that fails to open is returned as
    // `undefined` forever, which silently stops every trigger in the process.
    logger.error("Could not read trigger_state to migrate it: @error", error);
    return unmigrated;
  }
  const pending: PendingMigration[] = [];
  for (const row of rows) {
    const entries = parseLegacyBlob(row, unmigrated);
    if (entries) pending.push({ workflowId: row.workflow_id, entries });
  }
  const projectWinner = resolveProjectCollisions(pending);
  for (const row of pending) {
    try {
      await migrateOneRow(db, row, projectWinner);
    } catch (error) {
      // Per row, for the same reason. The blob is only blanked on success, so
      // a row that failed here is retried on the next startup.
      unmigrated.add(row.workflowId);
      logger.error(
        `Could not migrate trigger store state for ${row.workflowId}`,
        error,
      );
    }
  }
  return unmigrated;
}

// A blob that cannot be read is left exactly as it is, and its workflow is
// reported unmigrated: guessing at it would lose the state for good.
function parseLegacyBlob(
  row: LegacyStoreStateRow,
  unmigrated: Set<string>,
): LegacyEntry[] | null {
  if (!row.store_state || row.store_state === "{}") return null;
  let state: unknown;
  try {
    state = JSON.parse(row.store_state);
  } catch {
    logger.warn(
      `Leaving unparseable store_state for ${row.workflow_id} in place`,
    );
    unmigrated.add(row.workflow_id);
    return null;
  }
  if (typeof state !== "object" || state === null) {
    unmigrated.add(row.workflow_id);
    return null;
  }
  const entries: LegacyEntry[] = [];
  for (const [key, value] of Object.entries(state)) {
    // Only the unambiguous shape a test hook wrote is dropped. A bare "test…"
    // key may be a piece's own ("testimonials"), so it migrates instead.
    if (/^testflow_.+\//.test(key)) continue;
    const flow = /^flow_(.+?)\/(.+)$/.exec(key);
    if (flow) {
      entries.push({
        scope: "FLOW",
        scopeKey: flow[1],
        key: flow[2],
        value,
      });
      continue;
    }
    if (key.startsWith("test")) {
      logger.info(
        `Migrating "${key}" for ${row.workflow_id} as a project key; it may be a test leftover`,
      );
    }
    entries.push({
      scope: "PROJECT",
      scopeKey: PROJECT_SCOPE_KEY,
      key,
      value,
    });
  }
  return entries;
}

// A bare project key lived inside each workflow's own row, so two workflows
// can hold different values for one key and only one can survive the move.

// Last write wins, over the whole set rather than whichever row the database
// returned first, and every discarded value is named so an operator sees it.
function resolveProjectCollisions(
  pending: PendingMigration[],
): Map<string, string> {
  const winner = new Map<string, string>();
  const contested = new Map<string, string[]>();
  for (const row of pending) {
    for (const entry of row.entries) {
      if (entry.scope !== "PROJECT") continue;
      const previous = winner.get(entry.key);
      if (previous !== undefined) {
        const seen = contested.get(entry.key) ?? [previous];
        contested.set(entry.key, [...seen, row.workflowId]);
      }
      winner.set(entry.key, row.workflowId);
    }
  }
  for (const [key, workflows] of contested) {
    logger.warn(
      `Project store key "${key}" was written by ${workflows.join(", ")}; keeping the value last updated, from ${winner.get(key)}, and discarding the rest`,
    );
  }
  return winner;
}

async function migrateOneRow(
  db: IRelationalDb<WorkflowRuntimeDB>,
  row: PendingMigration,
  projectWinner: Map<string, string>,
): Promise<void> {
  for (const entry of row.entries) {
    // Another workflow updated its row later, so its copy of this project key
    // is the surviving one.
    if (
      entry.scope === "PROJECT" &&
      projectWinner.get(entry.key) !== row.workflowId
    ) {
      continue;
    }
    await insertPieceStoreIfAbsent(
      db,
      entry.scope,
      entry.scopeKey,
      entry.key,
      entry.value,
    );
  }
  // Blanked once moved, so a later startup cannot replay a stale blob over
  // what the trigger has written since.
  await db
    .updateTable("trigger_state")
    .set({ store_state: "{}" })
    .where("workflow_id", "=", row.workflowId)
    .execute();
}

// A key the piece has already rewritten under the new layout wins: the blob is
// the older copy by construction.
async function insertPieceStoreIfAbsent(
  db: IRelationalDb<WorkflowRuntimeDB>,
  scope: string,
  scopeKey: string,
  key: string,
  value: unknown,
): Promise<void> {
  const encoded = jsonOrNull(value);
  if (encoded === null) return;
  // The blob had no ceilings; piece_store inherits the action ones. A value
  // over them still migrates, but every later put on it will throw.
  warnIfOverPieceStoreLimits(scope, scopeKey, key, encoded);
  const existing = await db
    .selectFrom("piece_store")
    .select("key")
    .where("scope", "=", scope)
    .where("scope_key", "=", scopeKey)
    .where("key", "=", key)
    .executeTakeFirst();
  if (existing) return;
  // doNothing, not a bare insert: two reactors starting against one journal
  // both see no row, and a PK violation here would reject up() and the store.
  await db
    .insertInto("piece_store")
    .values({
      scope,
      scope_key: scopeKey,
      key,
      value: encoded,
      updated_at: new Date().toISOString(),
    })
    .onConflict((oc) => oc.columns(["scope", "scope_key", "key"]).doNothing())
    .execute();
}

// Loud rather than fatal: a trigger whose accumulated state is already over
// the ceiling would otherwise start failing on its next put with no clue why.
function warnIfOverPieceStoreLimits(
  scope: string,
  scopeKey: string,
  key: string,
  encoded: string,
): void {
  const at = `${scope}/${scopeKey}/${key}`;
  if (key.length > PIECE_STORE_MAX_KEY_LENGTH) {
    logger.warn(
      `Migrated store key ${at} is ${key.length} chars, over the ${PIECE_STORE_MAX_KEY_LENGTH} limit; writes to it will fail`,
    );
  }
  const size = Buffer.byteLength(encoded, "utf8");
  if (size > PIECE_STORE_MAX_VALUE_BYTES) {
    logger.warn(
      `Migrated store value ${at} is ${size} bytes, over the ${PIECE_STORE_MAX_VALUE_BYTES} limit; writes to it will fail`,
    );
  }
}

// Their own ceilings (STORE_KEY_MAX_LENGTH, STORE_VALUE_MAX_SIZE), so a piece
// that behaves on Activepieces behaves here. Enforced on the host, not the child.
export const PIECE_STORE_MAX_KEY_LENGTH = 128;
export const PIECE_STORE_MAX_VALUE_BYTES = 512 * 1024;

export class PieceStoreLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PieceStoreLimitError";
  }
}

function assertPieceStoreEntry(key: string, value: unknown): void {
  if (key.length === 0 || key.length > PIECE_STORE_MAX_KEY_LENGTH) {
    throw new PieceStoreLimitError(
      `Store key must be 1-${PIECE_STORE_MAX_KEY_LENGTH} characters, got ${key.length}`,
    );
  }
  // stringify yields undefined for functions/symbols despite its typing.
  const encoded = JSON.stringify(value) as string | undefined;
  if (encoded === undefined) {
    throw new PieceStoreLimitError(`Store value for "${key}" is not JSON`);
  }
  const size = Buffer.byteLength(encoded, "utf8");
  if (size > PIECE_STORE_MAX_VALUE_BYTES) {
    throw new PieceStoreLimitError(
      `Store value for "${key}" is ${size} bytes, over the ${PIECE_STORE_MAX_VALUE_BYTES} byte limit`,
    );
  }
}

// Every column of a step_execution row but its surrogate id, shared by the
// per-step write and the closing sweep so the two cannot drift.

// It is also the last gate before a credential becomes a database row, which
// is why the redaction sits here rather than at each writer.

// Only the key-based pass runs here; the run's own secret values are the
// engine's to match, and the store never sees them.
function stepValues(runId: string, ordinal: number, step: StepExecutionRecord) {
  return {
    run_id: runId,
    ordinal,
    step_id: step.stepId,
    step_key: step.key,
    block_type: step.blockType,
    status: step.status,
    input: jsonOrNull(redact(step.input)),
    output: jsonOrNull(redact(step.output)),
    port: step.port ?? null,
    error: step.error ? redactMessage(step.error) : null,
  };
}

function jsonOrNull(value: unknown): string | null {
  if (value === undefined) return null;
  try {
    // stringify yields undefined for functions/symbols despite its typing.
    const text = JSON.stringify(value) as string | undefined;
    return text ?? null;
  } catch {
    return null;
  }
}

export interface StartRunOptions {
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  triggerKind: string;
  triggerPayload?: unknown;
  rerunOf?: string;
}

// Runs this process started and has not closed out. A run outlives its store:
// configure() opens a new one on each hot reload, mid-flight runs and all.

// Process-local on purpose. A second reactor over the same journal would need
// a lease, and one that can block startup costs more than a precise sweep.
const runsInFlight = new Set<string>();

export class WorkflowRunStore {
  private constructor(
    private readonly db: IRelationalDb<WorkflowRuntimeDB>,
    private readonly unmigrated: Set<string>,
  ) {}

  static async create(relationalDb: IRelationalDb): Promise<WorkflowRunStore> {
    const db = (await relationalDb.createNamespace(
      "workflow_runtime",
    )) as IRelationalDb<WorkflowRuntimeDB>;
    const unmigrated = await up(db);
    const store = new WorkflowRunStore(db, unmigrated);
    await store.recoverOrphanedRuns();
    return store;
  }

  // Its legacy store_state never reached piece_store, so the hook would run
  // against an empty one, unable to name the endpoint onDisable has to free.
  hasUnmigratedTriggerState(workflowId: string): boolean {
    return this.unmigrated.has(workflowId);
  }

  // The trigger no longer depends on the blob — it was re-enabled from
  // scratch — so it may be scheduled again without waiting for a restart.
  clearUnmigratedTriggerState(workflowId: string): void {
    this.unmigrated.delete(workflowId);
  }

  // A run still RUNNING when the journal opens, and not one of ours, belongs
  // to a process that is gone: close it out as FAILED.

  // Without this the steps journaled before the crash are unreachable, since
  // rerun() only accepts a FAILED run.
  async recoverOrphanedRuns(): Promise<number> {
    let query = this.db
      .updateTable("run")
      .set({
        status: "FAILED",
        error: ORPHANED_RUN_ERROR,
        ended_at: new Date().toISOString(),
      })
      .where("status", "=", "RUNNING");
    // Failing a run this process is still executing would hand rerun() a live
    // run, and its side effects would happen twice.
    if (runsInFlight.size > 0) {
      query = query.where("id", "not in", [...runsInFlight]);
    }
    const result = await query.executeTakeFirst();
    const recovered = Number(result.numUpdatedRows);
    if (recovered > 0) {
      logger.warn(
        `Recovered ${recovered} workflow run(s) left RUNNING by a stopped reactor; they are now FAILED and rerunnable`,
      );
    }
    return recovered;
  }

  async startRun(options: StartRunOptions): Promise<string> {
    const id = randomUUID();
    await this.db
      .insertInto("run")
      .values({
        id,
        workflow_id: options.workflowId,
        workflow_name: options.workflowName,
        workflow_version: options.workflowVersion,
        trigger_kind: options.triggerKind,
        trigger_payload: jsonOrNull(redact(options.triggerPayload)),
        status: "RUNNING",
        error: null,
        started_at: new Date().toISOString(),
        ended_at: null,
        rerun_of: options.rerunOf ?? null,
      })
      .execute();
    runsInFlight.add(id);
    return id;
  }

  // One step's terminal state, written the moment it reaches it, so a
  // reactor killed mid-run leaves the work it finished behind.

  // Keyed by (run_id, step_id): a re-executed step corrects its row.
  async recordStep(
    runId: string,
    ordinal: number,
    step: StepExecutionRecord,
  ): Promise<void> {
    const values = stepValues(runId, ordinal, step);
    const { run_id: _run, step_id: _step, ...mutable } = values;
    await this.db
      .insertInto("step_execution")
      .values({ id: randomUUID(), ...values })
      .onConflict((oc) =>
        oc.columns(["run_id", "step_id"]).doUpdateSet(mutable),
      )
      .execute();
  }

  // Closes the run out. `executionOrder` maps step id to the ordinal the step
  // ran with, which a lost row cannot otherwise be given back.
  async finishRun(
    runId: string,
    result: WorkflowRunResult,
    executionOrder?: ReadonlyMap<string, number>,
  ): Promise<void> {
    // Terminal from here whatever the writes below do: if we leave the run
    // RUNNING, a later sweep should be free to reach it.
    runsInFlight.delete(runId);
    if (result.steps.length > 0) {
      try {
        await this.sweepSteps(runId, result, executionOrder);
      } catch (error) {
        // The work is done and the caller is owed its result: a journal that
        // cannot record the steps must not also cost the run its status.
        logger.warn(
          `Run ${runId}: writing the closing step journal failed; the run is closed out without it`,
          error,
        );
      }
    }
    await this.db
      .updateTable("run")
      .set({
        status: result.status,
        error: result.error ? redactMessage(result.error) : null,
        ended_at: new Date().toISOString(),
      })
      .where("id", "=", runId)
      .execute();
  }

  // Upserts the whole step set: fills in the SKIPPED sweep per-step journaling
  // omits, and repairs the rows a failed journal write left behind.
  private async sweepSteps(
    runId: string,
    result: WorkflowRunResult,
    executionOrder?: ReadonlyMap<string, number>,
  ): Promise<void> {
    const journaled = await this.db
      .selectFrom("step_execution")
      .select(["step_id", "ordinal"])
      .where("run_id", "=", runId)
      .execute();
    // A journaled step keeps the ordinal it ran with; the sweep lands after
    // the highest of them.
    const ordinals = new Map(
      journaled.map((row) => [row.step_id, row.ordinal]),
    );
    let nextOrdinal = journaled.reduce(
      (max, row) => Math.max(max, row.ordinal + 1),
      0,
    );
    for (const step of result.steps) {
      const ran = executionOrder?.get(step.stepId);
      // A step that ran but lost its write goes back where it ran, not where
      // the definition happens to list it.
      if (ran === undefined || ordinals.has(step.stepId)) continue;
      ordinals.set(step.stepId, ran);
      nextOrdinal = Math.max(nextOrdinal, ran + 1);
    }
    // Skips never ran and never journaled an ordinal, so they trail everything
    // that did, in definition order.
    const ordinalFor = (step: StepExecutionRecord) =>
      ordinals.get(step.stepId) ?? nextOrdinal++;
    await this.db
      .insertInto("step_execution")
      .values(
        result.steps.map((step) => ({
          id: randomUUID(),
          ...stepValues(runId, ordinalFor(step), step),
        })),
      )
      .onConflict((oc) =>
        oc.columns(["run_id", "step_id"]).doUpdateSet((eb) => ({
          ordinal: eb.ref("excluded.ordinal"),
          step_key: eb.ref("excluded.step_key"),
          block_type: eb.ref("excluded.block_type"),
          status: eb.ref("excluded.status"),
          input: eb.ref("excluded.input"),
          output: eb.ref("excluded.output"),
          port: eb.ref("excluded.port"),
          error: eb.ref("excluded.error"),
        })),
      )
      .execute();
  }

  async failRun(runId: string, error: string): Promise<void> {
    runsInFlight.delete(runId);
    await this.db
      .updateTable("run")
      .set({
        status: "FAILED",
        error: redactMessage(error),
        ended_at: new Date().toISOString(),
      })
      .where("id", "=", runId)
      .execute();
  }

  // Scope is one workflow id, or a set of them (a drive's workflows). An
  // empty set matches nothing, which is not the same as an unscoped listing.
  async listRuns(
    workflowId?: string | string[],
    limit = 25,
  ): Promise<RunRow[]> {
    if (Array.isArray(workflowId) && workflowId.length === 0) return [];
    let query = this.db
      .selectFrom("run")
      .selectAll()
      .orderBy("started_at", "desc")
      .limit(Math.min(Math.max(limit, 1), 100));
    if (Array.isArray(workflowId)) {
      query = query.where("workflow_id", "in", workflowId);
    } else if (workflowId) {
      query = query.where("workflow_id", "=", workflowId);
    }
    return query.execute();
  }

  async getRun(id: string): Promise<RunRow | undefined> {
    return this.db
      .selectFrom("run")
      .selectAll()
      .where("id", "=", id)
      .executeTakeFirst();
  }

  async getSteps(runId: string): Promise<StepExecutionRow[]> {
    return this.db
      .selectFrom("step_execution")
      .selectAll()
      .where("run_id", "=", runId)
      .orderBy("ordinal", "asc")
      .execute();
  }

  async getTriggerState(
    workflowId: string,
  ): Promise<TriggerStateRow | undefined> {
    return this.db
      .selectFrom("trigger_state")
      .selectAll()
      .where("workflow_id", "=", workflowId)
      .executeTakeFirst();
  }

  // last_error is whatever a piece's onEnable or a schedule parse threw, so it
  // goes through the same gate a poll failure does.
  async upsertTriggerState(row: TriggerStateRow): Promise<void> {
    const values = {
      ...row,
      last_error: row.last_error ? redactMessage(row.last_error) : null,
    };
    await this.db
      .insertInto("trigger_state")
      .values(values)
      .onConflict((oc) => {
        const { workflow_id: _, ...rest } = values;
        return oc.column("workflow_id").doUpdateSet(rest);
      })
      .execute();
  }

  async setTriggerStatus(
    workflowId: string,
    status: string,
    error?: string,
  ): Promise<void> {
    await this.db
      .updateTable("trigger_state")
      .set({
        status,
        last_error: error ? redactMessage(error) : null,
        updated_at: new Date().toISOString(),
      })
      .where("workflow_id", "=", workflowId)
      .execute();
  }

  async listDueTriggerStates(nowIso: string): Promise<TriggerStateRow[]> {
    const rows = await this.db
      .selectFrom("trigger_state")
      .selectAll()
      .where("status", "=", "ENABLED")
      .where("next_poll_at", "<=", nowIso)
      .execute();
    // A row whose state is still trapped in the blob is not runnable: polling
    // it would advance an empty cursor and re-deliver everything it ever saw.
    return rows.filter((row) => !this.unmigrated.has(row.workflow_id));
  }

  async listTriggerStates(): Promise<TriggerStateRow[]> {
    return this.db
      .selectFrom("trigger_state")
      .selectAll()
      .orderBy("workflow_id", "asc")
      .execute();
  }

  // A null next_poll_at leaves the trigger unscheduled, which is what a
  // webhook delivery wants: it recorded a success without becoming a poll.
  async recordPollSuccess(
    workflowId: string,
    storeState: string,
    nowIso: string,
    nextPollAtIso: string | null,
  ): Promise<void> {
    await this.db
      .updateTable("trigger_state")
      .set({
        store_state: storeState,
        last_poll_at: nowIso,
        next_poll_at: nextPollAtIso,
        last_error: null,
        consecutive_failures: 0,
        updated_at: nowIso,
      })
      .where("workflow_id", "=", workflowId)
      .execute();
  }

  async recordPollFailure(
    workflowId: string,
    error: string,
    nowIso: string,
    nextPollAtIso: string,
    consecutiveFailures: number,
  ): Promise<void> {
    await this.db
      .updateTable("trigger_state")
      .set({
        last_poll_at: nowIso,
        next_poll_at: nextPollAtIso,
        last_error: redactMessage(error),
        consecutive_failures: consecutiveFailures,
        updated_at: nowIso,
      })
      .where("workflow_id", "=", workflowId)
      .execute();
  }

  // Claim-with-status dedupe: true when the key was free (caller fires).
  // Select-then-insert is safe: the supervisor serializes all claims.
  async claimDedupe(
    workflowId: string,
    dedupeKey: string,
    ttlMs: number,
    nowIso: string,
  ): Promise<boolean> {
    const cutoff = new Date(Date.parse(nowIso) - ttlMs).toISOString();
    await this.db
      .deleteFrom("trigger_dedupe")
      .where("workflow_id", "=", workflowId)
      .where("created_at", "<", cutoff)
      .execute();
    const existing = await this.db
      .selectFrom("trigger_dedupe")
      .select("dedupe_key")
      .where("workflow_id", "=", workflowId)
      .where("dedupe_key", "=", dedupeKey)
      .executeTakeFirst();
    if (existing) return false;
    await this.db
      .insertInto("trigger_dedupe")
      .values({
        workflow_id: workflowId,
        dedupe_key: dedupeKey,
        run_id: null,
        created_at: nowIso,
      })
      .onConflict((oc) => oc.columns(["workflow_id", "dedupe_key"]).doNothing())
      .execute();
    return true;
  }

  async recordDedupeRun(
    workflowId: string,
    dedupeKey: string,
    runId: string,
  ): Promise<void> {
    await this.db
      .updateTable("trigger_dedupe")
      .set({ run_id: runId })
      .where("workflow_id", "=", workflowId)
      .where("dedupe_key", "=", dedupeKey)
      .execute();
  }

  async getPieceStoreValue(
    scope: string,
    scopeKey: string,
    key: string,
  ): Promise<unknown> {
    const row = await this.db
      .selectFrom("piece_store")
      .select("value")
      .where("scope", "=", scope)
      .where("scope_key", "=", scopeKey)
      .where("key", "=", key)
      .executeTakeFirst();
    if (!row) return null;
    try {
      return JSON.parse(row.value);
    } catch {
      // A row we cannot parse is a row we cannot honour; the piece sees the
      // key as absent and the next write replaces it.
      return null;
    }
  }

  async setPieceStoreValue(
    scope: string,
    scopeKey: string,
    key: string,
    value: unknown,
  ): Promise<void> {
    assertPieceStoreEntry(key, value);
    const encoded = JSON.stringify(value);
    const nowIso = new Date().toISOString();
    const existing = await this.db
      .selectFrom("piece_store")
      .select("key")
      .where("scope", "=", scope)
      .where("scope_key", "=", scopeKey)
      .where("key", "=", key)
      .executeTakeFirst();
    if (existing) {
      await this.db
        .updateTable("piece_store")
        .set({ value: encoded, updated_at: nowIso })
        .where("scope", "=", scope)
        .where("scope_key", "=", scopeKey)
        .where("key", "=", key)
        .execute();
      return;
    }
    await this.db
      .insertInto("piece_store")
      .values({
        scope,
        scope_key: scopeKey,
        key,
        value: encoded,
        updated_at: nowIso,
      })
      .execute();
  }

  async deletePieceStoreValue(
    scope: string,
    scopeKey: string,
    key: string,
  ): Promise<void> {
    await this.db
      .deleteFrom("piece_store")
      .where("scope", "=", scope)
      .where("scope_key", "=", scopeKey)
      .where("key", "=", key)
      .execute();
  }

  // Every key one scope holds; for inspection and for tearing a workflow down.
  async listPieceStore(
    scope: string,
    scopeKey: string,
  ): Promise<Record<string, unknown>> {
    const rows = await this.db
      .selectFrom("piece_store")
      .selectAll()
      .where("scope", "=", scope)
      .where("scope_key", "=", scopeKey)
      .execute();
    const out: Record<string, unknown> = {};
    for (const row of rows) {
      try {
        out[row.key] = JSON.parse(row.value);
      } catch {
        // Same reasoning as the single-key read above.
      }
    }
    return out;
  }

  async deletePieceStore(scope: string, scopeKey: string): Promise<void> {
    await this.db
      .deleteFrom("piece_store")
      .where("scope", "=", scope)
      .where("scope_key", "=", scopeKey)
      .execute();
  }
}
