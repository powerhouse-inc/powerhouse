// A rerun replays a journaled step only while its definition is unchanged; an
// edited step is recomputed, so a fixed config is not answered with old output.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Documents } from "../../test/helpers/documents.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { packagePieces } from "./piece-registry.js";
import {
  isTruncatedStepPayload,
  TRUNCATED_PAYLOAD_KEY,
  TRUNCATED_PAYLOAD_SENTINEL,
  type WorkflowRuntimeDB,
} from "./store.js";
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

// Rewrites a journaled step output as the cap would have: the store's own
// reserved marker, in place of the real value.
async function truncateJournaledOutput(
  runId: string,
  stepId: string,
  prefix: string,
) {
  const db =
    await createTestRelationalDb().createNamespace<WorkflowRuntimeDB>(
      "workflow_runtime",
    );
  await db
    .updateTable("step_execution")
    .set({
      output: JSON.stringify({
        [TRUNCATED_PAYLOAD_KEY]: TRUNCATED_PAYLOAD_SENTINEL,
        bytes: 999_999,
        prefix,
      }),
    })
    .where("run_id", "=", runId)
    .where("step_id", "=", stepId)
    .execute();
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

  // Backlog item 15: a SUCCEEDED step whose output the payload cap truncated
  // used to be dropped from the replay set, i.e. RE-EXECUTED — a second
  // charge, a second email. It replays as completed now.
  it("replays a truncated SUCCEEDED step instead of re-running it", async () => {
    const failed = await failedRun("wf-truncated");
    // Stand in for the cap: the journal's own marker, written over the row.
    await truncateJournaledOutput(failed.runId!, "a", '{"text":"v1"');
    documents.apply(
      "wf-truncated",
      actions.setStepConfig({ id: "b", config: { open: true } }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );

    const rerun = await service.rerun(failed.runId!, CTX);

    // Replayed, not re-run: the side effect does not happen twice.
    expect(rerun.steps[0].status).toBe("REPLAYED");
    expect(rerun.steps[0].output).toBeUndefined();
    expect(rerun.status).toBe("SUCCEEDED");
  });

  it("fails the rerun by name when a later step reads the lost output", async () => {
    const failed = await failedRun("wf-truncated-read");
    await truncateJournaledOutput(failed.runId!, "a", "{");
    documents.apply(
      "wf-truncated-read",
      // The second step now reads the first's output, which is gone.
      actions.setStepConfig({
        id: "b",
        config: { open: "{{steps.first.output.text}}" },
      }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );

    const rerun = await service.rerun(failed.runId!, CTX);

    expect(rerun.status).toBe("FAILED");
    // Explicit, not an "unresolved reference": the value existed and is gone.
    expect(rerun.steps[1].error).toContain("truncated its output");
    expect(rerun.steps[1].error).toContain("Fire the workflow again");
  });

  // The REPLAYED row journaled a NULL output, so the SECOND rerun read it as
  // an ordinary replay with nothing to replay: the truncation fact lasted
  // exactly one generation, and a downstream step was handed nothing instead
  // of being told by name why there is nothing.
  it("keeps the truncation fact across a second rerun", async () => {
    const failed = await failedRun("wf-truncated-twice");
    await truncateJournaledOutput(failed.runId!, "a", '{"text":"v1"');
    // The second step reads the first's lost output, so every generation of
    // this rerun must fail on the truncation rather than on anything else.
    documents.apply(
      "wf-truncated-twice",
      actions.setStepConfig({
        id: "b",
        config: { open: "{{steps.first.output.text}}" },
      }),
      actions.publishWorkflow({ publishedAt: "2026-01-02T00:00:00.000Z" }),
    );

    const first = await service.rerun(failed.runId!, CTX);
    expect(first.status).toBe("FAILED");
    expect(first.steps[0].status).toBe("REPLAYED");
    expect(first.steps[1].error).toContain("truncated its output");
    // The row the caller is NOT handed the marker on still carries it, which
    // is what the next generation reads.
    const store = (await service.store())!;
    const [replayed] = await store.getSteps(first.runId!);
    expect(replayed).toMatchObject({ step_id: "a", status: "REPLAYED" });
    expect(replayed.output).not.toBeNull();
    expect(
      isTruncatedStepPayload(JSON.parse(replayed.output!) as unknown),
    ).toBe(true);
    // And the caller still gets no marker where real data goes.
    expect(first.steps[0].output).toBeUndefined();

    const second = await service.rerun(first.runId!, CTX);

    expect(second.steps[0].status).toBe("REPLAYED");
    expect(second.status).toBe("FAILED");
    // The same named error, not "unresolved reference" and not a fabricated
    // null: the value existed, it is gone, and nothing re-runs the step.
    expect(second.steps[1].error).toContain("truncated its output");
    expect(second.steps[1].error).toContain("Fire the workflow again");
    expect(second.steps[1].error).not.toContain("Unresolved reference");
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
