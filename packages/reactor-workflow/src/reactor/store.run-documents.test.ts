import { describe, expect, it } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { WorkflowRunStore } from "./store.js";

describe("run documents", () => {
  it("keeps each document a run was handed once, per run", async () => {
    const store = await WorkflowRunStore.create(createTestRelationalDb());

    await store.recordRunDocuments("docs-run-a", ["doc-1", "doc-2", "doc-1"]);
    await store.recordRunDocuments("docs-run-a", ["doc-2"]);
    await store.recordRunDocuments("docs-run-b", ["doc-3"]);
    await store.recordRunDocuments("docs-run-b", []);

    expect((await store.getRunDocuments("docs-run-a")).sort()).toEqual([
      "doc-1",
      "doc-2",
    ]);
    expect(await store.getRunDocuments("docs-run-b")).toEqual(["doc-3"]);
    expect(await store.getRunDocuments("docs-run-c")).toEqual([]);
  });

  it("reads many runs' documents in one call", async () => {
    const store = await WorkflowRunStore.create(createTestRelationalDb());
    await store.recordRunDocuments("batch-docs-a", ["doc-1", "doc-2"]);
    await store.recordRunDocuments("batch-docs-b", ["doc-3"]);

    const byRun = await store.getRunDocumentsForRuns([
      "batch-docs-a",
      "batch-docs-b",
      "batch-docs-c",
    ]);
    expect(byRun.get("batch-docs-a")?.sort()).toEqual(["doc-1", "doc-2"]);
    expect(byRun.get("batch-docs-b")).toEqual(["doc-3"]);
    expect(byRun.get("batch-docs-c")).toEqual([]);
  });
});

describe("steps of many runs", () => {
  it("groups each run's steps in order, with or without their data", async () => {
    const store = await WorkflowRunStore.create(createTestRelationalDb());
    const start = () =>
      store.startRun({
        workflowId: "wf-batch-steps",
        workflowName: "Batch",
        workflowVersion: 1,
        triggerKind: "manual",
      });
    const step = (stepId: string) => ({
      stepId,
      key: stepId,
      pieceName: "fake",
      blockName: "ok",
      status: "SUCCEEDED" as const,
      input: { in: stepId },
      output: { out: stepId },
      port: "next",
    });
    const first = await start();
    const second = await start();
    await store.recordStep(first, 1, step("b"));
    await store.recordStep(first, 0, step("a"));
    await store.recordStep(second, 0, step("c"));

    const full = await store.getStepsForRuns([first, second, "none"]);
    expect(full.get(first)?.map((row) => row.step_id)).toEqual(["a", "b"]);
    expect(full.get(second)?.map((row) => row.step_id)).toEqual(["c"]);
    expect(full.get("none")).toEqual([]);
    expect(JSON.parse(full.get(first)![0].output!)).toEqual({ out: "a" });

    const light = await store.getStepsForRuns([first], { withData: false });
    expect(light.get(first)?.map((row) => [row.input, row.output])).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(light.get(first)?.[0].status).toBe("SUCCEEDED");
  });
});
