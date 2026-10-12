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
  abandonedAdmissionError,
  abandonedFireError,
  FIRE_CRASH_BUDGET,
  STEP_PAYLOAD_MAX_BYTES,
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

    const admitted = await store.admitAbandonedRuns();

    expect(admitted.map((run) => run.runId)).not.toContain(runId);
    expect((await store.getRun(runId))?.status).toBe("PENDING");
  });

  it("is not admitted while the enqueue that wrote it has yet to return", async () => {
    const insert = (
      store as unknown as {
        insertPendingRun: (...args: unknown[]) => Promise<void>;
      }
    ).insertPendingRun.bind(store);
    let paused!: () => void;
    const committed = new Promise<void>((resolve) => {
      paused = resolve;
    });
    let resume!: () => void;
    const held = new Promise<void>((resolve) => {
      resume = resolve;
    });
    const spy = vi
      .spyOn(
        store as unknown as {
          insertPendingRun: (...args: unknown[]) => Promise<void>;
        },
        "insertPendingRun",
      )
      .mockImplementationOnce(async (...args: unknown[]) => {
        await insert(...args);
        paused();
        await held;
      });

    const enqueued = store.enqueueRun({
      workflowId: "wf-pending-racing",
      triggerKind: "webhook",
    });
    await committed;
    const admitted = await store.admitAbandonedRuns();
    resume();
    const runId = await enqueued;
    spy.mockRestore();

    expect(admitted.map((run) => run.runId)).not.toContain(runId);
  });

  it("is left to its owner until it is older than the sweep's cutoff", async () => {
    const runId = await store.enqueueRun({
      workflowId: "wf-pending-fresh",
      triggerKind: "document-event",
    });
    const peer = await WorkflowRunStore.create(relationalDb);

    const fresh = await peer.admitAbandonedRuns({
      enqueuedBefore: new Date(Date.now() - 60_000),
    });
    expect(fresh.map((run) => run.runId)).not.toContain(runId);

    const settled = await peer.admitAbandonedRuns({
      enqueuedBefore: new Date(Date.now() + 1000),
    });
    expect(settled.map((run) => run.runId)).toContain(runId);
  });

  it("is admitted once a new journal opens over it", async () => {
    const runId = await store.enqueueRun({
      workflowId: "wf-pending-abandoned",
      triggerKind: "document-event",
      triggerPayload: { documentId: "doc-2" },
    });

    // A restart: the row is nobody's now. It stays PENDING until it starts.
    const reopened = await WorkflowRunStore.create(relationalDb);
    expect((await reopened.getRun(runId))?.status).toBe("PENDING");

    const admitted = await reopened.admitAbandonedRuns();
    expect(admitted).toContainEqual({
      runId,
      workflowId: "wf-pending-abandoned",
      triggerKind: "document-event",
      triggerPayload: { documentId: "doc-2" },
    });
    // Now this process's, so a second pass leaves it alone.
    const again = await reopened.admitAbandonedRuns();
    expect(again.map((run) => run.runId)).not.toContain(runId);
  });

  it("is failed, not run, when the journal kept only a redacted or truncated payload", async () => {
    const redacted = await store.enqueueRun({
      workflowId: "wf-pending-redacted",
      triggerKind: "webhook",
      triggerPayload: { headers: { authorization: "Bearer secret" } },
    });
    const truncated = await store.enqueueRun({
      workflowId: "wf-pending-truncated",
      triggerKind: "webhook",
      triggerPayload: { body: "x".repeat(STEP_PAYLOAD_MAX_BYTES) },
    });

    const reopened = await WorkflowRunStore.create(relationalDb);
    const admitted = (await reopened.admitAbandonedRuns()).map((r) => r.runId);

    expect(admitted).not.toContain(redacted);
    expect(admitted).not.toContain(truncated);
    const [a, b] = await Promise.all([
      reopened.getRun(redacted),
      reopened.getRun(truncated),
    ]);
    expect([a?.status, b?.status]).toEqual(["FAILED", "FAILED"]);
    expect(a?.error).toMatch(/redacted/);
    expect(b?.error).toMatch(/truncated/);
  });

  it("is failed once it has been admitted at as many boots as the crash budget", async () => {
    const db = createFreshRelationalDb();
    const runId = await (
      await WorkflowRunStore.create(db)
    ).enqueueRun({ workflowId: "wf-poison", triggerKind: "schedule" });

    for (let boot = 1; boot <= FIRE_CRASH_BUDGET; boot++) {
      const admitted = await (
        await WorkflowRunStore.create(db)
      ).admitAbandonedRuns();
      expect(admitted.map((run) => run.runId)).toEqual([runId]);
    }
    const last = await WorkflowRunStore.create(db);

    await expect(last.admitAbandonedRuns()).resolves.toEqual([]);
    const run = await last.getRun(runId);
    expect(run?.status).toBe("FAILED");
    expect(run?.error).toBe(abandonedAdmissionError(FIRE_CRASH_BUDGET));
  });

  it("does not count a boot whose graceful shutdown handed the run back", async () => {
    const db = createFreshRelationalDb();
    const runId = await (
      await WorkflowRunStore.create(db)
    ).enqueueRun({ workflowId: "wf-deploys", triggerKind: "schedule" });

    // More deploys than the crash budget, each refusing the run as it stops.
    for (let boot = 1; boot <= FIRE_CRASH_BUDGET + 1; boot++) {
      const store = await WorkflowRunStore.create(db);
      const admitted = await store.admitAbandonedRuns();
      expect(admitted.map((run) => run.runId)).toEqual([runId]);
      await store.releaseAdmission(runId);
    }

    const after = await WorkflowRunStore.create(db);
    expect((await after.getRun(runId))?.status).toBe("PENDING");
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

  it("advances a poll only with the runs its items journaled", async () => {
    const before = "2020-01-01T00:00:00.000Z";
    const after = "2030-01-01T00:00:00.000Z";
    await store.upsertTriggerState({
      workflow_id: "wf-poll-tx",
      piece_name: "@acme/piece-poll",
      trigger_name: "new_item",
      config_hash: "h",
      status: "ENABLED",
      store_state: "{}",
      interval_ms: 1000,
      next_poll_at: before,
      last_poll_at: null,
      last_error: null,
      consecutive_failures: 0,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: before,
    });
    const items = [
      {
        dedupeKey: "item-1",
        options: { workflowId: "wf-poll-tx", triggerKind: "poll" },
      },
    ];
    const success = {
      workflowId: "wf-poll-tx",
      storeState: "{}",
      nextPollAtIso: after,
    };
    const insert = vi
      .spyOn(
        store as unknown as { insertPendingRun: () => Promise<void> },
        "insertPendingRun",
      )
      .mockRejectedValueOnce(new Error("crash between poll and journal"));

    await expect(
      store.journalTriggerItems(items, 60_000, before, success),
    ).rejects.toThrow("crash between poll and journal");
    insert.mockRestore();
    // Still due: the next tick polls again and journals the item.
    expect((await store.getTriggerState("wf-poll-tx"))?.next_poll_at).toBe(
      before,
    );

    const [runId] = await store.journalTriggerItems(
      items,
      60_000,
      before,
      success,
    );
    expect((await store.getRun(runId!))?.status).toBe("PENDING");
    expect((await store.getTriggerState("wf-poll-tx"))?.next_poll_at).toBe(
      after,
    );
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
    const first = await dead.enqueueRun({
      workflowId: "wf-a",
      triggerKind: "manual",
    });
    // Distinct enqueued_at: within one millisecond the id breaks the tie.
    await new Promise((resolve) => setTimeout(resolve, 5));
    const pending = [
      first,
      await dead.enqueueRun({ workflowId: "wf-b", triggerKind: "manual" }),
    ];
    const running = await dead.enqueueRun({
      workflowId: "wf-c",
      triggerKind: "manual",
    });
    await dead.beginRun(running, { workflowName: "C", workflowVersion: 1 });

    await expect(survivor.recoverOrphanedRuns()).resolves.toBe(1);
    await expect(survivor.recoverOrphanedRuns()).resolves.toBe(0);
    expect((await survivor.getRun(running))?.status).toBe("FAILED");
    // PENDING runs are admitted, oldest first, not failed.
    const admitted = await survivor.admitAbandonedRuns();
    expect(admitted.map((run) => run.runId)).toEqual(pending);
  });
});
