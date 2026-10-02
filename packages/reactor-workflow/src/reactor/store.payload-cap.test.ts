// R5 (testing policy): the step journal is durable storage that grows with
// every run, so each payload is bounded at the write. The cap bounds row
// width only — row count is bounded by the retention sweep (run-retention.ts),
// which run-retention.test.ts pins off by default: with
// PH_WORKFLOWS_RUN_RETENTION_DAYS unset, capped rows still accumulate for
// ever. Whoever changes the cap or the retention default should weigh the
// two together (R4; authority: the 2026-10-02 workflow-step-log-is-unbounded
// bug report, where one polling workflow wrote ~46 MB of journal per minute).
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { beforeAll, describe, expect, it } from "vitest";
import {
  STEP_PAYLOAD_MAX_BYTES,
  STEP_PAYLOAD_PREFIX_CHARS,
  WorkflowRunStore,
  isTruncatedStepPayload,
  journaledTriggerDocumentIds,
} from "./store.js";

describe("WorkflowRunStore payload cap", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(createTestRelationalDb());
  });

  async function startRun(): Promise<string> {
    return store.startRun({
      workflowId: "wf-payload-cap",
      workflowName: "Cap me",
      workflowVersion: 1,
      triggerKind: "manual",
    });
  }

  // Word-broken filler, so this suite stays independent of how redact()'s
  // text pass performs over long unbroken runs (pinned in redact.test.ts).
  const filler = (word: string, bytes: number) =>
    `${word} `.repeat(Math.ceil(bytes / (word.length + 1))).slice(0, bytes);

  it("journals an over-cap output as a marker, and the small input intact", async () => {
    // Serializes to the cap plus the object wrapper, so it is over by itself.
    const output = { document: filler("doc", STEP_PAYLOAD_MAX_BYTES) };
    const serialized = JSON.stringify(output);
    const input = { documentId: "doc-1" };
    const runId = await startRun();
    await store.recordStep(runId, 0, {
      stepId: "a",
      key: "get",
      pieceName: "piece",
      blockName: "document-get",
      status: "SUCCEEDED",
      input,
      output,
    });

    const [row] = await store.getSteps(runId);
    // The row itself is bounded, not just reshaped.
    expect(Buffer.byteLength(row.output ?? "", "utf8")).toBeLessThanOrEqual(
      STEP_PAYLOAD_MAX_BYTES,
    );
    const journaled = JSON.parse(row.output ?? "") as unknown;
    if (!isTruncatedStepPayload(journaled)) {
      throw new Error("expected the journaled output to carry the marker");
    }
    expect(journaled.truncated).toBe(true);
    expect(journaled.bytes).toBe(Buffer.byteLength(serialized, "utf8"));
    expect(journaled.prefix).toBe(
      serialized.slice(0, STEP_PAYLOAD_PREFIX_CHARS),
    );
    // The cap is per payload: the input next to it is untouched.
    expect(JSON.parse(row.input ?? "")).toEqual(input);
  });

  it("journals a payload at the cap intact, and one byte over as a marker", async () => {
    // A bare string of these characters serializes to itself plus two quotes.
    const atCap = filler("word", STEP_PAYLOAD_MAX_BYTES - 2);
    const overCap = filler("word", STEP_PAYLOAD_MAX_BYTES - 1);
    const runId = await startRun();
    await store.recordStep(runId, 0, {
      stepId: "at",
      key: "at",
      pieceName: "piece",
      blockName: "block",
      status: "SUCCEEDED",
      output: atCap,
    });
    await store.recordStep(runId, 1, {
      stepId: "over",
      key: "over",
      pieceName: "piece",
      blockName: "block",
      status: "SUCCEEDED",
      output: overCap,
    });

    const rows = await store.getSteps(runId);
    const at = rows.find((row) => row.step_id === "at");
    const over = rows.find((row) => row.step_id === "over");
    expect(JSON.parse(at?.output ?? "")).toBe(atCap);
    const marker = JSON.parse(over?.output ?? "") as unknown;
    if (!isTruncatedStepPayload(marker)) {
      throw new Error("expected the one-byte-over output to carry the marker");
    }
    expect(marker.bytes).toBe(STEP_PAYLOAD_MAX_BYTES + 1);
    expect(marker.prefix).toBe(
      JSON.stringify(overCap).slice(0, STEP_PAYLOAD_PREFIX_CHARS),
    );
  });

  it("caps the closing sweep's writes the same way", async () => {
    const output = { document: filler("swept", STEP_PAYLOAD_MAX_BYTES) };
    const runId = await startRun();
    // No recordStep first: the sweep writes this row itself.
    await store.finishRun(runId, {
      status: "SUCCEEDED",
      steps: [
        {
          stepId: "swept",
          key: "swept",
          pieceName: "piece",
          blockName: "document-get",
          status: "SUCCEEDED",
          output,
        },
      ],
    });

    const [row] = await store.getSteps(runId);
    const journaled = JSON.parse(row.output ?? "") as unknown;
    if (!isTruncatedStepPayload(journaled)) {
      throw new Error("expected the swept output to carry the marker");
    }
    expect(journaled.bytes).toBe(
      Buffer.byteLength(JSON.stringify(output), "utf8"),
    );
    expect(journaled.prefix.length).toBe(STEP_PAYLOAD_PREFIX_CHARS);
  });

  it("caps an over-cap trigger payload to the same marker", async () => {
    // R2 (testing policy): run.trigger_payload is journal storage like a
    // step payload, and was the one uncapped writer left.
    const payload = { document: filler("trig", STEP_PAYLOAD_MAX_BYTES) };
    const serialized = JSON.stringify(payload);
    const runId = await store.startRun({
      workflowId: "wf-payload-cap",
      workflowName: "Cap me",
      workflowVersion: 1,
      triggerKind: "webhook",
      triggerPayload: payload,
    });

    const run = await store.getRun(runId);
    expect(
      Buffer.byteLength(run?.trigger_payload ?? "", "utf8"),
    ).toBeLessThanOrEqual(STEP_PAYLOAD_MAX_BYTES);
    const journaled = JSON.parse(run?.trigger_payload ?? "") as unknown;
    if (!isTruncatedStepPayload(journaled)) {
      throw new Error("expected the trigger payload to carry the marker");
    }
    expect(journaled.truncated).toBe(true);
    expect(journaled.bytes).toBe(Buffer.byteLength(serialized, "utf8"));
    expect(journaled.prefix).toBe(
      serialized.slice(0, STEP_PAYLOAD_PREFIX_CHARS),
    );
  });

  it("journals a below-cap trigger payload intact", async () => {
    const payload = { documentId: "doc-1", note: filler("small", 1024) };
    const runId = await store.startRun({
      workflowId: "wf-payload-cap",
      workflowName: "Cap me",
      workflowVersion: 1,
      triggerKind: "webhook",
      triggerPayload: payload,
    });

    const run = await store.getRun(runId);
    expect(JSON.parse(run?.trigger_payload ?? "")).toEqual(payload);
  });

  it("caps the pending-run writer's trigger payload the same way", async () => {
    const payload = { document: filler("queued", STEP_PAYLOAD_MAX_BYTES) };
    const serialized = JSON.stringify(payload);
    const runId = await store.enqueueRun({
      workflowId: "wf-payload-cap",
      triggerKind: "document-event",
      triggerPayload: payload,
    });

    const run = await store.getRun(runId);
    const journaled = JSON.parse(run?.trigger_payload ?? "") as unknown;
    if (!isTruncatedStepPayload(journaled)) {
      throw new Error("expected the enqueued payload to carry the marker");
    }
    expect(journaled.bytes).toBe(Buffer.byteLength(serialized, "utf8"));
    expect(journaled.prefix).toBe(
      serialized.slice(0, STEP_PAYLOAD_PREFIX_CHARS),
    );
  });

  it("keeps the payload's top-level document ids on the marker", async () => {
    // Erasure (journaledPayloadNames) and run serving (triggerDocumentIds)
    // both read these two ids off the journaled row; capping the payload
    // must not uncouple the row from its documents.
    const payload = {
      documentId: "doc-ids",
      driveId: "drive-ids",
      document: filler("idful", STEP_PAYLOAD_MAX_BYTES),
    };
    const runId = await store.startRun({
      workflowId: "wf-payload-cap",
      workflowName: "Cap me",
      workflowVersion: 1,
      triggerKind: "document-event",
      triggerPayload: payload,
    });

    const run = await store.getRun(runId);
    const journaled = JSON.parse(run?.trigger_payload ?? "") as unknown;
    if (!isTruncatedStepPayload(journaled)) {
      throw new Error("expected the trigger payload to carry the marker");
    }
    expect(journaled.documentId).toBe("doc-ids");
    expect(journaled.driveId).toBe("drive-ids");
    expect(journaledTriggerDocumentIds(run?.trigger_payload ?? null)).toEqual([
      "doc-ids",
      "drive-ids",
    ]);
  });

  it("carries no ids for a payload without string ids at its top level", async () => {
    // Ids live per item in a list sample, and a non-string id is not an id:
    // neither grows the marker (the cap is the point).
    const payload = [
      { documentId: "doc-listed", document: filler("item", 8 * 1024) },
    ];
    const list = Array.from({ length: 40 }, () => payload[0]);
    const runId = await store.startRun({
      workflowId: "wf-payload-cap",
      workflowName: "Cap me",
      workflowVersion: 1,
      triggerKind: "document-event",
      triggerPayload: list,
    });

    const run = await store.getRun(runId);
    const journaled = JSON.parse(run?.trigger_payload ?? "") as unknown;
    if (!isTruncatedStepPayload(journaled)) {
      throw new Error("expected the list payload to carry the marker");
    }
    expect(journaled.documentId).toBeUndefined();
    expect(journaled.driveId).toBeUndefined();
  });

  it("recognizes only its own marker, so rerun replays real outputs", () => {
    expect(
      isTruncatedStepPayload({ truncated: true, bytes: 1, prefix: "" }),
    ).toBe(true);
    // Ordinary outputs, including near-misses, replay as before.
    expect(isTruncatedStepPayload(null)).toBe(false);
    expect(isTruncatedStepPayload("truncated")).toBe(false);
    expect(isTruncatedStepPayload([{ truncated: true }])).toBe(false);
    expect(
      isTruncatedStepPayload({ truncated: false, bytes: 1, prefix: "" }),
    ).toBe(false);
    expect(isTruncatedStepPayload({ truncated: true, bytes: "1" })).toBe(false);
  });
});
