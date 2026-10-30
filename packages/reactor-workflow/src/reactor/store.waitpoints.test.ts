// The run journal across legs: warnings kept, ended runs final, and a run's
// waitpoints deleted with it by retention and erasure.
import { describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { waitpointRow } from "../../test/helpers/waitpoints.js";
import { WorkflowRunStore } from "./store.js";

async function freshStore() {
  const store = await WorkflowRunStore.create(createFreshRelationalDb());
  const start = (workflowId = "wf-journal") =>
    store.startRun({
      workflowId,
      workflowName: "journal",
      workflowVersion: 1,
      triggerKind: "manual",
    });
  // A run WAITING on a webhook waitpoint that holds a decision's body.
  const waiting = async (workflowId?: string) => {
    const runId = await start(workflowId);
    const waitpoint = waitpointRow(runId, {
      type: "WEBHOOK",
      kind: "approval",
      block_name: "approval",
      approval: JSON.stringify({ title: "Ship?", body: "Secret plan" }),
    });
    await store.createWaitpoint(waitpoint);
    await store.finishRun(runId, {
      status: "WAITING",
      steps: [],
      warnings: ["first leg"],
      waiting: { stepId: "s", waitpointId: waitpoint.id },
    } as never);
    return { runId, waitpointId: waitpoint.id };
  };
  return { store, start, waiting };
}

describe("the run journal", () => {
  it("keeps warning notes from every leg", async () => {
    const { store, waiting } = await freshStore();
    const { runId } = await waiting();
    expect(await store.claimWaitingRun(runId)).toBe(true);
    await store.finishRun(runId, {
      status: "SUCCEEDED",
      steps: [],
      warnings: ["second leg"],
    } as never);
    const run = (await store.getRun(runId))!;
    expect(run.warnings).toBe(2);
    expect(JSON.parse(run.warning_notes!)).toEqual(["first leg", "second leg"]);
  });

  it("never overwrites a run that already ended", async () => {
    const { store, start } = await freshStore();
    const runId = await start();
    await store.cancelRun(runId, "Cancelled by an operator");
    await store.failRun(runId, "late failure");
    await store.cancelRun(runId, "late cancel");
    const run = (await store.getRun(runId))!;
    expect(run.status).toBe("CANCELLED");
    expect(run.error).toBe("Cancelled by an operator");
  });
});

describe("a run's waitpoints", () => {
  it("are pruned with the finished run, and kept for a WAITING one", async () => {
    const { store, waiting } = await freshStore();
    const finished = await waiting();
    const open = await waiting();
    expect(
      await store.completeWaitpoint(finished.waitpointId, {
        payload: { body: { secret: true } },
      }),
    ).toBeDefined();
    await store.cancelRun(finished.runId, "Cancelled");

    const pruned = await store.pruneFinishedRuns(
      new Date(Date.now() + 86_400_000).toISOString(),
    );

    expect(pruned).toBe(1);
    expect(await store.getRun(finished.runId)).toBeUndefined();
    expect(await store.getWaitpoint(finished.waitpointId)).toBeUndefined();
    expect(await store.getWaitpoint(open.waitpointId)).toBeDefined();
  });

  it("are erased with a WAITING run, its decision and resume payload too", async () => {
    const { store, waiting } = await freshStore();
    const doomed = await waiting("wf-doomed");
    const kept = await waiting("wf-kept");
    const completed = await store.completeWaitpoint(doomed.waitpointId, {
      payload: { body: { secret: true } },
    });
    expect(completed?.resume_payload).toContain("secret");

    const erased = await store.eraseRunsForDocuments(["wf-doomed"]);

    expect(erased.runs).toBe(1);
    expect(await store.getRun(doomed.runId)).toBeUndefined();
    expect(await store.getWaitpoint(doomed.waitpointId)).toBeUndefined();
    expect(
      (await store.listWaitpointsForRuns([doomed.runId])).get(doomed.runId),
    ).toEqual([]);
    expect(await store.hasCompletedWaitpoint(doomed.runId)).toBe(false);
    expect(await store.heldRunIds()).not.toContain(doomed.runId);
    // Nothing left to claim for a resume that lands afterwards.
    expect(await store.claimWaitingRun(doomed.runId)).toBe(false);
    expect((await store.getWaitpoint(kept.waitpointId))?.approval).toContain(
      "Secret plan",
    );
  });
});
