// The journal's own gate: whatever the engine hands it, a credential must not
// reach a row. Key-based only here — the store never sees the run's secrets.
import { createTestRelationalDb } from "../../test/helpers/pglite.js";
import { beforeAll, describe, expect, it } from "vitest";
import { WorkflowRunStore } from "./store.js";

describe("WorkflowRunStore redaction", () => {
  let store: WorkflowRunStore;

  beforeAll(async () => {
    store = await WorkflowRunStore.create(createTestRelationalDb());
  });

  it("redacts credentials out of a journaled step, and keeps the rest", async () => {
    const runId = await store.startRun({
      workflowId: "wf-redact",
      workflowName: "Redact me",
      workflowVersion: 1,
      triggerKind: "manual",
    });
    await store.finishRun(runId, {
      status: "FAILED",
      error:
        'Step "post" failed: GET https://api.example.com/v1?api_key=abcd1234efgh returned 401',
      steps: [
        {
          stepId: "a",
          key: "post",
          blockType: "piece#post",
          status: "FAILED",
          input: {
            url: "https://api.example.com/v1",
            headers: { Authorization: "Bearer leaked-token-value" },
          },
          output: { attempts: 2, refresh_token: "leaked-refresh" },
          error: "Request rejected; authorization: Bearer leaked-token-value",
        },
      ],
    });

    const [row] = await store.getSteps(runId);
    expect(JSON.parse(row.input ?? "")).toEqual({
      url: "https://api.example.com/v1",
      headers: { Authorization: "[redacted:authorization]" },
    });
    expect(JSON.parse(row.output ?? "")).toEqual({
      attempts: 2,
      refresh_token: "[redacted:refresh_token]",
    });
    expect(row.error).toBe(
      "Request rejected; authorization: [redacted:authorization]",
    );

    const run = await store.getRun(runId);
    expect(run?.error).toBe(
      'Step "post" failed: GET https://api.example.com/v1?api_key=[redacted:api_key] returned 401',
    );
  });

  it("redacts the trigger payload, headers and all", async () => {
    const runId = await store.startRun({
      workflowId: "wf-redact-webhook",
      workflowName: "Webhook me",
      workflowVersion: 1,
      triggerKind: "webhook",
      triggerPayload: {
        method: "POST",
        headers: {
          authorization: "Bearer inbound-token-value",
          "x-api-key": "inbound-key",
          "x-hub-signature-256": "sha256=deadbeef",
          "content-type": "application/json",
        },
        body: { id: 7 },
      },
    });

    const run = await store.getRun(runId);
    expect(JSON.parse(run?.trigger_payload ?? "")).toEqual({
      method: "POST",
      headers: {
        authorization: "[redacted:authorization]",
        "x-api-key": "[redacted:x-api-key]",
        "x-hub-signature-256": "[redacted:x-hub-signature-256]",
        "content-type": "application/json",
      },
      body: { id: 7 },
    });
  });

  it("redacts the error a failed onEnable writes onto a trigger row", async () => {
    await store.upsertTriggerState({
      workflow_id: "wf-trigger-redact",
      block_type: "piece#gmail",
      config_hash: "h1",
      status: "ERROR",
      store_state: "{}",
      interval_ms: 60000,
      next_poll_at: null,
      last_poll_at: null,
      last_error:
        "onEnable failed: POST https://api.example.com/subscribe?api_key=abcd1234efgh returned 401",
      consecutive_failures: 1,
      lease_owner: null,
      lease_expires_at: null,
      updated_at: new Date().toISOString(),
    });

    expect((await store.getTriggerState("wf-trigger-redact"))?.last_error).toBe(
      "onEnable failed: POST https://api.example.com/subscribe?api_key=[redacted:api_key] returned 401",
    );

    await store.setTriggerStatus(
      "wf-trigger-redact",
      "ERROR",
      "schedule fire failed: authorization: Bearer leaked-token-value",
    );

    expect((await store.getTriggerState("wf-trigger-redact"))?.last_error).toBe(
      "schedule fire failed: authorization: [redacted:authorization]",
    );
  });

  it("redacts a run failed outside the engine", async () => {
    const runId = await store.startRun({
      workflowId: "wf-redact-2",
      workflowName: "Redact me too",
      workflowVersion: 1,
      triggerKind: "manual",
    });
    await store.failRun(runId, "connect failed with Bearer abcdefgh12345678");

    const run = await store.getRun(runId);
    expect(run?.error).toBe("connect failed with Bearer [redacted:bearer]");
  });
});
