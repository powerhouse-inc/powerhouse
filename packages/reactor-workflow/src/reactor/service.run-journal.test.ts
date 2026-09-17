// The journal is best-effort: fire() owes its caller the run's own outcome,
// whatever the store manages to record about it.
import type { WorkflowRunResult } from "../pieces/index.js";
import { describe, expect, it } from "vitest";
import type { WorkflowRuntimeService } from "./service.js";
import { testRuntime } from "../../test/helpers/runtime.js";

const WORKFLOW_ID = "wf-journal";

// c runs before b: b's only inbound edge comes from c, so the first pass over
// the definition defers it.
function workflowDocument() {
  return {
    header: { documentType: "powerhouse/workflow" },
    state: {
      global: {
        name: "Journalled",
        status: "ENABLED",
        version: 1,
        trigger: { id: "t1", blockType: "core#manual", config: {} },
        steps: [
          { id: "b", key: "second", blockType: "fake#ok", config: {} },
          { id: "c", key: "first", blockType: "fake#ok", config: {} },
        ],
        edges: [
          { id: "e1", from: "t1", to: "c", port: "next" },
          { id: "e2", from: "c", to: "b", port: "next" },
        ],
        variables: [],
      },
    },
  };
}

interface FinishCall {
  result: WorkflowRunResult;
  executionOrder?: ReadonlyMap<string, number>;
}

function serviceWithStore(store: unknown): WorkflowRuntimeService {
  const service = testRuntime({
    reactorClient: { get: () => Promise.resolve(workflowDocument()) },
  } as never);
  const internals = service as unknown as Record<string, unknown>;
  internals.executor = { execute: () => Promise.resolve({ output: {} }) };
  internals.storePromise = Promise.resolve(store);
  return service;
}

function recordingStore(finishRun: (call: FinishCall) => Promise<void>) {
  const failed: string[] = [];
  return {
    failed,
    startRun: () => Promise.resolve("run-1"),
    recordStep: () => Promise.resolve(),
    finishRun: (
      _runId: string,
      result: WorkflowRunResult,
      executionOrder?: ReadonlyMap<string, number>,
    ) => finishRun({ result, executionOrder }),
    failRun: (_runId: string, error: string) => {
      failed.push(error);
      return Promise.resolve();
    },
  };
}

// A manual fire is the caller-facing path, so it carries one.
const CTX = { headers: {}, db: {}, user: { address: "0xabc" } } as never;

describe("fire() and the run journal", () => {
  it("keeps a finished run's outcome when finishRun throws", async () => {
    const store = recordingStore(() =>
      Promise.reject(new Error("journal is gone")),
    );
    const service = serviceWithStore(store);

    const result = await service.fire(
      WORKFLOW_ID,
      { v: 1 },
      "manual",
      undefined,
      CTX,
    );

    // The steps already ran: reporting them is what failed, not the run.
    expect(result.status).toBe("SUCCEEDED");
    expect(result.runId).toBe("run-1");
    expect(store.failed).toEqual([]);
  });

  it("hands finishRun the order the steps ran in", async () => {
    const calls: FinishCall[] = [];
    const store = recordingStore((call) => {
      calls.push(call);
      return Promise.resolve();
    });

    await serviceWithStore(store).fire(
      WORKFLOW_ID,
      undefined,
      "manual",
      undefined,
      CTX,
    );

    // runWorkflow returns definition order; only the callback knows better.
    expect(calls[0].result.steps.map((step) => step.stepId)).toEqual([
      "b",
      "c",
    ]);
    expect([...(calls[0].executionOrder ?? [])]).toEqual([
      ["c", 0],
      ["b", 1],
    ]);
  });
});
