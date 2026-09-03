// Run-journal rerun support over a real PGlite-backed store: rerun_of
// lineage, the additive column migration, and journaled-output round-trips.
import { getDbClient } from "@powerhousedao/reactor-api";
import { createRelationalDb } from "@powerhousedao/shared/processors";
import { beforeAll, describe, expect, it } from "vitest";
import { WorkflowRunStore } from "./store.js";

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
