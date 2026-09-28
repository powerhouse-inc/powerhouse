// A rerun replays a journaled step only while its definition is unchanged; an
// edited step is recomputed, so a fixed config is not answered with old output.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { packagePieces } from "./piece-registry.js";
import type { WorkflowRuntimeService } from "./service.js";
import { CORE_PIECE_VERSION } from "../pieces/index.js";

const PIECE = "@acme/piece-rerun";
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

const FIXTURE = `
export const rerun = {
  displayName: "Rerun",
  actions: {
    echo: {
      name: "echo",
      displayName: "Echo",
      props: { text: { displayName: "Text", type: "SHORT_TEXT", required: false } },
      run: async (ctx) => ({ text: ctx.propsValue.text ?? null, at: Math.random() }),
    },
    gate: {
      name: "gate",
      displayName: "Gate",
      props: { open: { displayName: "Open", type: "CHECKBOX", required: false } },
      run: async (ctx) => {
        if (!ctx.propsValue.open) throw new Error("the gate is shut");
        return { passed: true };
      },
    },
  },
  triggers: {},
};
`;

let dir = "";
let documents: Documents;
let service: WorkflowRuntimeService;

function failingWorkflow(id: string) {
  documents.apply(
    id,
    actions.setTrigger({
      id: "t1",
      pieceName: "@powerhousedao/piece-core",
      pieceVersion: CORE_PIECE_VERSION,
      triggerName: "manual",
      config: {},
    }),
    actions.addStep({
      id: "a",
      key: "first",
      name: "First",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      actionName: "echo",
      config: { text: "v1" },
    }),
    actions.addStep({
      id: "b",
      key: "second",
      name: "Second",
      pieceName: PIECE,
      pieceVersion: "1.0.0",
      actionName: "gate",
      config: { open: false },
    }),
    actions.addEdge({ id: "e1", from: "t1", to: "a", port: "next" }),
    actions.addEdge({ id: "e2", from: "a", to: "b", port: "next" }),
    actions.publishWorkflow({ publishedAt: "2026-01-01T00:00:00.000Z" }),
    actions.setWorkflowStatus({ status: "ENABLED" }),
  );
}

async function failedRun(id: string) {
  failingWorkflow(id);
  const run = await service.fire(id, undefined, "manual", undefined, CTX);
  expect(run.status).toBe("FAILED");
  return run;
}

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), "rw-rerun-"));
  const entryPath = join(dir, "index.mjs");
  await writeFile(entryPath, FIXTURE);
  packagePieces.setPieces([{ name: PIECE, version: "1.0.0", entryPath }]);
  documents = new Documents();
  service = testRuntime({ reactorClient: documents.client() as never });
});

afterAll(async () => {
  service.shutdown();
  packagePieces.reset();
  await rm(dir, { recursive: true, force: true });
});

describe("rerun", () => {
  it("replays an unchanged step and runs the fixed one", async () => {
    const failed = await failedRun("wf-unchanged");
    documents.apply(
      "wf-unchanged",
      actions.setStepConfig({ id: "b", config: { open: true } }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );

    const rerun = await service.rerun(failed.runId!, CTX);

    expect(rerun.status).toBe("SUCCEEDED");
    expect(rerun.steps.map((step) => step.status)).toEqual([
      "REPLAYED",
      "SUCCEEDED",
    ]);
    expect(rerun.steps[0].output).toEqual(failed.steps[0].output);
  });

  it("recomputes a step whose config changed since the run", async () => {
    const failed = await failedRun("wf-edited");
    documents.apply(
      "wf-edited",
      actions.setStepConfig({ id: "a", config: { text: "v2" } }),
      actions.setStepConfig({ id: "b", config: { open: true } }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );

    const rerun = await service.rerun(failed.runId!, CTX);

    expect(rerun.steps.map((step) => step.status)).toEqual([
      "SUCCEEDED",
      "SUCCEEDED",
    ]);
    expect(rerun.steps[0].output).toMatchObject({ text: "v2" });
  });

  it("replays a step whose field modes alone changed", async () => {
    const failed = await failedRun("wf-modes");
    documents.apply(
      "wf-modes",
      actions.setStepConfig({
        id: "a",
        config: { text: "v1" },
        propertySettings: [{ prop: "text", mode: "MANUAL" }],
      }),
      actions.setStepConfig({ id: "b", config: { open: true } }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );

    const rerun = await service.rerun(failed.runId!, CTX);

    // Modes are editor-only: the step runs the same config.
    expect(rerun.steps[0].status).toBe("REPLAYED");
    expect(rerun.steps[0].output).toEqual(failed.steps[0].output);
  });
});
