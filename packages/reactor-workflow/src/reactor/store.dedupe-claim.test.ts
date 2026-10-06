// A dedupe row that stands for a fire suppresses a redelivery, linked run or not.
import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import {
  FIRE_CRASH_BUDGET,
  WorkflowRunStore,
  type WorkflowRuntimeDB,
} from "./store.js";

const OPTIONS = { workflowId: "wf-dedupe", triggerKind: "document-event" };

async function freshStore() {
  const relational = createFreshRelationalDb();
  const store = await WorkflowRunStore.create(relational);
  return { relational, store };
}

describe("a redelivered operation", () => {
  it("is a duplicate of a fire that ran without a journal row", async () => {
    const { store } = await freshStore();
    const now = new Date().toISOString();
    expect(
      await store.claimDedupe(OPTIONS.workflowId, "op:1", 60_000, now),
    ).toBe(true);

    const claim = await store.claimAndEnqueueRun("op:1", 60_000, now, OPTIONS);

    expect(claim).toEqual({ outcome: "duplicate" });
    expect(await store.listRuns(OPTIONS.workflowId)).toEqual([]);
  });

  it("is a duplicate of a fire whose run was erased", async () => {
    const { store } = await freshStore();
    const now = new Date().toISOString();
    const documentId = randomUUID();
    const first = await store.claimAndEnqueueRun("op:1", 60_000, now, {
      ...OPTIONS,
      triggerPayload: { documentId },
    });
    expect(first.outcome).toBe("claimed");
    await store.eraseRunsForDocuments([documentId]);

    const again = await store.claimAndEnqueueRun("op:1", 60_000, now, OPTIONS);

    expect(again).toEqual({ outcome: "duplicate" });
    expect(await store.listRuns(OPTIONS.workflowId)).toEqual([]);
  });

  it("is a duplicate of a key a journal written before the claim protocol holds", async () => {
    const relational = createFreshRelationalDb();
    await WorkflowRunStore.create(relational);
    const db =
      await relational.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
    await db.schema
      .alterTable("trigger_dedupe")
      .dropColumn("attempts")
      .execute();
    const now = new Date().toISOString();
    await (
      db as unknown as {
        insertInto: (table: string) => {
          values: (row: Record<string, unknown>) => {
            execute: () => Promise<unknown>;
          };
        };
      }
    )
      .insertInto("trigger_dedupe")
      .values({
        workflow_id: OPTIONS.workflowId,
        dedupe_key: "op:legacy",
        run_id: null,
        created_at: now,
      })
      .execute();

    const store = await WorkflowRunStore.create(relational);
    const claim = await store.claimAndEnqueueRun(
      "op:legacy",
      60_000,
      now,
      OPTIONS,
    );

    expect(claim).toEqual({ outcome: "duplicate" });
  });

  it("is a duplicate once an unjournaled fire records a claim that never landed", async () => {
    const { store } = await freshStore();
    const now = new Date().toISOString();
    const insert = vi
      .spyOn(
        store as unknown as { insertPendingRun: () => Promise<void> },
        "insertPendingRun",
      )
      .mockRejectedValueOnce(new Error("crash between claim and enqueue"));
    await expect(
      store.claimAndEnqueueRun("op:1", 60_000, now, OPTIONS),
    ).rejects.toThrow();
    insert.mockRestore();

    expect(
      await store.claimDedupe(OPTIONS.workflowId, "op:1", 60_000, now),
    ).toBe(true);

    expect(
      await store.claimAndEnqueueRun("op:1", 60_000, now, OPTIONS),
    ).toEqual({ outcome: "duplicate" });
  });

  it("is still retried after a claim whose run never landed", async () => {
    const { store } = await freshStore();
    const now = new Date().toISOString();
    const insert = vi
      .spyOn(
        store as unknown as { insertPendingRun: () => Promise<void> },
        "insertPendingRun",
      )
      .mockRejectedValueOnce(new Error("crash between claim and enqueue"));
    await expect(
      store.claimAndEnqueueRun("op:1", 60_000, now, OPTIONS),
    ).rejects.toThrow();
    insert.mockRestore();

    const again = await store.claimAndEnqueueRun("op:1", 60_000, now, OPTIONS);
    expect(again.outcome).toBe("claimed");
  });

  it("journals one abandoned run, not one per delivery", async () => {
    const { store } = await freshStore();
    const now = new Date().toISOString();
    const insert = vi
      .spyOn(
        store as unknown as { insertPendingRun: () => Promise<void> },
        "insertPendingRun",
      )
      .mockRejectedValue(new Error("takes the reactor down"));
    for (let delivery = 1; delivery <= FIRE_CRASH_BUDGET; delivery++) {
      await expect(
        store.claimAndEnqueueRun("op:loop", 60_000, now, OPTIONS),
      ).rejects.toThrow();
    }
    insert.mockRestore();

    const over = await store.claimAndEnqueueRun(
      "op:loop",
      60_000,
      now,
      OPTIONS,
    );
    expect(over.outcome).toBe("abandoned");
    if (over.outcome !== "abandoned") throw new Error("expected abandonment");
    await store.journalAbandonedFire("op:loop", {
      ...OPTIONS,
      attempts: over.attempts,
    });

    const later = await store.claimAndEnqueueRun(
      "op:loop",
      60_000,
      now,
      OPTIONS,
    );
    expect(later).toEqual({ outcome: "duplicate" });
    const runs = await store.listRuns(OPTIONS.workflowId);
    expect(runs.map((run) => run.status)).toEqual(["FAILED"]);
  });
});
