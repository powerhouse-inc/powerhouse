// Retention is opt-in, prunes only finished runs past the window, and takes
// their steps and documents with them.
import type { OperationWithContext } from "document-model";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { testRuntime } from "../../test/helpers/runtime.js";
import {
  RUN_RETENTION_ENV,
  runRetentionMs,
  sweepRetention,
} from "./run-retention.js";
import type { WorkflowRuntimeService } from "./service.js";
import {
  WorkflowRunStore,
  type RunRow,
  type WorkflowRuntimeDB,
} from "./store.js";

const DAY_MS = 24 * 60 * 60_000;
const NOW = new Date("2026-06-01T00:00:00.000Z");
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * DAY_MS).toISOString();

async function journal() {
  const relationalDb = createTestRelationalDb();
  const store = await WorkflowRunStore.create(relationalDb);
  const db =
    await relationalDb.createNamespace<WorkflowRuntimeDB>("workflow_runtime");
  return { store, db };
}

function run(id: string, workflowId: string, endedAt: string | null): RunRow {
  return {
    id,
    workflow_id: workflowId,
    workflow_name: workflowId,
    workflow_version: 1,
    trigger_kind: "manual",
    trigger_payload: null,
    status: endedAt ? "SUCCEEDED" : "RUNNING",
    error: null,
    error_name: null,
    enqueued_at: endedAt ?? daysAgo(40),
    started_at: endedAt ?? daysAgo(40),
    ended_at: endedAt,
    rerun_of: null,
    warnings: 0,
    warning_notes: null,
  };
}

describe("runRetentionMs", () => {
  it("is off unless a positive number of days is set", () => {
    expect(runRetentionMs({})).toBeUndefined();
    expect(runRetentionMs({ [RUN_RETENTION_ENV]: "0" })).toBeUndefined();
    expect(runRetentionMs({ [RUN_RETENTION_ENV]: "soon" })).toBeUndefined();
    expect(runRetentionMs({ [RUN_RETENTION_ENV]: "30" })).toBe(30 * DAY_MS);
  });
});

describe("the retention sweep", () => {
  it("deletes finished runs past the window with their children, in batches", async () => {
    const { store, db } = await journal();
    const wf = "wf-retention";
    const old = ["old-1", "old-2", "old-3", "old-4", "old-5"];
    await db
      .insertInto("run")
      .values([
        ...old.map((id) => run(id, wf, daysAgo(31))),
        run("recent", wf, daysAgo(2)),
        run("still-running", wf, null),
      ])
      .execute();
    for (const id of [...old, "recent"]) {
      await store.recordStep(id, 0, {
        stepId: "a",
        key: "a",
        pieceName: "fake",
        blockName: "ok",
        status: "SUCCEEDED",
        output: { id },
      });
      await store.recordRunDocuments(id, [`doc-${id}`]);
    }

    const pruned = await store.pruneFinishedRuns(daysAgo(30), 2);

    expect(pruned).toBe(5);
    const left = await store.listRuns(wf);
    expect(left.map((row) => row.id).sort()).toEqual([
      "recent",
      "still-running",
    ]);
    const steps = await store.getStepsForRuns([...old, "recent"]);
    expect(old.every((id) => steps.get(id)!.length === 0)).toBe(true);
    expect(steps.get("recent")).toHaveLength(1);
    const documents = await store.getRunDocumentsForRuns([...old, "recent"]);
    expect(old.every((id) => documents.get(id)!.length === 0)).toBe(true);
    expect(documents.get("recent")).toEqual(["doc-recent"]);
  });

  it("drops dedupe keys older than the longest TTL", async () => {
    const { store } = await journal();
    await store.claimDedupe("wf-dedupe-old", "k", 1_000, daysAgo(3));
    await store.claimDedupe("wf-dedupe-new", "k", 1_000, NOW.toISOString());

    const swept = await sweepRetention(store, {
      retentionMs: 30 * DAY_MS,
      dedupeTtlMs: DAY_MS,
      now: NOW,
    });

    expect(swept.dedupeKeys).toBeGreaterThanOrEqual(1);
    // The old key is free again; the recent one still holds.
    expect(
      await store.claimDedupe(
        "wf-dedupe-old",
        "k",
        10 * DAY_MS,
        NOW.toISOString(),
      ),
    ).toBe(true);
    expect(
      await store.claimDedupe(
        "wf-dedupe-new",
        "k",
        10 * DAY_MS,
        NOW.toISOString(),
      ),
    ).toBe(false);
  });
});

describe("the runtime and retention", () => {
  let service: WorkflowRuntimeService | undefined;

  afterEach(() => {
    service?.shutdown();
    service = undefined;
    vi.unstubAllEnvs();
  });

  it("sweeps once the journal opens when retention is configured", async () => {
    const { db } = await journal();
    await db
      .insertInto("run")
      .values([
        run(
          "rt-old",
          "wf-rt",
          new Date(Date.now() - 10 * DAY_MS).toISOString(),
        ),
        run("rt-new", "wf-rt", new Date().toISOString()),
      ])
      .execute();
    vi.stubEnv(RUN_RETENTION_ENV, "7");

    service = testRuntime();

    const store = (await service.store())!;
    await vi.waitFor(async () => {
      expect((await store.listRuns("wf-rt")).map((row) => row.id)).toEqual([
        "rt-new",
      ]);
    });
  });

  it("forgets a deleted workflow's dedupe keys", async () => {
    service = testRuntime();
    const store = (await service.store())!;
    const now = new Date().toISOString();
    await store.claimDedupe("wf-deleted", "op:1", DAY_MS, now);

    await service.onOperations([
      {
        operation: {
          index: 1,
          timestampUtcMs: "1",
          action: {
            type: "DELETE_DOCUMENT",
            input: { documentId: "wf-deleted" },
          },
        },
        context: {
          documentId: "wf-deleted",
          documentType: "powerhouse/workflow",
          scope: "document",
          branch: "main",
          ordinal: 1,
        },
      } as unknown as OperationWithContext,
    ]);

    expect(await store.claimDedupe("wf-deleted", "op:1", DAY_MS, now)).toBe(
      true,
    );
  });
});
