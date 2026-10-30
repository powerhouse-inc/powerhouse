// The step path on a journal written before loops journaled iterations.
import { describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { WorkflowRunStore, type WorkflowRuntimeDB } from "./store.js";

describe("the step_path migration", () => {
  it("keys an existing journal by path, its rows by their step id", async () => {
    const relational = createFreshRelationalDb();
    const first = await WorkflowRunStore.create(relational);
    const options = { workflowId: "wf-legacy", triggerKind: "manual" };
    const runId = await first.startRun({
      ...options,
      workflowName: "Legacy",
      workflowVersion: 1,
    });
    const db =
      await relational.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    // Back to the shape before the migration.
    await db.schema
      .alterTable("step_execution")
      .dropConstraint("step_execution_run_path")
      .execute();
    await db.schema
      .alterTable("step_execution")
      .dropColumn("step_path")
      .execute();
    await db.schema
      .alterTable("step_execution")
      .addUniqueConstraint("step_execution_run_step", ["run_id", "step_id"])
      .execute();
    await db
      .deleteFrom("migration_mark")
      .where("name", "=", "step_execution.step_path")
      .execute();
    await db
      .insertInto("step_execution")
      .values({
        id: "legacy-row",
        run_id: runId,
        ordinal: 0,
        step_id: "loop",
        step_key: "loop",
        piece_name: "@powerhousedao/piece-core",
        block_name: "loop",
        status: "SUCCEEDED",
        input: null,
        output: null,
        port: "next",
        error: null,
      } as never)
      .execute();

    const store = await WorkflowRunStore.create(relational);
    const [legacy] = await store.getSteps(runId);
    expect(legacy).toMatchObject({ step_id: "loop", step_path: "loop" });

    const body = {
      stepId: "body",
      key: "body",
      pieceName: "@acme/piece",
      blockName: "act",
      status: "SUCCEEDED" as const,
    };
    await store.recordStep(runId, 1, {
      ...body,
      path: "loop[1]/body",
      output: 1,
    });
    await store.recordStep(runId, 2, {
      ...body,
      path: "loop[2]/body",
      output: 2,
    });
    await store.recordStep(runId, 3, { ...body, output: 2 });
    // A re-journaled iteration corrects its own row.
    await store.recordStep(runId, 2, {
      ...body,
      path: "loop[2]/body",
      output: 22,
    });

    const top = await store.getSteps(runId);
    expect(top.map((row) => row.step_path)).toEqual(["loop", "body"]);
    const all = await store.getSteps(runId, { withIterations: true });
    expect(all.map((row) => [row.step_path, row.output])).toEqual([
      ["loop", null],
      ["loop[1]/body", "1"],
      ["loop[2]/body", "22"],
      ["body", "2"],
    ]);
    const listed = await store.getStepsForRuns([runId]);
    expect(listed.get(runId)?.map((row) => row.step_path)).toEqual([
      "loop",
      "body",
    ]);

    // Opening again neither re-adds the step id constraint nor fails.
    await WorkflowRunStore.create(relational);
  });
});
