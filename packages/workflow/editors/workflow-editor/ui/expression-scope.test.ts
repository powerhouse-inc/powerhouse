import { describe, expect, it } from "vitest";
import {
  buildExpressionScope,
  capValue,
  upstreamStepIds,
} from "./expression-scope.js";
import type { StepModel, WorkflowModel } from "./model.js";

function step(
  id: string,
  blockType = "@powerhousedao/piece-reactor#document-get",
): StepModel {
  return {
    id,
    key: id,
    name: id,
    blockType,
    connectionId: null,
    config: {},
    retry: null,
    timeoutSeconds: null,
    idempotencyKeyExpression: null,
    position: null,
  };
}

const model: WorkflowModel = {
  name: "wf",
  status: "ENABLED",
  version: 3,
  trigger: {
    id: "t",
    blockType: "core#manual",
    config: {},
    connectionId: null,
  },
  steps: [step("a"), step("b"), step("c")],
  edges: [
    { id: "e1", from: "t", to: "a", port: "next", condition: null },
    { id: "e2", from: "a", to: "b", port: "next", condition: null },
    { id: "e3", from: "a", to: "c", port: "next", condition: null },
  ],
  variables: [
    { id: "v1", key: "apiBase", value: "https://x", description: null },
  ],
};

const authored = (blockType: string) =>
  Promise.resolve({ declared: `${blockType} type` });

describe("upstreamStepIds", () => {
  it("collects transitive ancestors only", () => {
    expect([...upstreamStepIds(model, "b")].sort()).toEqual(["a", "t"]);
    expect([...upstreamStepIds(model, "a")]).toEqual(["t"]);
  });
});

describe("capValue", () => {
  it("truncates deep objects and long arrays", () => {
    const deep = { l1: { l2: { l3: { l4: { l5: { l6: { l7: 1 } } } } } } };
    expect(JSON.stringify(capValue(deep))).toContain('"l6":"{…}"');
    const long = Array.from({ length: 40 }, (_, i) => i);
    expect((capValue(long) as unknown[]).length).toBe(25);
  });
});

describe("buildExpressionScope", () => {
  it("falls back to authored shapes without a run", async () => {
    const scope = await buildExpressionScope({
      model,
      stepId: "b",
      authoredOutput: authored,
    });
    expect(scope.value).toEqual({
      trigger: { payload: { declared: "core#manual type" } },
      steps: {
        a: {
          output: {
            declared: "@powerhousedao/piece-reactor#document-get type",
          },
        },
      },
      variables: { apiBase: "https://x" },
    });
    expect(scope.captions).toEqual({
      "trigger.payload": "declared type",
      "steps.a.output": "declared type",
      variables: "workflow variables",
    });
  });

  it("prefers journaled outputs from the latest run for matching steps", async () => {
    const scope = await buildExpressionScope({
      model,
      stepId: "b",
      now: new Date("2026-09-04T12:00:00Z"),
      latestRun: {
        startedAt: "2026-09-04T09:14:00Z",
        triggerPayload: { who: "me" },
        steps: [
          {
            stepKey: "a",
            blockType: "@powerhousedao/piece-reactor#document-get",
            status: "SUCCEEDED",
            output: { documentId: "d1" },
          },
          // Sibling branch: not upstream of b, must not appear.
          {
            stepKey: "c",
            blockType: "@powerhousedao/piece-reactor#document-get",
            status: "SUCCEEDED",
            output: { documentId: "d2" },
          },
        ],
      },
      authoredOutput: authored,
    });
    expect(scope.value.trigger).toEqual({ payload: { who: "me" } });
    expect(scope.value.steps).toEqual({ a: { output: { documentId: "d1" } } });
    expect(scope.captions["steps.a.output"]).toMatch(/^from run /);
    expect(scope.captions["trigger.payload"]).toMatch(/^from run /);
  });

  it.each([
    [
      "changed type",
      {
        blockType: "@powerhousedao/piece-reactor#document-find",
        status: "SUCCEEDED",
        output: { count: 1 },
      },
    ],
    [
      "failed",
      {
        blockType: "@powerhousedao/piece-reactor#document-get",
        status: "FAILED",
        output: { documentId: "d1" },
      },
    ],
    [
      "has no output",
      {
        blockType: "@powerhousedao/piece-reactor#document-get",
        status: "SUCCEEDED",
        output: null,
      },
    ],
  ])("ignores a journaled step that %s", async (_, journaled) => {
    const scope = await buildExpressionScope({
      model,
      stepId: "b",
      latestRun: {
        startedAt: "2026-09-04T09:14:00Z",
        triggerPayload: null,
        steps: [{ stepKey: "a", ...journaled }],
      },
      authoredOutput: authored,
    });
    expect(scope.value.steps).toEqual({
      a: {
        output: { declared: "@powerhousedao/piece-reactor#document-get type" },
      },
    });
    expect(scope.captions["steps.a.output"]).toBe("declared type");
    expect(scope.captions["trigger.payload"]).toBe("declared type");
  });
});
