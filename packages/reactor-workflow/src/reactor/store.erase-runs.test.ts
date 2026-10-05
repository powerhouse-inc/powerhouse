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

  it("deletes the runs whose lifecycle trigger named it as the parent", async () => {
    const { store, start } = await freshStore();
    const doomed = randomUUID();
    const child = await start({
      payload: { documentId: "doc-kept", driveId: null, parentId: doomed },
    });

    expect((await store.eraseRunsForDocuments([doomed])).runs).toBe(1);
    expect(await store.getRun(child)).toBeUndefined();
  });

  it("deletes the test runs whose sample named the document", async () => {
    const { store, start } = await freshStore();
    const doomed = randomUUID();
    const sample = async (output: unknown, triggerKind = "test") => {
      const runId = await start({ workflowId: "wf-other", triggerKind });
      await store.recordStep(runId, 2, { ...step("trigger"), output });
      return runId;
    };
    const listed = await sample([
      { documentId: "doc-kept" },
      { documentId: doomed },
    ]);
    const single = await sample({ driveId: doomed });
    const mentioned = await sample({ note: doomed });
    const fired = await sample({ documentId: doomed }, "document-event");

    expect((await store.eraseRunsForDocuments([doomed])).runs).toBe(2);
    expect(await store.getRun(listed)).toBeUndefined();
    expect(await store.getRun(single)).toBeUndefined();
    expect(await store.getRun(mentioned)).toBeDefined();
    expect(await store.getRun(fired)).toBeDefined();
  });

  it("deletes a run whose truncated trigger payload named the document", async () => {
    // Over STEP_PAYLOAD_MAX_BYTES, so the journal keeps the marker instead
    // of the payload — with the payload's top-level ids carried over, so
    // this route still matches. Word-broken filler, as in
    // store.payload-cap.test.ts.
    const { store, start } = await freshStore();
    const doomed = randomUUID();
    const pad = "pad ".repeat(80 * 1024);
    const truncated = await start({
      payload: { documentId: doomed, document: pad },
    });
    const kept = await start({
      payload: { documentId: "doc-kept", document: pad },
    });

    expect((await store.eraseRunsForDocuments([doomed])).runs).toBe(1);
    expect(await store.getRun(truncated)).toBeUndefined();
    expect(await store.getRun(kept)).toBeDefined();
  });

  it("deletes a test run whose truncated sample named the document at top level", async () => {
    const { store, start } = await freshStore();
    const doomed = randomUUID();
    const sample = async (output: unknown) => {
      const runId = await start({
        workflowId: "wf-other",
        triggerKind: "test",
      });
      await store.recordStep(runId, 2, { ...step("trigger"), output });
      return runId;
    };
    const object = await sample({
      documentId: doomed,
      document: "pad ".repeat(80 * 1024),
    });
    // The accepted gap: a list sample names its documents per item, and the
    // marker keeps only the payload's top-level ids — collecting per-item
    // ids would grow with the payload, which the cap exists to prevent. So
    // an over-cap trigger-test sample survives erasure; runs actually fired
    // from the document stay covered by the run_document and trigger_payload
    // routes above.
    const listed = await sample(
      Array.from({ length: 40 }, () => ({
        documentId: doomed,
        document: "pad ".repeat(2 * 1024),
      })),
    );

    expect((await store.eraseRunsForDocuments([doomed])).runs).toBe(1);
    expect(await store.getRun(object)).toBeUndefined();
    expect(await store.getRun(listed)).toBeDefined();
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
