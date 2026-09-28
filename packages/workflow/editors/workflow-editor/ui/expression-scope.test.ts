import { describe, expect, it } from "vitest";
import {
  buildExpressionScope,
  capValue,
  childPath,
  upstreamStepIds,
} from "./expression-scope.js";
import type { BlockRef } from "./blocks.js";
import type { StepModel, WorkflowModel } from "./model.js";

function step(id: string): StepModel {
  return {
    id,
    key: id,
    name: id,
    pieceName: "@powerhousedao/piece-reactor",
    pieceVersion: "1.0.0",
    actionName: "document-get",
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
    pieceName: "@powerhousedao/piece-core",
    pieceVersion: "1.0.0",
    triggerName: "manual",
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
    {
      id: "v1",
      key: "apiBase",
      value: "https://x",
      description: null,
      type: "TEXT",
    },
  ],
};

const authored = (block: BlockRef) =>
  Promise.resolve({ declared: `${block.pieceName} ${block.name} type` });

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
      trigger: {
        payload: { declared: "@powerhousedao/piece-core manual type" },
      },
      steps: {
        a: {
          output: {
            declared: "@powerhousedao/piece-reactor document-get type",
          },
        },
      },
      variables: { apiBase: "https://x" },
    });
    expect(scope.captions).toEqual({
      "trigger.payload": "declared type",
      "steps.a.output": "declared type",
      variables: "workflow variables",
      "variables.apiBase": "text",
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
            pieceName: "@powerhousedao/piece-reactor",
            blockName: "document-get",
            status: "SUCCEEDED",
            output: { documentId: "d1" },
          },
          // Sibling branch: not upstream of b, must not appear.
          {
            stepKey: "c",
            pieceName: "@powerhousedao/piece-reactor",
            blockName: "document-get",
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
        pieceName: "@powerhousedao/piece-reactor",
        blockName: "document-find",
        status: "SUCCEEDED",
        output: { count: 1 },
      },
    ],
    [
      "failed",
      {
        pieceName: "@powerhousedao/piece-reactor",
        blockName: "document-get",
        status: "FAILED",
        output: { documentId: "d1" },
      },
    ],
    [
      "has no output",
      {
        pieceName: "@powerhousedao/piece-reactor",
        blockName: "document-get",
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
        output: { declared: "@powerhousedao/piece-reactor document-get type" },
      },
    });
    expect(scope.captions["steps.a.output"]).toBe("declared type");
    expect(scope.captions["trigger.payload"]).toBe("declared type");
  });

  it("labels each variable with its type and hides a secret's reference", async () => {
    const scope = await buildExpressionScope({
      model: {
        ...model,
        variables: [
          {
            id: "v1",
            key: "limit",
            value: 5,
            description: null,
            type: "NUMBER",
          },
          {
            id: "v2",
            key: "token",
            value: "secret://v1:abc",
            description: null,
            type: "SECRET",
          },
        ],
      },
      stepId: "b",
      authoredOutput: authored,
    });
    expect(scope.value.variables).toEqual({ limit: 5, token: "secret" });
    expect(scope.captions["variables.limit"]).toBe("number");
    expect(scope.captions["variables.token"]).toBe("secret");
  });
});

describe("buildExpressionScope with test samples", () => {
  const tested: WorkflowModel = {
    ...model,
    trigger: {
      ...model.trigger!,
      lastTest: { runId: "rt", testedAt: "2026-09-04T08:00:00Z" },
    },
    steps: [
      {
        ...step("a"),
        lastTest: { runId: "ra", testedAt: "2026-09-04T10:05:00Z" },
      },
      step("b"),
      step("c"),
    ],
  };

  it("prefers a block's last test over the latest run and the declared shape", async () => {
    const asked: string[] = [];
    const scope = await buildExpressionScope({
      model: tested,
      stepId: "b",
      now: new Date("2026-09-04T12:00:00Z"),
      latestRun: {
        startedAt: "2026-09-04T09:14:00Z",
        triggerPayload: { who: "run" },
        steps: [
          {
            stepKey: "a",
            pieceName: "@powerhousedao/piece-reactor",
            blockName: "document-get",
            status: "SUCCEEDED",
            output: { from: "run" },
          },
        ],
      },
      authoredOutput: authored,
      testOutput: (id) => {
        asked.push(id);
        return Promise.resolve({
          value: { from: `test ${id}`, "content.type": "json" },
          testedAt: "2026-09-04T10:05:00Z",
        });
      },
    });
    expect(asked.sort()).toEqual(["a", "t"]);
    expect(scope.value.steps).toEqual({
      a: { output: { from: "test a", "content.type": "json" } },
    });
    expect(scope.captions["steps.a.output"]).toMatch(/^from test \d\d:\d\d/);
    expect(scope.captions["trigger.payload"]).toMatch(/^from test /);
  });

  it("falls back when the test has no sample", async () => {
    const scope = await buildExpressionScope({
      model: tested,
      stepId: "b",
      authoredOutput: authored,
      testOutput: () => Promise.resolve(undefined),
    });
    expect(scope.captions["steps.a.output"]).toBe("declared type");
  });
});

describe("childPath", () => {
  it("dots identifiers, brackets anything else and indexes arrays", () => {
    expect(childPath("steps.a.output", "body", false)).toBe(
      "steps.a.output.body",
    );
    expect(childPath("steps.a.output", "content.type", false)).toBe(
      'steps.a.output["content.type"]',
    );
    expect(childPath("steps.a.output", "x-id", false)).toBe(
      'steps.a.output["x-id"]',
    );
    expect(childPath("steps.a.output.items", "0", true)).toBe(
      "steps.a.output.items[0]",
    );
    expect(childPath("", "steps", false)).toBe("steps");
  });
});
