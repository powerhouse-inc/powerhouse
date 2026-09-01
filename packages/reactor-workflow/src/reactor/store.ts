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

export interface WorkflowRuntimeDB {
  run: RunRow;
  step_execution: StepExecutionRow;
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

  async listRuns(workflowId?: string, limit = 25): Promise<RunRow[]> {
    let query = this.db
      .selectFrom("run")
      .selectAll()
      .orderBy("started_at", "desc")
      .limit(Math.min(Math.max(limit, 1), 100));
    if (workflowId) query = query.where("workflow_id", "=", workflowId);
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
}
