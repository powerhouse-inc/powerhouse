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
  ABANDONED_PENDING_RUN_ERROR,
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

  it("claims the dedupe key and journals the run together", async () => {
    const now = new Date().toISOString();
    const options = { workflowId: "wf-claim", triggerKind: "document-event" };
    vi.spyOn(
      store as unknown as { insertPendingRun: () => Promise<void> },
      "insertPendingRun",
    ).mockRejectedValueOnce(new Error("crash between claim and enqueue"));

    await expect(
      store.claimAndEnqueueRun("op:1", 60_000, now, options),
    ).rejects.toThrow("crash between claim and enqueue");
    // The claim rolled back with the run, so the replay still enqueues it.
    const runId = await store.claimAndEnqueueRun("op:1", 60_000, now, options);
    expect(runId).not.toBeNull();
    expect(
      await store.claimAndEnqueueRun("op:1", 60_000, now, options),
    ).toBeNull();

    const runs = await store.listRuns("wf-claim");
    expect(runs.map((run) => run.id)).toEqual([runId]);
    const db =
      await relationalDb.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    const claim = await db
      .selectFrom("trigger_dedupe")
      .selectAll()
      .where("workflow_id", "=", "wf-claim")
      .executeTakeFirstOrThrow();
    expect(claim.run_id).toBe(runId);
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
