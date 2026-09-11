// Run-journal rerun support over a real PGlite-backed store: rerun_of
// lineage, the additive column migration, and journaled-output round-trips.
import { getDbClient } from "@powerhousedao/reactor-api";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { beforeAll, describe, expect, it } from "vitest";
import type { IRelationalDb } from "@powerhousedao/reactor-browser";
import {
  ORPHANED_RUN_ERROR,
  WorkflowRunStore,
  type StepExecutionRow,
  type WorkflowRuntimeDB,
} from "./store.js";

// The pre-journaling shape: step_execution without the unique constraint.
interface LegacyDB {
  step_execution: StepExecutionRow;
}

describe("WorkflowRunStore rerun lineage", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    const { db } = getDbClient();
    store = await WorkflowRunStore.create(createRelationalDb(db));
  });

  it("survives re-running the schema migration", async () => {
    const { db } = getDbClient();
    // Second create runs up() against the existing tables.
    await WorkflowRunStore.create(createRelationalDb(db));
  });

  it("persists rerun_of and replays journaled outputs", async () => {
    const failedId = await store.startRun({
      workflowId: "wf-rerun",
      workflowName: "Rerun me",
      workflowVersion: 1,
      triggerKind: "piece",
      triggerPayload: { title: "hello" },
    });
    await store.finishRun(failedId, {
      status: "FAILED",
      error: 'Step "second" failed: boom',
      steps: [
        {
          stepId: "a",
          key: "first",
          blockType: "fake#ok",
          status: "SUCCEEDED",
          input: { v: "hello" },
          output: { v: "hello" },
          port: "next",
        },
        {
          stepId: "b",
          key: "second",
          blockType: "fake#fail",
          status: "FAILED",
          input: {},
          error: "boom",
        },
      ],
    });

    const rerunId = await store.startRun({
      workflowId: "wf-rerun",
      workflowName: "Rerun me",
      workflowVersion: 2,
      triggerKind: "rerun",
      triggerPayload: { title: "hello" },
      rerunOf: failedId,
    });
    await store.finishRun(rerunId, {
      status: "SUCCEEDED",
      steps: [
        {
          stepId: "a",
          key: "first",
          blockType: "fake#ok",
          status: "REPLAYED",
          output: { v: "hello" },
          port: "next",
        },
        {
          stepId: "b",
          key: "second",
          blockType: "fake#ok",
          status: "SUCCEEDED",
          input: { got: "hello" },
          output: { got: "hello" },
          port: "next",
        },
      ],
    });

    const failed = await store.getRun(failedId);
    const rerun = await store.getRun(rerunId);
    expect(failed?.rerun_of).toBeNull();
    expect(rerun?.rerun_of).toBe(failedId);
    expect(rerun?.status).toBe("SUCCEEDED");

    // The journaled output of the failed run is what a rerun replays from.
    const failedSteps = await store.getSteps(failedId);
    const succeeded = failedSteps.filter((row) => row.status === "SUCCEEDED");
    expect(succeeded.map((row) => row.step_id)).toEqual(["a"]);
    expect(JSON.parse(succeeded[0].output ?? "")).toEqual({ v: "hello" });

    const rerunSteps = await store.getSteps(rerunId);
    expect(rerunSteps.map((row) => row.status)).toEqual([
      "REPLAYED",
      "SUCCEEDED",
    ]);
  });
});

describe("WorkflowRunStore per-step journaling", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    const { db } = getDbClient();
    store = await WorkflowRunStore.create(createRelationalDb(db));
  });

  const start = () =>
    store.startRun({
      workflowId: "wf-journal",
      workflowName: "Journal me",
      workflowVersion: 1,
      triggerKind: "piece",
    });

  it("makes a step durable before the run finishes", async () => {
    const runId = await start();
    await store.recordStep(runId, 0, {
      stepId: "a",
      key: "first",
      blockType: "fake#ok",
      status: "SUCCEEDED",
      output: { v: 1 },
      port: "next",
    });

    // The point of the whole change: readable with the run still RUNNING.
    const mid = await store.getSteps(runId);
    expect(mid.map((row) => row.step_id)).toEqual(["a"]);
    expect(JSON.parse(mid[0].output ?? "")).toEqual({ v: 1 });
    expect((await store.getRun(runId))?.status).toBe("RUNNING");
  });

  it("leaves a killed run's completed steps behind, rerunnable", async () => {
    const runId = await start();
    await store.recordStep(runId, 0, {
      stepId: "a",
      key: "first",
      blockType: "fake#ok",
      status: "SUCCEEDED",
      output: { v: "kept" },
      port: "next",
    });
    // No finishRun: the reactor died here.
    await store.failRun(runId, "reactor killed mid-run");

    const steps = await store.getSteps(runId);
    expect(steps.map((row) => row.status)).toEqual(["SUCCEEDED"]);
    // rerun() reads exactly this: SUCCEEDED rows with their outputs.
    expect(JSON.parse(steps[0].output ?? "")).toEqual({ v: "kept" });
    expect((await store.getRun(runId))?.status).toBe("FAILED");
  });

  it("upserts rather than duplicating a re-executed step", async () => {
    const runId = await start();
    for (const attempt of ["FAILED", "SUCCEEDED"] as const) {
      await store.recordStep(runId, 0, {
        stepId: "a",
        key: "first",
        blockType: "fake#ok",
        status: attempt,
        output: { attempt },
        port: "next",
      });
    }

    const steps = await store.getSteps(runId);
    expect(steps).toHaveLength(1);
    expect(steps[0].status).toBe("SUCCEEDED");
    expect(JSON.parse(steps[0].output ?? "")).toEqual({ attempt: "SUCCEEDED" });
  });

  it("fails loudly when legacy duplicate rows block the constraint", async () => {
    const { db } = getDbClient();
    const relationalDb = createRelationalDb(db);
    // A pre-journaling namespace: step_execution without the constraint.
    const legacy: IRelationalDb<LegacyDB> =
      await relationalDb.createNamespace("workflow_runtime_legacy");
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
      .ifNotExists()
      .execute();

    const row = (id: string) => ({
      id,
      run_id: "r",
      ordinal: 0,
      step_id: "s",
      step_key: "k",
      block_type: "fake#ok",
      status: "SUCCEEDED",
      input: null,
      output: null,
      port: null,
      error: null,
    });
    await legacy
      .insertInto("step_execution")
      .values([row("dup-1"), row("dup-2")])
      .execute();

    // The migration must not swallow this: a missing ON CONFLICT target
    // would otherwise break every later journal write with raw SQL noise.
    await expect(
      WorkflowRunStore.create({
        createNamespace: () => Promise.resolve(legacy),
      }),
    ).rejects.toThrow(/Could not add the step_execution .* unique constraint/);
  });

  it("sweeps a crash-orphaned run to FAILED, making it rerunnable", async () => {
    const { db } = getDbClient();
    const relationalDb = createRelationalDb(db);
    // Written straight to the journal, since a run this process started is one
    // it may still be executing: the crash has to predate us.
    const journal: IRelationalDb<WorkflowRuntimeDB> =
      await relationalDb.createNamespace("workflow_runtime");
    const runId = "run-from-a-dead-reactor";
    await journal
      .insertInto("run")
      .values({
        id: runId,
        workflow_id: "wf-journal",
        workflow_name: "Journal me",
        workflow_version: 1,
        trigger_kind: "piece",
        trigger_payload: null,
        status: "RUNNING",
        error: null,
        started_at: new Date().toISOString(),
        ended_at: null,
        rerun_of: null,
      })
      .execute();
    await journal
      .insertInto("step_execution")
      .values({
        id: "step-from-a-dead-reactor",
        run_id: runId,
        ordinal: 0,
        step_id: "a",
        step_key: "first",
        block_type: "fake#ok",
        status: "SUCCEEDED",
        input: null,
        output: JSON.stringify({ v: "survived" }),
        port: "next",
        error: null,
      })
      .execute();

    const reopened = await WorkflowRunStore.create(relationalDb);

    const run = await reopened.getRun(runId);
    expect(run?.status).toBe("FAILED");
    expect(run?.error).toBe(ORPHANED_RUN_ERROR);
    expect(run?.ended_at).not.toBeNull();

    // rerun() only accepts FAILED, and replays SUCCEEDED/REPLAYED rows.
    const replayable = (await reopened.getSteps(runId)).filter(
      (row) => row.status === "SUCCEEDED" || row.status === "REPLAYED",
    );
    expect(replayable.map((row) => row.step_id)).toEqual(["a"]);
    expect(JSON.parse(replayable[0].output ?? "")).toEqual({ v: "survived" });
  });

  it("slots a repaired step into its execution-order hole", async () => {
    const runId = await start();
    const step = (id: string, status: string) => ({
      stepId: id,
      key: id,
      blockType: "fake#ok",
      status: status as "SUCCEEDED" | "SKIPPED",
      port: "next",
    });
    // b's journal write failed, so ordinal 1 is left free.
    await store.recordStep(runId, 0, step("a", "SUCCEEDED"));
    await store.recordStep(runId, 2, step("c", "SUCCEEDED"));
    await store.finishRun(
      runId,
      {
        status: "SUCCEEDED",
        steps: [
          step("a", "SUCCEEDED"),
          step("b", "SUCCEEDED"),
          step("c", "SUCCEEDED"),
          step("d", "SKIPPED"),
        ],
      },
      new Map([
        ["a", 0],
        ["b", 1],
        ["c", 2],
      ]),
    );

    const steps = await store.getSteps(runId);
    // b fills the hole rather than being appended after c; the skip trails.
    expect(steps.map((row) => row.step_id)).toEqual(["a", "b", "c", "d"]);
    expect(steps.map((row) => row.ordinal)).toEqual([0, 1, 2, 3]);
  });

  it("finishRun fills in the skip sweep without touching journaled rows", async () => {
    const runId = await start();
    await store.recordStep(runId, 0, {
      stepId: "a",
      key: "first",
      blockType: "fake#ok",
      status: "SUCCEEDED",
      input: { in: 1 },
      output: { v: 1 },
      port: "next",
    });
    await store.finishRun(runId, {
      status: "SUCCEEDED",
      steps: [
        {
          stepId: "a",
          key: "first",
          blockType: "fake#ok",
          status: "SUCCEEDED",
          input: { in: 1 },
          output: { v: 1 },
          port: "next",
        },
        {
          stepId: "b",
          key: "skipped",
          blockType: "fake#ok",
          status: "SKIPPED",
        },
      ],
    });

    const steps = await store.getSteps(runId);
    expect(steps.map((row) => row.step_id)).toEqual(["a", "b"]);
    expect(steps.map((row) => row.status)).toEqual(["SUCCEEDED", "SKIPPED"]);
    // The journaled step keeps its execution ordinal; the sweep lands after.
    expect(steps.map((row) => row.ordinal)).toEqual([0, 1]);
    expect((await store.getRun(runId))?.status).toBe("SUCCEEDED");
  });

  it("leaves a run this process is still executing out of the sweep", async () => {
    const runId = await start();
    // A hot reload: configure() opens a second store over the same journal
    // while the run above is still going.
    const { db } = getDbClient();
    const reopened = await WorkflowRunStore.create(createRelationalDb(db));

    // Failing it here would hand rerun() a live run to duplicate.
    expect((await reopened.getRun(runId))?.status).toBe("RUNNING");
    await store.finishRun(runId, { status: "SUCCEEDED", steps: [] });
    expect((await store.getRun(runId))?.status).toBe("SUCCEEDED");
  });

  it("repairs lost rows in execution order, not definition order", async () => {
    const runId = await start();
    const step = (id: string) => ({
      stepId: id,
      key: id,
      blockType: "fake#ok",
      status: "SUCCEEDED" as const,
      port: "next",
    });
    // The graph ran a, c, b, d; b's and c's journal writes both failed.
    await store.recordStep(runId, 0, step("a"));
    await store.recordStep(runId, 3, step("d"));
    await store.finishRun(
      runId,
      // As runWorkflow returns them: definition order, which is not this run's.
      {
        status: "SUCCEEDED",
        steps: [step("a"), step("b"), step("c"), step("d")],
      },
      new Map([
        ["a", 0],
        ["c", 1],
        ["b", 2],
        ["d", 3],
      ]),
    );

    const steps = await store.getSteps(runId);
    expect(steps.map((row) => row.step_id)).toEqual(["a", "c", "b", "d"]);
    expect(steps.map((row) => row.ordinal)).toEqual([0, 1, 2, 3]);
  });

  it("closes the run out even when the closing step write fails", async () => {
    const { db } = getDbClient();
    const relationalDb = createRelationalDb(db);
    const journal: IRelationalDb<WorkflowRuntimeDB> =
      await relationalDb.createNamespace("workflow_runtime_broken");
    const broken = await WorkflowRunStore.create({
      createNamespace: () => Promise.resolve(journal),
    });
    const runId = await broken.startRun({
      workflowId: "wf-broken",
      workflowName: "Broken journal",
      workflowVersion: 1,
      triggerKind: "piece",
    });
    // The journal dies mid-run; the run's own work already succeeded.
    await journal.schema.dropTable("step_execution").execute();

    await broken.finishRun(runId, {
      status: "SUCCEEDED",
      steps: [
        {
          stepId: "a",
          key: "first",
          blockType: "fake#ok",
          status: "SUCCEEDED",
          port: "next",
        },
      ],
    });

    expect((await broken.getRun(runId))?.status).toBe("SUCCEEDED");
  });
});
