// Persisted run journal in the relational "workflow_runtime" namespace.
// Dates are ISO text columns: PGlite parses `timestamp` as local time.
import type { BlockIdentity } from "@powerhousedao/pieces-framework/block-type";
import {
  DOCUMENT_REF_KEY,
  isDocumentRefMarker,
  referenceDocuments,
} from "@powerhousedao/pieces-framework/workflow";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import {
  redact,
  redactMessage,
  type StepExecutionRecord,
  type WorkflowRunResult,
} from "../pieces/index.js";
import { childLogger } from "document-model";
import { sql, type Kysely } from "kysely";
import { randomUUID } from "node:crypto";
import { CORE_PIECE_NAME } from "../pieces/index.js";
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
  // The thrown error's name, e.g. ReactorAccessDeniedError.
  error_name: string | null;
  // When the run was journaled; the listing's stable key, unlike started_at.
  enqueued_at: string;
  // When it began executing; a PENDING run holds its enqueue time here.
  started_at: string;
  ended_at: string | null;
  // Failed run this one resumes; null for first-hand runs.
  rerun_of: string | null;
  // How many warning_notes there are.
  warnings: number;
  // JSON list: fallback piece versions, edges on ports nothing emits.
  warning_notes: string | null;
}

export interface StepExecutionRow {
  id: string;
  run_id: string;
  // Execution order; runs journaled before per-step journaling landed hold
  // the definition index. Both are per-run, and nothing compares across runs.
  ordinal: number;
  step_id: string;
  step_key: string;
  piece_name: string;
  // The action a step ran, or the trigger a trigger test sampled.
  block_name: string;
  status: string;
  input: string | null;
  output: string | null;
  port: string | null;
  error: string | null;
  error_name: string | null;
  started_at: string | null;
  ended_at: string | null;
  // The piece version that ran and how it matched the pin; null when unresolved.
  piece_version: string | null;
  piece_source: string | null;
  version_match: string | null;
  version_note: string | null;
  // Hash of the step definition it ran from; rerun replays only on a match.
  config_hash: string | null;
}

// A document a run's steps were handed through the reactor port.
export interface RunDocumentRow {
  run_id: string;
  document_id: string;
}

export interface TriggerStateRow {
  workflow_id: string;
  piece_name: string;
  trigger_name: string;
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
  // The piece version the trigger armed with; null for a host-fed trigger.
  piece_version: string | null;
  piece_source: string | null;
  version_match: string | null;
  version_note: string | null;
  // When onRenew is next due; null for a trigger that never renews.
  next_renew_at: string | null;
  // The last onRenew failure and its streak, apart from the poll's.
  renew_error: string | null;
  renew_failures: number;
}

type DefaultedTriggerColumn =
  | "piece_version"
  | "piece_source"
  | "version_match"
  | "version_note"
  | "next_renew_at"
  | "renew_error"
  | "renew_failures";

// A trigger row as written; the piece and renew columns default to null.
export type TriggerStateInput = Omit<TriggerStateRow, DefaultedTriggerColumn> &
  Partial<Pick<TriggerStateRow, DefaultedTriggerColumn>>;

// The trigger a row was written for, and the columns that name it.
export function triggerRowBlock(row: TriggerStateRow): BlockIdentity {
  return { pieceName: row.piece_name, kind: "trigger", name: row.trigger_name };
}

export function triggerBlockColumns(
  block: BlockIdentity,
): Pick<TriggerStateRow, "piece_name" | "trigger_name"> {
  return { piece_name: block.pieceName, trigger_name: block.name };
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
  run_document: RunDocumentRow;
  trigger_state: TriggerStateRow;
  trigger_dedupe: TriggerDedupeRow;
  piece_store: PieceStoreRow;
}

const logger = childLogger(["workflow", "runtime", "store"]);

// Recorded as the run's error when the reactor died mid-run, so the cause is
// legible in the UI rather than the run just stopping.
export const ORPHANED_RUN_ERROR =
  "Reactor stopped before the run finished; steps completed before then were journaled";

// A run that was matched and journaled but never started. Recorded as FAILED
// so it is both visible and rerunnable: rerun() replays the trigger payload
// with no completed steps, which is exactly the run that never happened.
export const ABANDONED_PENDING_RUN_ERROR =
  "Reactor stopped before the matched trigger started its run; rerun it to fire the workflow with the same payload";

// A matched fire, durable before the operation batch that matched it returns.
// Nothing executes it yet: fire() adopts the row and turns it RUNNING.
export const PENDING_RUN_STATUS = "PENDING";

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Postgres 42P07: the constraint's backing index is already there, which is
// what a re-run migration looks like. Bad data raises 23505 instead.
function isDuplicateObject(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  return (error as { code?: unknown }).code === "42P07";
}

// A trigger with nothing to renew, and no renewal failure left on it.
const RENEW_CLEARED = {
  next_renew_at: null,
  renew_error: null,
  renew_failures: 0,
} as const;

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
    .addColumn("piece_name", "text", (col) => col.notNull())
    .addColumn("trigger_name", "text", (col) => col.notNull())
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
    .addColumn("piece_name", "text", (col) => col.notNull())
    .addColumn("block_name", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull())
    .addColumn("input", "text")
    .addColumn("output", "text")
    .addColumn("port", "text")
    .addColumn("error", "text")
    .addColumn("started_at", "text")
    .addColumn("ended_at", "text")
    .addUniqueConstraint("step_execution_run_step", ["run_id", "step_id"])
    .ifNotExists()
    .execute();

  // Additive migration for journals created before step timings.
  for (const column of ["started_at", "ended_at"]) {
    try {
      await db.schema
        .alterTable("step_execution")
        .addColumn(column, "text")
        .execute();
    } catch {
      // column already exists
    }
  }

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

  // Additive migration for block versioning: what each step and trigger ran.
  for (const table of ["step_execution", "trigger_state"] as const) {
    for (const column of [
      "piece_version",
      "piece_source",
      "version_match",
      "version_note",
      ...(table === "step_execution" ? ["config_hash"] : []),
    ]) {
      try {
        await db.schema.alterTable(table).addColumn(column, "text").execute();
      } catch {
        // column already exists
      }
    }
  }
  try {
    await db.schema
      .alterTable("trigger_state")
      .addColumn("next_renew_at", "text")
      .execute();
  } catch {
    // column already exists
  }
  try {
    await db.schema
      .alterTable("trigger_state")
      .addColumn("renew_error", "text")
      .execute();
  } catch {
    // column already exists
  }
  try {
    await db.schema
      .alterTable("trigger_state")
      .addColumn("renew_failures", "integer", (col) =>
        col.notNull().defaultTo(0),
      )
      .execute();
  } catch {
    // column already exists
  }
  await db.schema
    .createIndex("trigger_state_renew_due")
    .ifNotExists()
    .on("trigger_state")
    .columns(["status", "next_renew_at"])
    .execute();
  try {
    await db.schema
      .alterTable("run")
      .addColumn("warnings", "integer", (col) => col.notNull().defaultTo(0))
      .execute();
  } catch {
    // column already exists
  }
  try {
    await db.schema
      .alterTable("run")
      .addColumn("warning_notes", "text")
      .execute();
  } catch {
    // column already exists
  }
  for (const table of ["run", "step_execution"] as const) {
    try {
      await db.schema
        .alterTable(table)
        .addColumn("error_name", "text")
        .execute();
    } catch {
      // column already exists
    }
  }

  await db.schema
    .createTable("run_document")
    .addColumn("run_id", "text", (col) => col.notNull())
    .addColumn("document_id", "text", (col) => col.notNull())
    .addPrimaryKeyConstraint("run_document_pk", ["run_id", "document_id"])
    .ifNotExists()
    .execute();

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

  // Additive migration: rows journaled before enqueued_at list by their start.
  try {
    await db.schema
      .alterTable("run")
      .addColumn("enqueued_at", "text")
      .execute();
  } catch {
    // column already exists
  }
  await db
    .updateTable("run")
    .set({ enqueued_at: sql.ref("started_at") })
    .where("enqueued_at", "is", null)
    .execute();

  // Run listings, scoped and unscoped, page newest first on (enqueued_at, id).
  await db.schema.dropIndex("run_workflow_started").ifExists().execute();
  await db.schema.dropIndex("run_started").ifExists().execute();
  await db.schema
    .createIndex("run_workflow_enqueued")
    .ifNotExists()
    .on("run")
    .columns(["workflow_id", "enqueued_at desc", "id desc"])
    .execute();
  await db.schema
    .createIndex("run_enqueued")
    .ifNotExists()
    .on("run")
    .columns(["enqueued_at desc", "id desc"])
    .execute();
  // claimDedupe prunes one workflow's expired keys on every claim.
  await db.schema
    .createIndex("trigger_dedupe_workflow_created")
    .ifNotExists()
    .on("trigger_dedupe")
    .columns(["workflow_id", "created_at"])
    .execute();
  // The retention sweep: finished runs by age, and dedupe keys past every TTL.
  await db.schema
    .createIndex("run_ended")
    .ifNotExists()
    .on("run")
    .column("ended_at")
    .execute();
  await db.schema
    .createIndex("trigger_dedupe_created")
    .ifNotExists()
    .on("trigger_dedupe")
    .column("created_at")
    .execute();
  // The supervisor's due-trigger query on every tick.
  await db.schema
    .createIndex("trigger_state_due")
    .ifNotExists()
    .on("trigger_state")
    .column("next_poll_at")
    .where(sql.ref("status"), "=", "ENABLED")
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

  await migrateBlockType(db, "trigger_state", "trigger_name");
  await migrateBlockType(db, "step_execution", "block_name");

  return migrateTriggerStoreState(db);
}

// Journals from before block identities named a block by one packed string,
// block_type: "<pkg>[@<version>]#<action>" or "<pkg>[@<version>]#trigger:<name>".
type LegacyBlockTable = "trigger_state" | "step_execution";

interface LegacyBlockTypeDB {
  trigger_state: LegacyBlockTypeRow;
  step_execution: LegacyBlockTypeRow;
}

interface LegacyBlockTypeRow {
  workflow_id: string;
  id: string;
  block_type: string | null;
  piece_name: string | null;
  trigger_name: string | null;
  block_name: string | null;
}

// The pre-rename core piece.
const LEGACY_CORE_PIECE = "core";

function legacyBlockIdentity(blockType: string): {
  pieceName: string;
  name: string;
} {
  const separator = blockType.lastIndexOf("#");
  if (separator <= 0) return { pieceName: blockType, name: "" };
  const spec = blockType.slice(0, separator);
  const fragment = blockType.slice(separator + 1);
  const name = fragment.startsWith("trigger:")
    ? fragment.slice("trigger:".length)
    : fragment;
  const versionAt = spec.indexOf("@", 1);
  const pieceName = versionAt > 0 ? spec.slice(0, versionAt) : spec;
  return {
    pieceName: pieceName === LEGACY_CORE_PIECE ? CORE_PIECE_NAME : pieceName,
    name,
  };
}

// Adds the identity columns to a table created with block_type and fills them
// from it. block_type stays, nullable, since nothing writes it any more.
async function migrateBlockType(
  db: IRelationalDb<WorkflowRuntimeDB>,
  table: LegacyBlockTable,
  nameColumn: "trigger_name" | "block_name",
): Promise<void> {
  const legacy = db as unknown as IRelationalDb<LegacyBlockTypeDB>;
  try {
    await legacy.schema
      .alterTable(table)
      .alterColumn("block_type", (col) => col.dropNotNull())
      .execute();
  } catch {
    // no block_type: created with the identity columns
    return;
  }
  for (const column of ["piece_name", nameColumn]) {
    try {
      await legacy.schema.alterTable(table).addColumn(column, "text").execute();
    } catch {
      // column already exists
    }
  }
  const key = table === "trigger_state" ? "workflow_id" : "id";
  const rows = await legacy
    .selectFrom(table)
    .select([key, "block_type"])
    .where((eb) =>
      eb.or([eb("piece_name", "is", null), eb(nameColumn, "is", null)]),
    )
    .execute();
  for (const row of rows) {
    const { pieceName, name } = legacyBlockIdentity(row.block_type ?? "");
    await legacy
      .updateTable(table)
      .set({ piece_name: pieceName, [nameColumn]: name })
      .where(key, "=", row[key])
      .execute();
  }
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
      `Project store key "@key" was written by ${workflows.join(", ")}; keeping the value last updated, from ${winner.get(key)}, and discarding the rest`,
      key,
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

// The journal's ceiling per payload: a step's input and output, and a run's
// trigger payload, are each capped at serialization time. Over the cap, the
// row keeps a marker — the original byte count and a prefix of the
// serialized JSON — rather than refusing the write, because the journal is
// diagnostic and a refused write loses the evidence. Half the piece-store ceiling: the piece store holds working state
// a trigger needs back intact, while the journal only needs enough of a
// payload to diagnose a run (the case that forced the cap was document-get
// journaling whole multi-megabyte documents, where the first kilobytes carry
// everything a reader uses).
//
// This bounds row width only. Row count is bounded by the retention sweep
// (run-retention.ts), which is off unless PH_WORKFLOWS_RUN_RETENTION_DAYS is
// set — change either bound with the other in view.
export const STEP_PAYLOAD_MAX_BYTES = 256 * 1024;

// What survives of an over-cap payload: the head of its serialized JSON.
export const STEP_PAYLOAD_PREFIX_CHARS = 32 * 1024;

// The shape journaled in place of an over-cap payload.
export interface TruncatedStepPayload {
  truncated: true;
  // Byte length of the serialized payload the prefix was cut from.
  bytes: number;
  prefix: string;
  // The payload's own top-level ids, carried past the cap: erasure
  // (journaledPayloadNames) and run serving (triggerDocumentIds) both read
  // them off the journaled row, and would otherwise lose the row the moment
  // it is capped. Ids, not bulk.
  documentId?: string;
  driveId?: string;
}

// True for a journaled value this store truncated. Rerun uses it to
// re-execute a step instead of replaying a marker as the step's output, and
// to refuse a rerun whose trigger payload survives only as a marker.
export function isTruncatedStepPayload(
  value: unknown,
): value is TruncatedStepPayload {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const record = value as Record<string, unknown>;
  return (
    record.truncated === true &&
    typeof record.bytes === "number" &&
    typeof record.prefix === "string"
  );
}

// The two top-level ids a journaled payload is matched by after the fact.
// Top level only, and strings only: a list sample carries its ids per item,
// and collecting those would grow with the payload — the one thing the cap
// exists to prevent (store.erase-runs.test.ts pins that accepted gap).
function topLevelDocumentIds(
  value: unknown,
): Pick<TruncatedStepPayload, "documentId" | "driveId"> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const { documentId, driveId } = value as Record<string, unknown>;
  return {
    ...(typeof documentId === "string" ? { documentId } : {}),
    ...(typeof driveId === "string" ? { driveId } : {}),
  };
}

// Takes the already-redacted payload value, not its JSON: the marker keeps
// the value's top-level document ids, which a serialized string cannot give
// back without a second parse.
function cappedPayload(value: unknown): string | null {
  const json = jsonOrNull(value);
  if (json === null) return null;
  const bytes = Buffer.byteLength(json, "utf8");
  if (bytes <= STEP_PAYLOAD_MAX_BYTES) return json;
  let prefix = json.slice(0, STEP_PAYLOAD_PREFIX_CHARS);
  // Never cut through a surrogate pair; the prefix must stay serializable.
  const last = prefix.charCodeAt(prefix.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) prefix = prefix.slice(0, -1);
  const marker: TruncatedStepPayload = {
    truncated: true,
    bytes,
    prefix,
    ...topLevelDocumentIds(value),
  };
  return JSON.stringify(marker);
}

// Every column of a step_execution row but its surrogate id, shared by the
// per-step write and the closing sweep so the two cannot drift.

// It is also the last gate before a credential becomes a database row, which
// is why the redaction sits here rather than at each writer.

// Only the key-based pass runs here; the run's own secret values are the
// engine's to match, and the store never sees them.

// A document in an output is journaled as a reference marker, before
// redaction and the cap: whoever needs its state reads the document.
function stepValues(runId: string, ordinal: number, step: StepExecutionRecord) {
  return {
    run_id: runId,
    ordinal,
    step_id: step.stepId,
    step_key: step.key,
    piece_name: step.pieceName,
    block_name: step.blockName,
    status: step.status,
    input: cappedPayload(redact(step.input)),
    output: cappedPayload(redact(referenceDocuments(step.output))),
    port: step.port ?? null,
    error: step.error ? redactMessage(step.error) : null,
    error_name: step.errorName ?? null,
    started_at: step.startedAt ?? null,
    ended_at: step.endedAt ?? null,
    piece_version: step.piece?.version ?? null,
    piece_source: step.piece?.source ?? null,
    version_match: step.piece?.match ?? null,
    version_note: step.piece?.note ?? null,
    config_hash: step.configHash ?? null,
  };
}

// What a run should not be read as a plain success for.
export function runWarningNotes(result: WorkflowRunResult): string[] {
  const fallbacks = result.steps
    .filter((step) => step.piece?.match === "fallback")
    .map(
      (step) =>
        `Step "${step.key}" ran ${step.piece!.version}, a fallback for the version it pins`,
    );
  return [...fallbacks, ...(result.warnings ?? [])];
}

export function runWarnings(result: WorkflowRunResult): number {
  return runWarningNotes(result).length;
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

// The documents a trigger names: the one whose operation fired, and its drive.
export function triggerDocumentIds(payload: unknown): string[] {
  if (payload === null || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  return [
    ...new Set(
      [record.documentId, record.driveId].filter(
        (id): id is string => typeof id === "string" && id !== "",
      ),
    ),
  ];
}

export function journaledTriggerDocumentIds(payload: string | null): string[] {
  if (payload === null) return [];
  try {
    return triggerDocumentIds(JSON.parse(payload));
  } catch {
    return [];
  }
}

// The trigger kind a design-time test journals its one-step run under.
export const TEST_TRIGGER_KIND = "test";

// A payload, or a sample's list of them, naming an id where erasure looks.
function journaledPayloadNames(
  json: string | null,
  ids: readonly string[],
): boolean {
  if (json === null) return false;
  let value: unknown;
  try {
    value = JSON.parse(json);
  } catch {
    return false;
  }
  return (Array.isArray(value) ? value : [value]).some((item) => {
    if (item === null || typeof item !== "object") return false;
    const record = item as Record<string, unknown>;
    const referenced = isDocumentRefMarker(record)
      ? record[DOCUMENT_REF_KEY].documentId
      : undefined;
    return [
      record.documentId,
      record.driveId,
      record.parentId,
      referenced,
    ].some((id) => typeof id === "string" && ids.includes(id));
  });
}

// Runs erased mid-flight; process-wide, as a run keeps its store across reloads.
const erasedRuns = new Set<string>();

// What eraseRunsForDocuments removed, by table.
export interface ErasedRuns {
  runs: number;
  steps: number;
  documents: number;
  dedupeKeysUnlinked: number;
}

// The insert's own conflict outcome is the claim; a prior select can't be trusted.
async function claimDedupeIn(
  db: Kysely<WorkflowRuntimeDB>,
  workflowId: string,
  dedupeKey: string,
  ttlMs: number,
  nowIso: string,
  runId: string | null,
): Promise<boolean> {
  const cutoff = new Date(Date.parse(nowIso) - ttlMs).toISOString();
  await db
    .deleteFrom("trigger_dedupe")
    .where("workflow_id", "=", workflowId)
    .where("created_at", "<", cutoff)
    .execute();
  const inserted = await db
    .insertInto("trigger_dedupe")
    .values({
      workflow_id: workflowId,
      dedupe_key: dedupeKey,
      run_id: runId,
      created_at: nowIso,
    })
    .onConflict((oc) => oc.columns(["workflow_id", "dedupe_key"]).doNothing())
    .returning("dedupe_key")
    .executeTakeFirst();
  return inserted !== undefined;
}

const STEP_COLUMNS_WITHOUT_DATA = [
  "id",
  "run_id",
  "ordinal",
  "step_id",
  "step_key",
  "piece_name",
  "block_name",
  "status",
  "port",
  "error",
  "error_name",
  "started_at",
  "ended_at",
  "piece_version",
  "piece_source",
  "version_match",
  "version_note",
  "config_hash",
] as const satisfies readonly Exclude<
  keyof StepExecutionRow,
  "input" | "output"
>[];

// A run's position in the newest-first listing; fixed once journaled.
export interface RunKey {
  enqueuedAt: string;
  id: string;
}

export interface ListRunsOptions {
  after?: RunKey;
  excludeTriggerKinds?: string[];
}

export const MAX_LIST_RUNS = 100;

const PRUNE_BATCH_SIZE = 500;

export interface EnqueueRunOptions {
  workflowId: string;
  triggerKind: string;
  triggerPayload?: unknown;
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

export class WorkflowRunStore {
  // Runtime-local on purpose. A second reactor over the same journal would
  // need a lease, and one that can block startup costs more than a sweep.
  private readonly runsInFlight = new Set<string>();

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
    await store.recoverAbandonedRuns();
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
    if (this.runsInFlight.size > 0) {
      query = query.where("id", "not in", [...this.runsInFlight]);
    }
    // Counted off RETURNING: the knex-backed dialect reports no row count.
    const recovered = (await query.returning("id").execute()).length;
    if (recovered > 0) {
      logger.warn(
        `Recovered ${recovered} workflow run(s) left RUNNING by a stopped reactor; they are now FAILED and rerunnable`,
      );
    }
    return recovered;
  }

  // A PENDING run left by a stopped process: it was matched and journaled but
  // nothing ever started it. Recovery for RUNNING runs cannot reach it — that
  // sweep must not touch a row a live enqueue is about to adopt — so it gets
  // its own pass, run once when the journal opens.
  async recoverAbandonedRuns(): Promise<number> {
    let query = this.db
      .updateTable("run")
      .set({
        status: "FAILED",
        error: ABANDONED_PENDING_RUN_ERROR,
        ended_at: new Date().toISOString(),
      })
      .where("status", "=", PENDING_RUN_STATUS);
    if (this.runsInFlight.size > 0) {
      query = query.where("id", "not in", [...this.runsInFlight]);
    }
    // Counted off RETURNING: the knex-backed dialect reports no row count.
    const recovered = (await query.returning("id").execute()).length;
    if (recovered > 0) {
      logger.warn(
        `Recovered ${recovered} workflow run(s) journaled by a stopped reactor but never started; they are now FAILED and rerunnable`,
      );
    }
    return recovered;
  }

  // The durable record of a matched trigger, written before the operation
  // batch that matched it is acknowledged. The workflow's name and version are
  // only known once fire() reads the document, so beginRun fills them in.
  async enqueueRun(options: EnqueueRunOptions): Promise<string> {
    const id = randomUUID();
    await this.insertPendingRun(this.db, id, options);
    // In flight from here: the row is this process's to finish, and no sweep
    // of either kind may close it out underneath the run about to start.
    this.runsInFlight.add(id);
    return id;
  }

  // Claims the dedupe key and journals the PENDING run in one transaction, so
  // a crash cannot keep the claim without the run. Null when already claimed.
  async claimAndEnqueueRun(
    dedupeKey: string,
    ttlMs: number,
    nowIso: string,
    options: EnqueueRunOptions,
  ): Promise<string | null> {
    const id = randomUUID();
    const claimed = await this.db.transaction().execute(async (trx) => {
      if (
        !(await claimDedupeIn(
          trx,
          options.workflowId,
          dedupeKey,
          ttlMs,
          nowIso,
          id,
        ))
      ) {
        return false;
      }
      await this.insertPendingRun(trx, id, options);
      return true;
    });
    if (!claimed) return null;
    this.runsInFlight.add(id);
    return id;
  }

  private async insertPendingRun(
    db: Kysely<WorkflowRuntimeDB>,
    id: string,
    options: EnqueueRunOptions,
  ): Promise<void> {
    const now = new Date().toISOString();
    await db
      .insertInto("run")
      .values({
        id,
        workflow_id: options.workflowId,
        workflow_name: "",
        workflow_version: 0,
        trigger_kind: options.triggerKind,
        trigger_payload: cappedPayload(redact(options.triggerPayload)),
        status: PENDING_RUN_STATUS,
        error: null,
        enqueued_at: now,
        started_at: now,
        ended_at: null,
        rerun_of: null,
        warnings: 0,
        warning_notes: null,
      })
      .execute();
  }

  // Adopts an enqueued row: the run starts now, with the definition fire() read.
  async beginRun(
    runId: string,
    details: { workflowName: string; workflowVersion: number },
  ): Promise<void> {
    this.runsInFlight.add(runId);
    await this.db
      .updateTable("run")
      .set({
        status: "RUNNING",
        workflow_name: details.workflowName,
        workflow_version: details.workflowVersion,
        // The wait between enqueue and start is queueing, not run time;
        // enqueued_at keeps the run's place in the listing.
        started_at: new Date().toISOString(),
      })
      .where("id", "=", runId)
      .execute();
  }

  async startRun(options: StartRunOptions): Promise<string> {
    const id = randomUUID();
    const now = new Date().toISOString();
    await this.db
      .insertInto("run")
      .values({
        id,
        workflow_id: options.workflowId,
        workflow_name: options.workflowName,
        workflow_version: options.workflowVersion,
        trigger_kind: options.triggerKind,
        trigger_payload: cappedPayload(redact(options.triggerPayload)),
        status: "RUNNING",
        error: null,
        enqueued_at: now,
        started_at: now,
        ended_at: null,
        rerun_of: options.rerunOf ?? null,
        warnings: 0,
        warning_notes: null,
      })
      .execute();
    this.runsInFlight.add(id);
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
    if (erasedRuns.has(runId)) return;
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
    this.runsInFlight.delete(runId);
    if (erasedRuns.delete(runId)) return;
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
    const notes = runWarningNotes(result);
    await this.db
      .updateTable("run")
      .set({
        status: result.status,
        error: result.error ? redactMessage(result.error) : null,
        error_name: result.errorName ?? null,
        ended_at: new Date().toISOString(),
        warnings: notes.length,
        warning_notes: notes.length > 0 ? JSON.stringify(notes) : null,
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
          piece_name: eb.ref("excluded.piece_name"),
          block_name: eb.ref("excluded.block_name"),
          status: eb.ref("excluded.status"),
          input: eb.ref("excluded.input"),
          output: eb.ref("excluded.output"),
          port: eb.ref("excluded.port"),
          error: eb.ref("excluded.error"),
          error_name: eb.ref("excluded.error_name"),
          started_at: eb.ref("excluded.started_at"),
          ended_at: eb.ref("excluded.ended_at"),
          piece_version: eb.ref("excluded.piece_version"),
          piece_source: eb.ref("excluded.piece_source"),
          version_match: eb.ref("excluded.version_match"),
          version_note: eb.ref("excluded.version_note"),
          config_hash: eb.ref("excluded.config_hash"),
        })),
      )
      .execute();
  }

  async failRun(
    runId: string,
    error: string,
    errorName?: string,
  ): Promise<void> {
    this.runsInFlight.delete(runId);
    if (erasedRuns.delete(runId)) return;
    await this.db
      .updateTable("run")
      .set({
        status: "FAILED",
        error: redactMessage(error),
        error_name: errorName ?? null,
        ended_at: new Date().toISOString(),
      })
      .where("id", "=", runId)
      .execute();
  }

  // Scope is one workflow id, or a set of them (a drive's workflows). An
  // empty set matches nothing, which is not the same as an unscoped listing.

  // Newest first on (enqueued_at, id); `after` resumes past a row keyset-style.
  async listRuns(
    workflowId?: string | string[],
    limit = 25,
    options: ListRunsOptions = {},
  ): Promise<RunRow[]> {
    if (Array.isArray(workflowId) && workflowId.length === 0) return [];
    let query = this.db
      .selectFrom("run")
      .selectAll()
      .orderBy("enqueued_at", "desc")
      .orderBy("id", "desc")
      .limit(Math.min(Math.max(limit, 1), MAX_LIST_RUNS));
    if (Array.isArray(workflowId)) {
      query = query.where("workflow_id", "in", workflowId);
    } else if (workflowId) {
      query = query.where("workflow_id", "=", workflowId);
    }
    const { after, excludeTriggerKinds } = options;
    if (after) {
      query = query.where((eb) =>
        eb(
          eb.refTuple("enqueued_at", "id"),
          "<",
          eb.tuple(after.enqueuedAt, after.id),
        ),
      );
    }
    if (excludeTriggerKinds && excludeTriggerKinds.length > 0) {
      query = query.where("trigger_kind", "not in", excludeTriggerKinds);
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

  // Steps of many runs in one query, each run's in execution order. Without
  // `withData` the input and output blobs are left out (read as null).
  async getStepsForRuns(
    runIds: string[],
    options: { withData?: boolean } = {},
  ): Promise<Map<string, StepExecutionRow[]>> {
    const byRun = new Map<string, StepExecutionRow[]>(
      runIds.map((id) => [id, []]),
    );
    if (runIds.length === 0) return byRun;
    const base = this.db
      .selectFrom("step_execution")
      .where("run_id", "in", [...new Set(runIds)])
      .orderBy("run_id")
      .orderBy("ordinal", "asc");
    const rows: StepExecutionRow[] =
      options.withData === false
        ? (await base.select(STEP_COLUMNS_WITHOUT_DATA).execute()).map(
            (row) => ({ ...row, input: null, output: null }),
          )
        : await base.selectAll().execute();
    for (const row of rows) byRun.get(row.run_id)?.push(row);
    return byRun;
  }

  async recordRunDocuments(
    runId: string,
    documentIds: string[],
  ): Promise<void> {
    if (documentIds.length === 0 || erasedRuns.has(runId)) return;
    await this.db
      .insertInto("run_document")
      .values(
        [...new Set(documentIds)].map((documentId) => ({
          run_id: runId,
          document_id: documentId,
        })),
      )
      .onConflict((oc) => oc.columns(["run_id", "document_id"]).doNothing())
      .execute();
  }

  async getRunDocuments(runId: string): Promise<string[]> {
    const rows = await this.db
      .selectFrom("run_document")
      .select("document_id")
      .where("run_id", "=", runId)
      .execute();
    return rows.map((row) => row.document_id);
  }

  async getRunDocumentsForRuns(
    runIds: string[],
  ): Promise<Map<string, string[]>> {
    const byRun = new Map<string, string[]>(runIds.map((id) => [id, []]));
    if (runIds.length === 0) return byRun;
    const rows = await this.db
      .selectFrom("run_document")
      .select(["run_id", "document_id"])
      .where("run_id", "in", [...new Set(runIds)])
      .execute();
    for (const row of rows) byRun.get(row.run_id)?.push(row.document_id);
    return byRun;
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
  async upsertTriggerState(row: TriggerStateInput): Promise<void> {
    const values: TriggerStateRow = {
      piece_version: null,
      piece_source: null,
      version_match: null,
      version_note: null,
      next_renew_at: null,
      renew_failures: 0,
      ...row,
      last_error: row.last_error ? redactMessage(row.last_error) : null,
      renew_error: row.renew_error ? redactMessage(row.renew_error) : null,
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
        // Only an ENABLED trigger holds a subscription to renew.
        ...(status === "ENABLED" ? {} : RENEW_CLEARED),
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

  async listDueTriggerRenewals(nowIso: string): Promise<TriggerStateRow[]> {
    const rows = await this.db
      .selectFrom("trigger_state")
      .selectAll()
      .where("status", "=", "ENABLED")
      .where("next_renew_at", "<=", nowIso)
      .execute();
    return rows.filter((row) => !this.unmigrated.has(row.workflow_id));
  }

  async setTriggerRenewAt(
    workflowId: string,
    nextRenewAtIso: string | null,
  ): Promise<void> {
    await this.db
      .updateTable("trigger_state")
      .set(
        nextRenewAtIso === null
          ? RENEW_CLEARED
          : { next_renew_at: nextRenewAtIso },
      )
      .where("workflow_id", "=", workflowId)
      .execute();
  }

  async recordRenewSuccess(
    workflowId: string,
    nowIso: string,
    nextRenewAtIso: string,
  ): Promise<void> {
    await this.db
      .updateTable("trigger_state")
      .set({
        next_renew_at: nextRenewAtIso,
        renew_error: null,
        renew_failures: 0,
        updated_at: nowIso,
      })
      .where("workflow_id", "=", workflowId)
      .execute();
  }

  async recordRenewFailure(
    workflowId: string,
    error: string,
    nowIso: string,
    nextRenewAtIso: string,
    renewFailures: number,
  ): Promise<void> {
    await this.db
      .updateTable("trigger_state")
      .set({
        next_renew_at: nextRenewAtIso,
        renew_error: redactMessage(error),
        renew_failures: renewFailures,
        updated_at: nowIso,
      })
      .where("workflow_id", "=", workflowId)
      .execute();
  }

  // A deleted workflow's row, with the FLOW partition its trigger wrote.
  async deleteTriggerState(workflowId: string): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx
        .deleteFrom("trigger_state")
        .where("workflow_id", "=", workflowId)
        .execute();
      await trx
        .deleteFrom("piece_store")
        .where("scope", "=", "FLOW")
        .where("scope_key", "=", workflowId)
        .execute();
    });
    this.unmigrated.delete(workflowId);
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
  async claimDedupe(
    workflowId: string,
    dedupeKey: string,
    ttlMs: number,
    nowIso: string,
  ): Promise<boolean> {
    return claimDedupeIn(this.db, workflowId, dedupeKey, ttlMs, nowIso, null);
  }

  // A removed workflow's keys would otherwise wait for a claim that never comes.
  async deleteDedupe(workflowId: string): Promise<void> {
    await this.db
      .deleteFrom("trigger_dedupe")
      .where("workflow_id", "=", workflowId)
      .execute();
  }

  // Deletes runs that finished before `cutoffIso`, with their steps and
  // documents, a batch per transaction. Returns how many runs went.
  async pruneFinishedRuns(
    cutoffIso: string,
    batchSize = PRUNE_BATCH_SIZE,
  ): Promise<number> {
    let pruned = 0;
    for (;;) {
      const deleted = await this.db.transaction().execute(async (trx) => {
        const ids = (
          await trx
            .selectFrom("run")
            .select("id")
            .where("ended_at", "is not", null)
            .where("ended_at", "<", cutoffIso)
            .limit(batchSize)
            .execute()
        ).map((row) => row.id);
        if (ids.length === 0) return 0;
        await trx
          .deleteFrom("step_execution")
          .where("run_id", "in", ids)
          .execute();
        await trx
          .deleteFrom("run_document")
          .where("run_id", "in", ids)
          .execute();
        await trx.deleteFrom("run").where("id", "in", ids).execute();
        return ids.length;
      });
      pruned += deleted;
      if (deleted < batchSize) return pruned;
    }
  }

  // Runs that carried a document, or a purged workflow's runs, go with their
  // reruns; dedupe keys stay, unlinked.
  async eraseRunsForDocuments(documentIds: string[]): Promise<ErasedRuns> {
    const ids = [...new Set(documentIds)];
    const erased: ErasedRuns = {
      runs: 0,
      steps: 0,
      documents: 0,
      dedupeKeysUnlinked: 0,
    };
    if (ids.length === 0) return erased;
    return this.db.transaction().execute(async (trx) => {
      const runIds = new Set(
        (
          await trx
            .selectFrom("run_document")
            .select("run_id")
            .where("document_id", "in", ids)
            .execute()
        ).map((row) => row.run_id),
      );
      // A purged workflow's own runs, test runs included.
      const own = await trx
        .selectFrom("run")
        .select("id")
        .where("workflow_id", "in", ids)
        .execute();
      for (const row of own) runIds.add(row.id);
      const named = await trx
        .selectFrom("run")
        .select(["id", "trigger_payload"])
        .where((eb) =>
          eb.or(
            ids.map((id) => eb(sql`strpos(trigger_payload, ${id})`, ">", 0)),
          ),
        )
        .execute();
      for (const row of named) {
        if (journaledPayloadNames(row.trigger_payload, ids)) runIds.add(row.id);
      }
      // A trigger test journals its sample as the step's output.
      const sampled = await trx
        .selectFrom("step_execution")
        .innerJoin("run", "run.id", "step_execution.run_id")
        .select(["step_execution.run_id as runId", "step_execution.output"])
        .where("run.trigger_kind", "=", TEST_TRIGGER_KIND)
        .where((eb) =>
          eb.or(
            ids.map((id) =>
              eb(sql`strpos(step_execution.output, ${id})`, ">", 0),
            ),
          ),
        )
        .execute();
      for (const row of sampled) {
        if (journaledPayloadNames(row.output, ids)) runIds.add(row.runId);
      }
      // A rerun replays its original's step outputs.
      let frontier = [...runIds];
      while (frontier.length > 0) {
        const reruns = await trx
          .selectFrom("run")
          .select("id")
          .where("rerun_of", "in", frontier)
          .execute();
        frontier = reruns.map((row) => row.id).filter((id) => !runIds.has(id));
        for (const id of frontier) runIds.add(id);
      }
      if (runIds.size === 0) return erased;

      const all = [...runIds];
      const live = await trx
        .selectFrom("run")
        .select("id")
        .where("id", "in", all)
        .where("status", "in", ["RUNNING", PENDING_RUN_STATUS])
        .execute();
      // Before the deletes, so a step journaled meanwhile is dropped too.
      for (const row of live) erasedRuns.add(row.id);
      erased.steps = (
        await trx
          .deleteFrom("step_execution")
          .where("run_id", "in", all)
          .returning("id")
          .execute()
      ).length;
      erased.documents = (
        await trx
          .deleteFrom("run_document")
          .where("run_id", "in", all)
          .returning("run_id")
          .execute()
      ).length;
      erased.dedupeKeysUnlinked = (
        await trx
          .updateTable("trigger_dedupe")
          .set({ run_id: null })
          .where("run_id", "in", all)
          .returning("dedupe_key")
          .execute()
      ).length;
      erased.runs = (
        await trx
          .deleteFrom("run")
          .where("id", "in", all)
          .returning("id")
          .execute()
      ).length;
      return erased;
    });
  }

  // Keys older than the longest dedupe TTL can no longer suppress anything.
  async pruneDedupe(cutoffIso: string): Promise<number> {
    const deleted = await this.db
      .deleteFrom("trigger_dedupe")
      .where("created_at", "<", cutoffIso)
      .returning("dedupe_key")
      .execute();
    return deleted.length;
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
    // One upsert, not select-then-branch: concurrent writers can share a scope
    // (PROJECT scope_key is one row for every workflow) and would otherwise race.
    await this.db
      .insertInto("piece_store")
      .values({
        scope,
        scope_key: scopeKey,
        key,
        value: encoded,
        updated_at: nowIso,
      })
      .onConflict((oc) =>
        oc
          .columns(["scope", "scope_key", "key"])
          .doUpdateSet({ value: encoded, updated_at: nowIso }),
      )
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
