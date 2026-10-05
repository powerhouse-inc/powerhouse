// A run's place in the listing is its enqueue time, which starting it leaves
// alone; rows journaled before the column list by their start time.
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { sql } from "kysely";
import { describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { WorkflowRunStore } from "./store.js";

function freshDb(): IRelationalDb {
  return createFreshRelationalDb();
}

describe("run listing order", () => {
  it("keeps a PENDING run's place when it starts", async () => {
    const store = await WorkflowRunStore.create(freshDb());
    const older = await store.enqueueRun({
      workflowId: "wf-order",
      triggerKind: "manual",
    });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const newer = await store.enqueueRun({
      workflowId: "wf-order",
      triggerKind: "manual",
    });
    const enqueuedAt = (await store.getRun(older))!.enqueued_at;

    await new Promise((resolve) => setTimeout(resolve, 5));
    await store.beginRun(older, { workflowName: "Order", workflowVersion: 1 });

    const started = (await store.getRun(older))!;
    expect(started.enqueued_at).toBe(enqueuedAt);
    expect(started.started_at > enqueuedAt).toBe(true);
    expect((await store.listRuns("wf-order")).map((row) => row.id)).toEqual([
      newer,
      older,
    ]);
  });

  it("backfills rows journaled before enqueued_at, and re-runs cleanly", async () => {
    const relational = freshDb();
    const legacy = (await relational.createNamespace(
      "workflow_runtime",
    )) as IRelationalDb<Record<string, Record<string, unknown>>>;
    await legacy.schema
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
      .execute();
    await legacy.schema
      .createIndex("run_started")
      .on("run")
      .columns(["started_at desc", "id desc"])
      .execute();
    const legacyRun = (id: string, startedAt: string) => ({
      id,
      workflow_id: "wf-legacy",
      workflow_name: "Legacy",
      workflow_version: 1,
      trigger_kind: "manual",
      trigger_payload: null,
      status: "SUCCEEDED",
      error: null,
      started_at: startedAt,
      ended_at: startedAt,
    });
    await legacy
      .insertInto("run")
      .values([
        legacyRun("old-1", "2026-01-01T00:00:01.000Z"),
        legacyRun("old-2", "2026-01-01T00:00:02.000Z"),
      ])
      .execute();

    const store = await WorkflowRunStore.create(relational);
    expect((await store.getRun("old-1"))?.enqueued_at).toBe(
      "2026-01-01T00:00:01.000Z",
    );
    const fresh = await store.startRun({
      workflowId: "wf-legacy",
      workflowName: "Legacy",
      workflowVersion: 1,
      triggerKind: "manual",
    });
    await WorkflowRunStore.create(relational);
    expect((await store.listRuns("wf-legacy")).map((row) => row.id)).toEqual([
      fresh,
      "old-2",
      "old-1",
    ]);

    const indexes = await sql<{ indexname: string }>`
      select indexname from pg_indexes where tablename = 'run'
    `.execute(legacy);
    const names = indexes.rows.map((row) => row.indexname);
    expect(names).toEqual(
      expect.arrayContaining(["run_enqueued", "run_workflow_enqueued"]),
    );
    expect(names).not.toContain("run_started");
  });
});
