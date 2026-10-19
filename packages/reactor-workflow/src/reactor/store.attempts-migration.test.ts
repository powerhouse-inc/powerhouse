// The attempt counters on a journal written before they existed.
import { describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { WorkflowRunStore, type WorkflowRuntimeDB } from "./store.js";

describe("the attempts columns migration", () => {
  it("adds both attempts columns to an existing journal", async () => {
    const relational = createFreshRelationalDb();
    await WorkflowRunStore.create(relational);
    const db =
      await relational.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    await db.schema
      .alterTable("trigger_dedupe")
      .dropColumn("attempts")
      .execute();
    await db.schema
      .alterTable("step_execution")
      .dropColumn("attempts")
      .execute();

    const store = await WorkflowRunStore.create(relational);
    const options = { workflowId: "wf-legacy", triggerKind: "document-event" };
    const claim = await store.claimAndEnqueueRun(
      "op:legacy",
      60_000,
      new Date().toISOString(),
      options,
    );
    expect(claim.outcome).toBe("claimed");
    const dedupe = await db
      .selectFrom("trigger_dedupe")
      .selectAll()
      .where("workflow_id", "=", "wf-legacy")
      .executeTakeFirstOrThrow();
    expect(dedupe.attempts).toBe(1);

    const runId = await store.startRun({
      ...options,
      workflowName: "Legacy",
      workflowVersion: 1,
    });
    await store.recordStep(runId, 0, {
      stepId: "s1",
      key: "s1",
      pieceName: "@acme/piece",
      blockName: "act",
      status: "FAILED",
      error: "boom",
      attempts: 3,
    });
    const [step] = await store.getSteps(runId);
    expect(step.attempts).toBe(3);
  });
});
