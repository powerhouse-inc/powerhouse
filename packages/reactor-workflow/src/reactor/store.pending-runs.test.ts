// A PENDING run is durable but not started. Orphan recovery must leave it
// alone — that sweep closes out runs a dead process was executing — and the
// pass that does own it has to leave it rerunnable.
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { IRelationalDb } from "@powerhousedao/shared/processors";
import {
  createFreshRelationalDb,
  createTestRelationalDb,
} from "../../test/helpers/pglite.js";
import {
  abandonedFireError,
  ABANDONED_PENDING_RUN_ERROR,
  FIRE_CRASH_BUDGET,
  ORPHANED_RUN_ERROR,
  WorkflowRunStore,
  type WorkflowRuntimeDB,
} from "./store.js";

describe("pending runs in the journal", () => {
  let relationalDb: IRelationalDb;
  let store: WorkflowRunStore;

  beforeAll(async () => {
    relationalDb = createTestRelationalDb();
    store = await WorkflowRunStore.create(relationalDb);
  });

  it("records the trigger payload with no workflow yet named", async () => {
    const runId = await store.enqueueRun({
      workflowId: "wf-pending",
      triggerKind: "document-event",
      triggerPayload: { documentId: "doc-1" },
    });

    const run = await store.getRun(runId);
    expect(run?.status).toBe("PENDING");
    expect(run?.ended_at).toBeNull();
    expect(JSON.parse(run!.trigger_payload!)).toEqual({ documentId: "doc-1" });
  });

  it("is left alone by the orphaned-RUNNING sweep", async () => {
    const runId = await store.enqueueRun({
      workflowId: "wf-pending-sweep",
      triggerKind: "document-event",
    });

    await store.recoverOrphanedRuns();

    expect((await store.getRun(runId))?.status).toBe("PENDING");
  });

  it("is left alone while this process still owns it", async () => {
    const runId = await store.enqueueRun({
      workflowId: "wf-pending-mine",
      triggerKind: "document-event",
    });

    await store.recoverAbandonedRuns();

    expect((await store.getRun(runId))?.status).toBe("PENDING");
  });

  it("is failed and rerunnable once a new journal opens over it", async () => {
    const runId = await store.enqueueRun({
      workflowId: "wf-pending-abandoned",
      triggerKind: "document-event",
      triggerPayload: { documentId: "doc-2" },
    });

    // A restart: the row is nobody's now, so create()'s sweep reaches it.
    const reopened = await WorkflowRunStore.create(relationalDb);

    const run = await reopened.getRun(runId);
    expect(run?.status).toBe("FAILED");
    expect(run?.error).toBe(ABANDONED_PENDING_RUN_ERROR);
    expect(run?.error).not.toBe(ORPHANED_RUN_ERROR);
    expect(run?.ended_at).not.toBeNull();
    // rerun() only accepts FAILED, and replays this payload.
    expect(JSON.parse(run!.trigger_payload!)).toEqual({ documentId: "doc-2" });
  });

  it("beginRun fills in what only the workflow document knows", async () => {
    const runId = await store.enqueueRun({
      workflowId: "wf-pending-begin",
      triggerKind: "document-event",
    });

    await store.beginRun(runId, {
      workflowName: "Named late",
      workflowVersion: 7,
    });

    const run = await store.getRun(runId);
    expect(run?.status).toBe("RUNNING");
    expect(run?.workflow_name).toBe("Named late");
    expect(run?.workflow_version).toBe(7);
  });

  // The claim and the run commit together, so two concurrent deliveries of one
  // operation cannot both fire it: the loser sees the winner's run id.
  it("claims the dedupe key and journals the run together", async () => {
    const now = new Date().toISOString();
    const options = { workflowId: "wf-atomic", triggerKind: "document-event" };

    const [first, second] = await Promise.all([
      store.claimAndEnqueueRun("op:race", 60_000, now, options),
      store.claimAndEnqueueRun("op:race", 60_000, now, options),
    ]);

    const outcomes = [first.outcome, second.outcome].sort();
    expect(outcomes).toEqual(["claimed", "duplicate"]);
    const winner = first.outcome === "claimed" ? first : second;
    if (winner.outcome !== "claimed") throw new Error("expected a claim");

    // Exactly one run, and the dedupe row points at it.
    const runs = await store.listRuns("wf-atomic");
    expect(runs.map((run) => run.id)).toEqual([winner.runId]);
    const db =
      await relationalDb.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    const row = await db
      .selectFrom("trigger_dedupe")
      .selectAll()
      .where("workflow_id", "=", "wf-atomic")
      .executeTakeFirstOrThrow();
    expect(row.run_id).toBe(winner.runId);
  });

  // And the other half of the same invariant: a run insert that throws takes
  // the run_id back with it, so the claim never holds a run that is not there.
  it("rolls the claim back with a run that failed to journal", async () => {
    const now = new Date().toISOString();
    const options = {
      workflowId: "wf-rollback",
      triggerKind: "document-event",
    };
    const insert = vi
      .spyOn(
        store as unknown as { insertPendingRun: () => Promise<void> },
        "insertPendingRun",
      )
      .mockRejectedValueOnce(new Error("crash between claim and enqueue"));

    await expect(
      store.claimAndEnqueueRun("op:rb", 60_000, now, options),
    ).rejects.toThrow("crash between claim and enqueue");

    const db =
      await relationalDb.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    const row = await db
      .selectFrom("trigger_dedupe")
      .selectAll()
      .where("workflow_id", "=", "wf-rollback")
      .executeTakeFirstOrThrow();
    // The attempt is counted (the budget needs it) but no run is claimed.
    expect(row.run_id).toBeNull();
    expect(row.attempts).toBe(1);
    expect(await store.listRuns("wf-rollback")).toEqual([]);
    insert.mockRestore();
  });

  it("retries a claim whose run never landed, up to the crash budget", async () => {
    const now = new Date().toISOString();
    const options = { workflowId: "wf-claim", triggerKind: "document-event" };
    const insert = vi
      .spyOn(
        store as unknown as { insertPendingRun: () => Promise<void> },
        "insertPendingRun",
      )
      .mockRejectedValueOnce(new Error("crash between claim and enqueue"));

    await expect(
      store.claimAndEnqueueRun("op:1", 60_000, now, options),
    ).rejects.toThrow("crash between claim and enqueue");
    // The claim is NOT rolled back: it is the record of the attempt, which is
    // the only way a crash that leaves nothing behind can be counted. What it
    // does not hold is a run, so the replay is retried rather than suppressed.
    const claimed = await store.claimAndEnqueueRun(
      "op:1",
      60_000,
      now,
      options,
    );
    expect(claimed.outcome).toBe("claimed");
    if (claimed.outcome !== "claimed") throw new Error("expected a claim");
    // Now it holds a run, so a further delivery is an ordinary duplicate.
    expect(
      (await store.claimAndEnqueueRun("op:1", 60_000, now, options)).outcome,
    ).toBe("duplicate");
    expect(insert).toHaveBeenCalledTimes(2);
    insert.mockRestore();

    const runs = await store.listRuns("wf-claim");
    expect(runs.map((run) => run.id)).toEqual([claimed.runId]);
    const db =
      await relationalDb.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    const row = await db
      .selectFrom("trigger_dedupe")
      .selectAll()
      .where("workflow_id", "=", "wf-claim")
      .executeTakeFirstOrThrow();
    expect(row.run_id).toBe(claimed.runId);
    // Three deliveries: the one that crashed, the one that claimed, and the
    // duplicate. The counter only decides anything while run_id is null.
    expect(row.attempts).toBe(3);
  });

  // Backlog item 5: a fire that takes the process down before the write lands
  // is re-delivered by the read model on every boot. The budget is what turns
  // an unbootable reactor into one FAILED run naming the loop.
  it("abandons a fire that has never once journaled a run", async () => {
    const now = new Date().toISOString();
    const options = { workflowId: "wf-loop", triggerKind: "document-event" };
    const insert = vi
      .spyOn(
        store as unknown as { insertPendingRun: () => Promise<void> },
        "insertPendingRun",
      )
      .mockRejectedValue(new Error("takes the reactor down"));

    for (let delivery = 1; delivery <= FIRE_CRASH_BUDGET; delivery++) {
      await expect(
        store.claimAndEnqueueRun("op:loop", 60_000, now, options),
      ).rejects.toThrow("takes the reactor down");
    }
    const over = await store.claimAndEnqueueRun(
      "op:loop",
      60_000,
      now,
      options,
    );

    expect(over).toEqual({
      outcome: "abandoned",
      attempts: FIRE_CRASH_BUDGET + 1,
    });
    // Over budget, nothing is even attempted any more.
    expect(insert).toHaveBeenCalledTimes(FIRE_CRASH_BUDGET);
    insert.mockRestore();

    const runId = await store.journalAbandonedFire("op:loop", {
      ...options,
      attempts: FIRE_CRASH_BUDGET + 1,
    });
    const run = await store.getRun(runId);
    // FAILED, so it is both visible and rerunnable once the cause is fixed.
    expect(run?.status).toBe("FAILED");
    expect(run?.error).toBe(abandonedFireError(FIRE_CRASH_BUDGET + 1));
  });
});

// The counts are what the recovery warning reports, so they must be real
// on the knex-backed database Switchboard runs, which reports no row counts.
describe("recovery counts", () => {
  it("counts the runs another process left behind", async () => {
    const db = createFreshRelationalDb();
    const survivor = await WorkflowRunStore.create(db);
    const dead = await WorkflowRunStore.create(db);
    const pending = [
      await dead.enqueueRun({ workflowId: "wf-a", triggerKind: "manual" }),
      await dead.enqueueRun({ workflowId: "wf-b", triggerKind: "manual" }),
    ];
    const running = await dead.enqueueRun({
      workflowId: "wf-c",
      triggerKind: "manual",
    });
    await dead.beginRun(running, { workflowName: "C", workflowVersion: 1 });

    await expect(survivor.recoverAbandonedRuns()).resolves.toBe(2);
    await expect(survivor.recoverOrphanedRuns()).resolves.toBe(1);
    await expect(survivor.recoverAbandonedRuns()).resolves.toBe(0);
    for (const runId of [...pending, running]) {
      expect((await survivor.getRun(runId))?.status).toBe("FAILED");
    }
  });
});
