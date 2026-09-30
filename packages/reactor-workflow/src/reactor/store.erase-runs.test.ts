import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFreshRelationalDb } from "../../test/helpers/pglite.js";
import { WorkflowRunStore } from "./store.js";

const step = (stepId: string) => ({
  stepId,
  key: stepId,
  pieceName: "fake",
  blockName: "ok",
  status: "SUCCEEDED" as const,
  input: { in: stepId },
  output: { out: stepId },
  port: "next",
});

async function freshStore() {
  const db = createFreshRelationalDb();
  const store = await WorkflowRunStore.create(db);
  const start = async (
    options: {
      payload?: unknown;
      rerunOf?: string;
      workflowId?: string;
      triggerKind?: string;
    } = {},
  ) => {
    const runId = await store.startRun({
      workflowId: options.workflowId ?? "wf-erase",
      workflowName: "Erase",
      workflowVersion: 1,
      triggerKind: options.triggerKind ?? "document-event",
      triggerPayload: options.payload,
      rerunOf: options.rerunOf,
    });
    await store.recordStep(runId, 0, step("a"));
    await store.recordStep(runId, 1, step("b"));
    return runId;
  };
  const finish = (runId: string) =>
    store.finishRun(runId, {
      status: "SUCCEEDED",
      steps: [step("a"), step("b")],
    } as never);
  return { store, start, finish };
}

describe("eraseRunsForDocuments", () => {
  it("deletes the runs a document was handed to, with their steps and reruns", async () => {
    const { store, start, finish } = await freshStore();
    const doomed = randomUUID();
    const handed = await start();
    await store.recordRunDocuments(handed, [doomed, "doc-kept"]);
    await finish(handed);
    const rerun = await start({ rerunOf: handed });
    await finish(rerun);
    const rerunOfRerun = await start({ rerunOf: rerun });
    await finish(rerunOfRerun);
    const other = await start();
    await store.recordRunDocuments(other, ["doc-kept"]);
    await finish(other);

    const erased = await store.eraseRunsForDocuments([doomed]);

    expect(erased).toEqual({
      runs: 3,
      steps: 6,
      documents: 2,
      dedupeKeysUnlinked: 0,
    });
    for (const runId of [handed, rerun, rerunOfRerun]) {
      expect(await store.getRun(runId)).toBeUndefined();
      expect(await store.getSteps(runId)).toEqual([]);
      expect(await store.getRunDocuments(runId)).toEqual([]);
    }
    expect(await store.getRun(other)).toBeDefined();
    expect(await store.getSteps(other)).toHaveLength(2);
    expect(await store.getRunDocuments(other)).toEqual(["doc-kept"]);
  });

  it("deletes the runs whose trigger named the document or its drive", async () => {
    const { store, start } = await freshStore();
    const doomed = randomUUID();
    const byDocument = await start({ payload: { documentId: doomed } });
    const byDrive = await start({
      payload: { documentId: "doc-kept", driveId: doomed },
    });
    const mentioned = await start({ payload: { note: doomed } });
    const prefixed = await start({ payload: { documentId: `${doomed}-x` } });

    const erased = await store.eraseRunsForDocuments([doomed]);

    expect(erased.runs).toBe(2);
    expect(await store.getRun(byDocument)).toBeUndefined();
    expect(await store.getRun(byDrive)).toBeUndefined();
    expect(await store.getRun(mentioned)).toBeDefined();
    expect(await store.getRun(prefixed)).toBeDefined();
  });

  it("deletes a purged workflow's own runs, its test runs included", async () => {
    const { store, start } = await freshStore();
    const workflowId = randomUUID();
    const fired = await start({ workflowId });
    const tested = await start({ workflowId, triggerKind: "test" });
    const rerun = await start({ rerunOf: fired });
    const other = await start();

    const erased = await store.eraseRunsForDocuments([workflowId]);

    expect(erased).toMatchObject({ runs: 3, steps: 6 });
    for (const runId of [fired, tested, rerun]) {
      expect(await store.getRun(runId)).toBeUndefined();
    }
    expect(await store.getRun(other)).toBeDefined();
  });

  it("keeps a claimed dedupe key but unlinks it from the erased run", async () => {
    const { store } = await freshStore();
    const doomed = randomUUID();
    const nowIso = new Date().toISOString();
    const runId = await store.claimAndEnqueueRun("key-1", 60_000, nowIso, {
      workflowId: "wf-erase",
      triggerKind: "document-event",
      triggerPayload: { documentId: doomed },
    });

    const erased = await store.eraseRunsForDocuments([doomed]);

    expect(erased).toMatchObject({ runs: 1, dedupeKeysUnlinked: 1 });
    expect(runId).not.toBeNull();
    expect(await store.getRun(runId!)).toBeUndefined();
    expect(await store.claimDedupe("wf-erase", "key-1", 60_000, nowIso)).toBe(
      false,
    );
  });

  it("is a no-op the second time", async () => {
    const { store, start, finish } = await freshStore();
    const doomed = randomUUID();
    const runId = await start();
    await store.recordRunDocuments(runId, [doomed]);
    await finish(runId);
    const other = await start();

    expect((await store.eraseRunsForDocuments([doomed])).runs).toBe(1);
    expect(await store.eraseRunsForDocuments([doomed])).toEqual({
      runs: 0,
      steps: 0,
      documents: 0,
      dedupeKeysUnlinked: 0,
    });
    expect(await store.getSteps(other)).toHaveLength(2);
  });

  it("drops what a run erased mid-flight journals afterwards", async () => {
    const { store, start } = await freshStore();
    const doomed = randomUUID();
    const runId = await start();
    await store.recordRunDocuments(runId, [doomed]);

    await store.eraseRunsForDocuments([doomed]);
    await store.recordStep(runId, 2, step("c"));
    await store.recordRunDocuments(runId, ["doc-later"]);
    await store.finishRun(runId, {
      status: "SUCCEEDED",
      steps: [step("a"), step("b"), step("c")],
    } as never);

    expect(await store.getRun(runId)).toBeUndefined();
    expect(await store.getSteps(runId)).toEqual([]);
    expect(await store.getRunDocuments(runId)).toEqual([]);
  });
});
