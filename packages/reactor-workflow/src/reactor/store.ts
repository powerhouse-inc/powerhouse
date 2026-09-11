// Persisted run journal in the relational "workflow_runtime" namespace.
// Dates are ISO text columns: PGlite parses `timestamp` as local time.
import type { IRelationalDb } from "@powerhousedao/reactor-browser";

// Structural: the subgraph's relationalDb types against shared source while
// this package resolves shared dist, so the nominal types never match.
export interface NamespaceFactory {
  createNamespace(namespace: string): Promise<unknown>;
}
import type { WorkflowRunResult } from "@powerhousedao/reactor-connectors";
import { randomUUID } from "node:crypto";

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

// One key a piece wrote through `ctx.store` during an action. Triggers persist
// theirs as `trigger_state.store_state`; actions had nowhere to put it.

// `scope` mirrors their StoreScope. PROJECT is meant to span a project's
// workflows, which we have no identity for, so it is stored per workflow too.
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

async function up(db: IRelationalDb<WorkflowRuntimeDB>): Promise<void> {
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

  // The reactor's webhook service owns tokens now, in its own namespace, so
  // the local table is dead weight wherever the GraphQL ingress once ran.

  // Nothing is migrated: those tokens addressed a mutation that no longer
  // exists, so a trigger re-enables onto a freshly minted endpoint.
  try {
    await db.schema.dropTable("webhook_endpoint").ifExists().execute();
  } catch {
    // Never blocks the journal: a leftover table costs nothing.
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

export class WorkflowRunStore {
  private constructor(private readonly db: IRelationalDb<WorkflowRuntimeDB>) {}

  static async create(
    relationalDb: NamespaceFactory,
  ): Promise<WorkflowRunStore> {
    const db = (await relationalDb.createNamespace(
      "workflow_runtime",
    )) as IRelationalDb<WorkflowRuntimeDB>;
    await up(db);
    return new WorkflowRunStore(db);
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
        trigger_payload: jsonOrNull(options.triggerPayload),
        status: "RUNNING",
        error: null,
        started_at: new Date().toISOString(),
        ended_at: null,
        rerun_of: options.rerunOf ?? null,
      })
      .execute();
    return id;
  }

  async finishRun(runId: string, result: WorkflowRunResult): Promise<void> {
    if (result.steps.length > 0) {
      await this.db
        .insertInto("step_execution")
        .values(
          result.steps.map((step, ordinal) => ({
            id: randomUUID(),
            run_id: runId,
            ordinal,
            step_id: step.stepId,
            step_key: step.key,
            block_type: step.blockType,
            status: step.status,
            input: jsonOrNull(step.input),
            output: jsonOrNull(step.output),
            port: step.port ?? null,
            error: step.error ?? null,
          })),
        )
        .execute();
    }
    await this.db
      .updateTable("run")
      .set({
        status: result.status,
        error: result.error ?? null,
        ended_at: new Date().toISOString(),
      })
      .where("id", "=", runId)
      .execute();
  }

  async failRun(runId: string, error: string): Promise<void> {
    await this.db
      .updateTable("run")
      .set({ status: "FAILED", error, ended_at: new Date().toISOString() })
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

  async upsertTriggerState(row: TriggerStateRow): Promise<void> {
    await this.db
      .insertInto("trigger_state")
      .values(row)
      .onConflict((oc) => {
        const { workflow_id: _, ...rest } = row;
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
        last_error: error ?? null,
        updated_at: new Date().toISOString(),
      })
      .where("workflow_id", "=", workflowId)
      .execute();
  }

  async listDueTriggerStates(nowIso: string): Promise<TriggerStateRow[]> {
    return this.db
      .selectFrom("trigger_state")
      .selectAll()
      .where("status", "=", "ENABLED")
      .where("next_poll_at", "<=", nowIso)
      .execute();
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
        last_error: error,
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
