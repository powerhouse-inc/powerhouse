import { CompositeBlockExecutor } from "../../src/engine/blocks.js";
import { runWorkflow } from "../../src/engine/coordinator.js";
import {
  lookupPath,
  resolveExpressions,
} from "../../src/engine/expressions.js";
import type {
  BlockExecution,
  BlockExecutor,
  WorkflowDefinition,
} from "../../src/engine/types.js";

// Fake executor: echoes resolved config; blockType "fake#fail" throws.
class FakeExecutor implements BlockExecutor {
  readonly calls: BlockExecution[] = [];

  execute(execution: BlockExecution) {
    this.calls.push(execution);
    if (execution.blockType === "fake#fail") {
      return Promise.reject(new Error("boom"));
    }
    return Promise.resolve({ output: execution.config });
  }
}

const TRIGGER = { id: "t", blockType: "core#manual", config: {} };

function edge(
  id: string,
  from: string,
  to: string,
  port = "next",
  condition?: string,
) {
  return { id, from, to, port, condition };
}

describe("expressions", () => {
  const scope = {
    trigger: { payload: { user: "ada", count: 2 } },
    steps: { fetch: { output: { body: { ok: true, items: [1, 2] } } } },
    variables: { region: "eu" },
  };

  it("resolves whole-string expressions to raw values", () => {
    expect(resolveExpressions("{{steps.fetch.output.body.ok}}", scope)).toBe(
      true,
    );
    expect(resolveExpressions("{{trigger.payload.count}}", scope)).toBe(2);
    expect(resolveExpressions("{{variables.region}}", scope)).toBe("eu");
  });

  it("interpolates embedded expressions into strings", () => {
    expect(
      resolveExpressions(
        "hi {{trigger.payload.user}} ({{variables.region}})",
        scope,
      ),
    ).toBe("hi ada (eu)");
    expect(
      resolveExpressions("items: {{steps.fetch.output.body.items}}", scope),
    ).toBe("items: [1,2]");
  });

  it("recurses through objects and arrays, missing paths yield undefined", () => {
    expect(
      resolveExpressions(
        { a: ["{{variables.region}}"], b: { c: "{{missing.path}}" } },
        scope,
      ),
    ).toEqual({ a: ["eu"], b: { c: undefined } });
    expect(lookupPath(scope, "steps.fetch.output.body.items")).toEqual([1, 2]);
  });
});

describe("runWorkflow", () => {
  it("runs a linear flow passing outputs between steps", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        {
          id: "a",
          key: "first",
          blockType: "fake#ok",
          config: { v: "{{trigger.payload.msg}}" },
        },
        {
          id: "b",
          key: "second",
          blockType: "fake#ok",
          config: { got: "{{steps.first.output.v}}" },
        },
      ],
      edges: [edge("e1", "t", "a"), edge("e2", "a", "b")],
    };

    const run = await runWorkflow({
      definition,
      executor,
      triggerPayload: { msg: "hello" },
    });

    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps.map((s) => s.status)).toEqual(["SUCCEEDED", "SUCCEEDED"]);
    expect(run.steps[1].output).toEqual({ got: "hello" });
  });

  it("routes core#branch ports and skips the untaken side", async () => {
    const executor = new CompositeBlockExecutor(new FakeExecutor());
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        {
          id: "br",
          key: "check",
          blockType: "core#branch",
          config: { condition: "{{trigger.payload.go}}" },
        },
        { id: "yes", key: "yes", blockType: "fake#ok", config: {} },
        { id: "no", key: "no", blockType: "fake#ok", config: {} },
      ],
      edges: [
        edge("e1", "t", "br"),
        edge("e2", "br", "yes", "true"),
        edge("e3", "br", "no", "false"),
      ],
    };

    const run = await runWorkflow({
      definition,
      executor,
      triggerPayload: { go: true },
    });

    expect(run.status).toBe("SUCCEEDED");
    const byKey = Object.fromEntries(run.steps.map((s) => [s.key, s.status]));
    expect(byKey).toEqual({
      check: "SUCCEEDED",
      yes: "SUCCEEDED",
      no: "SKIPPED",
    });
  });

  it("honors edge conditions", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        {
          id: "a",
          key: "a",
          blockType: "fake#ok",
          config: { n: "{{trigger.payload.n}}" },
        },
        { id: "b", key: "b", blockType: "fake#ok", config: {} },
      ],
      edges: [
        edge("e1", "t", "a"),
        edge("e2", "a", "b", "next", "{{steps.a.output.n}}"),
      ],
    };

    const taken = await runWorkflow({
      definition,
      executor,
      triggerPayload: { n: 1 },
    });
    expect(taken.steps[1].status).toBe("SUCCEEDED");

    const skipped = await runWorkflow({
      definition,
      executor,
      triggerPayload: { n: 0 },
    });
    expect(skipped.steps[1].status).toBe("SKIPPED");
  });

  it("routes a handled failure through the error port", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        { id: "a", key: "risky", blockType: "fake#fail", config: {} },
        { id: "b", key: "ok-path", blockType: "fake#ok", config: {} },
        { id: "c", key: "recover", blockType: "fake#ok", config: {} },
      ],
      edges: [
        edge("e1", "t", "a"),
        edge("e2", "a", "b"),
        edge("e3", "a", "c", "error"),
      ],
    };

    const run = await runWorkflow({ definition, executor });

    expect(run.status).toBe("SUCCEEDED");
    const byKey = Object.fromEntries(run.steps.map((s) => [s.key, s.status]));
    expect(byKey).toEqual({
      risky: "FAILED",
      "ok-path": "SKIPPED",
      recover: "SUCCEEDED",
    });
    expect(run.steps[0].error).toBe("boom");
  });

  it("fails the run on an unhandled step failure", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        { id: "a", key: "risky", blockType: "fake#fail", config: {} },
        { id: "b", key: "after", blockType: "fake#ok", config: {} },
      ],
      edges: [edge("e1", "t", "a"), edge("e2", "a", "b")],
    };

    const run = await runWorkflow({ definition, executor });

    expect(run.status).toBe("FAILED");
    expect(run.error).toContain('Step "risky" failed: boom');
    expect(run.steps[1].status).toBe("SKIPPED");
  });

  it("treats no-inbound steps as entries only without a trigger", async () => {
    const executor = new FakeExecutor();
    const noTrigger: WorkflowDefinition = {
      steps: [{ id: "a", key: "solo", blockType: "fake#ok", config: {} }],
      edges: [],
    };
    const run = await runWorkflow({ definition: noTrigger, executor });
    expect(run.steps[0].status).toBe("SUCCEEDED");

    const withTrigger: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [{ id: "a", key: "orphan", blockType: "fake#ok", config: {} }],
      edges: [],
    };
    const orphanRun = await runWorkflow({ definition: withTrigger, executor });
    expect(orphanRun.steps[0].status).toBe("SKIPPED");
  });
});

describe("parseBlockType", () => {
  it("resolves versions inline or from the registry", async () => {
    const { parseBlockType } = await import("../../src/engine/blocks.js");
    expect(
      parseBlockType("@activepieces/piece-http@0.11.19#send_request"),
    ).toEqual({
      packageName: "@activepieces/piece-http",
      version: "0.11.19",
      actionName: "send_request",
    });
    expect(
      parseBlockType("@activepieces/piece-http#send_request", {
        "@activepieces/piece-http": "0.11.19",
      }),
    ).toEqual({
      packageName: "@activepieces/piece-http",
      version: "0.11.19",
      actionName: "send_request",
    });
    expect(
      parseBlockType("@activepieces/piece-http#send_request"),
    ).toBeUndefined();
    expect(parseBlockType("no-action")).toBeUndefined();
  });
});

describe("CompositeBlockExecutor handlers", () => {
  it("routes registered block types to their handler first", async () => {
    const handled: string[] = [];
    const handler = {
      execute: (execution: BlockExecution) => {
        handled.push(execution.blockType);
        return Promise.resolve({ output: "handled" });
      },
    };
    const executor = new CompositeBlockExecutor(new FakeExecutor(), {
      "core#document-create": handler,
    });

    const result = await executor.execute({
      blockType: "core#document-create",
      config: {},
      step: {
        id: "s",
        key: "s",
        blockType: "core#document-create",
        config: {},
      },
    });
    expect(result.output).toBe("handled");
    expect(handled).toEqual(["core#document-create"]);

    const branch = await executor.execute({
      blockType: "core#branch",
      config: { condition: true },
      step: { id: "b", key: "b", blockType: "core#branch", config: {} },
    });
    expect(branch.port).toBe("true");
  });
});
