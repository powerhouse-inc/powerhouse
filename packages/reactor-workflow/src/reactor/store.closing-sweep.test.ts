import type { KyselyPlugin } from "kysely";
import { beforeAll, describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import type { StepExecutionRecord } from "../pieces/engine/types.js";
import { WorkflowRunStore } from "./store.js";

// Counts the statements a real PGlite journal receives.
const statements: string[] = [];
const counter: KyselyPlugin = {
  transformQuery: (args) => {
    statements.push(args.node.kind);
    return args.node;
  },
  transformResult: (args) => Promise.resolve(args.result),
};

const step = (
  stepId: string,
  overrides: Partial<StepExecutionRecord> = {},
): StepExecutionRecord => ({
  stepId,
  key: stepId,
  pieceName: "piece",
  blockName: "block",
  status: "SUCCEEDED",
  input: { n: 1 },
  output: { ok: true },
  ...overrides,
});

describe("WorkflowRunStore closing sweep", () => {
  const db = createFreshRelationalDb([counter]);
  let store: WorkflowRunStore;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(db);
  });

  const startRun = () =>
    store.startRun({
      workflowId: "wf-sweep",
      workflowName: "Sweep",
      workflowVersion: 1,
      triggerKind: "manual",
    });

  it("closes a run whose steps are all journaled with the run update alone", async () => {
    const runId = await startRun();
    const a = step("a");
    const b = step("b");
    await store.recordStep(runId, 0, a);
    await store.recordStep(runId, 1, b);

    statements.length = 0;
    await store.finishRun(runId, { status: "SUCCEEDED", steps: [a, b] });

    expect(statements).toEqual(["UpdateQueryNode"]);
    const rows = await store.getSteps(runId);
    expect(rows.map((r) => [r.step_id, r.ordinal])).toEqual([
      ["a", 0],
      ["b", 1],
    ]);
    expect((await store.getRun(runId))?.status).toBe("SUCCEEDED");
  });

  it("still writes a step that was never journaled", async () => {
    const runId = await startRun();
    const a = step("a");
    await store.recordStep(runId, 0, a);

    await store.finishRun(runId, {
      status: "SUCCEEDED",
      steps: [a, step("skipped", { status: "SKIPPED", output: null })],
    });

    const rows = await store.getSteps(runId);
    expect(rows.map((r) => [r.step_id, r.status])).toEqual([
      ["a", "SUCCEEDED"],
      ["skipped", "SKIPPED"],
    ]);
  });

  it("rewrites a step whose final record differs from its journaled row", async () => {
    const runId = await startRun();
    await store.recordStep(runId, 0, step("a", { output: { draft: true } }));

    await store.finishRun(runId, {
      status: "SUCCEEDED",
      steps: [step("a", { output: { final: true } })],
    });

    const [row] = await store.getSteps(runId);
    expect(JSON.parse(row.output ?? "null")).toEqual({ final: true });
  });

  it("sweeps a run this process did not begin", async () => {
    const runId = await startRun();
    await store.recordStep(runId, 0, step("a"));
    // A second store over the same journal never saw the step written.
    const other = await WorkflowRunStore.create(db);

    statements.length = 0;
    await other.finishRun(runId, { status: "SUCCEEDED", steps: [step("a")] });

    expect(statements).toContain("SelectQueryNode");
    expect((await store.getSteps(runId)).map((r) => r.step_id)).toEqual(["a"]);
  });
});
