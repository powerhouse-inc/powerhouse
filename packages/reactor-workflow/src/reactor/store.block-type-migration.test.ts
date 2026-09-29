// Journals written when a block was one packed block_type string: the identity
// columns are added, filled from it, and new rows write without it.
import { CORE_PIECE_NAME } from "@powerhousedao/pieces-framework/workflow";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import { describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { WorkflowRunStore } from "./store.js";

const NOW = "2026-09-29T12:00:00.000Z";

type LegacyDB = IRelationalDb<Record<string, Record<string, unknown>>>;

function triggerRow(workflowId: string, blockType: string) {
  return {
    workflow_id: workflowId,
    block_type: blockType,
    config_hash: "abc",
    status: "ENABLED",
    store_state: "{}",
    interval_ms: 900_000,
    next_poll_at: NOW,
    last_poll_at: null,
    last_error: null,
    consecutive_failures: 0,
    lease_owner: null,
    lease_expires_at: null,
    updated_at: NOW,
  };
}

function stepRow(id: string, stepId: string, blockType: string) {
  return {
    id,
    run_id: "run-legacy",
    ordinal: 0,
    step_id: stepId,
    step_key: stepId,
    block_type: blockType,
    status: "SUCCEEDED",
    input: null,
    output: null,
    port: "next",
    error: null,
    started_at: NOW,
    ended_at: NOW,
  };
}

async function legacyJournal(): Promise<IRelationalDb> {
  const relational = createFreshRelationalDb();
  const legacy = (await relational.createNamespace(
    "workflow_runtime",
  )) as LegacyDB;
  await legacy.schema
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
    .execute();
  await legacy.schema
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
    .addColumn("started_at", "text")
    .addColumn("ended_at", "text")
    .addUniqueConstraint("step_execution_run_step", ["run_id", "step_id"])
    .execute();
  await legacy
    .insertInto("trigger_state")
    .values([
      triggerRow("wf-piece", "@acme/piece-x@1.0.0#trigger:new_thing"),
      triggerRow("wf-core", "core#webhook"),
    ])
    .execute();
  await legacy
    .insertInto("step_execution")
    .values([
      stepRow("s-1", "a", "@acme/piece-x#send_mail"),
      stepRow("s-2", "b", "core#branch"),
    ])
    .execute();
  return relational;
}

describe("the block_type migration", () => {
  it("fills the identity columns from block_type, and re-runs cleanly", async () => {
    const relational = await legacyJournal();
    await WorkflowRunStore.create(relational);
    const store = await WorkflowRunStore.create(relational);

    const piece = await store.getTriggerState("wf-piece");
    expect(piece?.piece_name).toBe("@acme/piece-x");
    expect(piece?.trigger_name).toBe("new_thing");
    const core = await store.getTriggerState("wf-core");
    expect(core?.piece_name).toBe(CORE_PIECE_NAME);
    expect(core?.trigger_name).toBe("webhook");

    const steps = await store.getSteps("run-legacy");
    const byId = new Map(steps.map((step) => [step.step_id, step]));
    expect(byId.get("a")).toMatchObject({
      piece_name: "@acme/piece-x",
      block_name: "send_mail",
    });
    expect(byId.get("b")).toMatchObject({
      piece_name: CORE_PIECE_NAME,
      block_name: "branch",
    });
  });

  it("writes trigger and step rows without block_type once migrated", async () => {
    const store = await WorkflowRunStore.create(await legacyJournal());

    const { block_type: _dropped, ...columns } = triggerRow("wf-piece", "");
    await store.upsertTriggerState({
      ...columns,
      piece_name: "@acme/piece-x",
      trigger_name: "other_thing",
      config_hash: "def",
    });
    expect((await store.getTriggerState("wf-piece"))?.trigger_name).toBe(
      "other_thing",
    );

    await store.recordStep("run-legacy", 2, {
      stepId: "c",
      key: "c",
      pieceName: "@acme/piece-x",
      blockName: "send_mail",
      status: "SUCCEEDED",
      output: { ok: true },
      port: "next",
    });
    const written = (await store.getSteps("run-legacy")).find(
      (step) => step.step_id === "c",
    );
    expect(written?.block_name).toBe("send_mail");
  });
});
