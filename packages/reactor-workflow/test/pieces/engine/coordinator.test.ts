import { CompositeBlockExecutor } from "../../../src/pieces/engine/blocks.js";
import { runWorkflow } from "../../../src/pieces/engine/coordinator.js";
import {
  lookupPath,
  resolveExpressions,
} from "../../../src/pieces/engine/expressions.js";
import type {
  BlockExecution,
  BlockExecutor,
  WorkflowDefinition,
} from "../../../src/pieces/engine/types.js";

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

  it("times the steps that ran, and only those", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        { id: "a", key: "ok", blockType: "fake#ok", config: {} },
        { id: "b", key: "fails", blockType: "fake#fail", config: {} },
        { id: "c", key: "after", blockType: "fake#ok", config: {} },
      ],
      edges: [edge("e1", "t", "a"), edge("e2", "a", "b"), edge("e3", "b", "c")],
    };

    const run = await runWorkflow({ definition, executor });

    const [ok, fails, after] = run.steps;
    for (const step of [ok, fails]) {
      expect(Date.parse(step.startedAt!)).toBeLessThanOrEqual(
        Date.parse(step.endedAt!),
      );
    }
    expect(Date.parse(ok.endedAt!)).toBeLessThanOrEqual(
      Date.parse(fails.startedAt!),
    );
    expect(after.status).toBe("SKIPPED");
    expect(after.startedAt).toBeUndefined();
  });

  it("journals each terminal step as it lands, skips only in the final sweep", async () => {
    const executor = new FakeExecutor();
    const journaled: Array<[string, string, number]> = [];
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        { id: "a", key: "first", blockType: "fake#ok", config: {} },
        { id: "b", key: "taken", blockType: "fake#ok", config: {} },
        { id: "c", key: "untaken", blockType: "fake#ok", config: {} },
      ],
      edges: [
        edge("e1", "t", "a"),
        edge("e2", "a", "b"),
        edge("e3", "a", "c", "other"),
      ],
    };

    const run = await runWorkflow({
      definition,
      executor,
      onStep: (record, ordinal) => {
        journaled.push([record.key, record.status, ordinal]);
      },
    });

    expect(run.steps.map((s) => s.status)).toEqual([
      "SUCCEEDED",
      "SUCCEEDED",
      "SKIPPED",
    ]);
    // Ordinals are execution order, and the skipped step is never journaled.
    expect(journaled).toEqual([
      ["first", "SUCCEEDED", 0],
      ["taken", "SUCCEEDED", 1],
    ]);
  });

  it("journals a failed step, and an onStep that throws never fails the run", async () => {
    const executor = new FakeExecutor();
    const journaled: string[] = [];
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        { id: "a", key: "first", blockType: "fake#ok", config: {} },
        { id: "b", key: "second", blockType: "fake#fail", config: {} },
      ],
      edges: [edge("e1", "t", "a"), edge("e2", "a", "b")],
    };

    const run = await runWorkflow({
      definition,
      executor,
      onStep: (record) => {
        journaled.push(`${record.key}:${record.status}`);
        return Promise.reject(new Error("journal is down"));
      },
    });

    // A dead journal costs durability, never the run's own outcome.
    expect(run.status).toBe("FAILED");
    expect(run.error).toContain('Step "second" failed: boom');
    expect(journaled).toEqual(["first:SUCCEEDED", "second:FAILED"]);
  });

  it("replays completedSteps without executing them, resuming at the failure", async () => {
    const failing = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        {
          id: "a",
          key: "first",
          blockType: "fake#ok",
          config: { v: "{{trigger.payload.msg}}" },
        },
        { id: "b", key: "second", blockType: "fake#fail", config: {} },
      ],
      edges: [edge("e1", "t", "a"), edge("e2", "a", "b")],
    };

    const failed = await runWorkflow({
      definition,
      executor: failing,
      triggerPayload: { msg: "hello" },
    });
    expect(failed.status).toBe("FAILED");
    expect(failed.steps.map((s) => s.status)).toEqual(["SUCCEEDED", "FAILED"]);

    // "Fix" the workflow and resume with step a's journaled output.
    definition.steps[1].blockType = "fake#ok";
    definition.steps[1].config = { got: "{{steps.first.output.v}}" };
    const executor = new FakeExecutor();
    const resumed = await runWorkflow({
      definition,
      executor,
      triggerPayload: { msg: "hello" },
      completedSteps: new Map([
        ["a", { output: failed.steps[0].output, port: failed.steps[0].port }],
      ]),
    });

    expect(resumed.status).toBe("SUCCEEDED");
    expect(resumed.steps.map((s) => s.status)).toEqual([
      "REPLAYED",
      "SUCCEEDED",
    ]);
    // Step a never re-executed; its journaled output still fed step b.
    expect(executor.calls.map((call) => call.step.id)).toEqual(["b"]);
    expect(resumed.steps[1].output).toEqual({ got: "hello" });
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

  it("hands the error branch the reason the step failed", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        { id: "a", key: "risky", blockType: "fake#fail", config: {} },
        {
          id: "c",
          key: "recover",
          blockType: "fake#ok",
          // What a document-dispatch on the failure branch would write.
          config: { note: "could not reach it: {{steps.risky.error}}" },
        },
      ],
      edges: [edge("e1", "t", "a"), edge("e2", "a", "c", "error")],
    };

    const run = await runWorkflow({ definition, executor });

    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps[1].output).toEqual({
      note: "could not reach it: boom",
    });
  });

  it("leaves a succeeding step's scope entry free of an error", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        { id: "a", key: "fine", blockType: "fake#ok", config: { v: 1 } },
        {
          id: "b",
          key: "after",
          blockType: "fake#ok",
          config: {
            was: "{{steps.fine.error}}",
            got: "{{steps.fine.output.v}}",
          },
        },
      ],
      edges: [edge("e1", "t", "a"), edge("e2", "a", "b")],
    };

    const run = await runWorkflow({ definition, executor });

    expect(run.steps[1].output).toEqual({ was: undefined, got: 1 });
  });

  it("runs every successor on a port, not just the first", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        { id: "a", key: "risky", blockType: "fake#fail", config: {} },
        { id: "b", key: "notify", blockType: "fake#ok", config: {} },
        { id: "c", key: "cleanup", blockType: "fake#ok", config: {} },
      ],
      edges: [
        edge("e1", "t", "a"),
        edge("e2", "a", "b", "error"),
        edge("e3", "a", "c", "error"),
      ],
    };

    const run = await runWorkflow({ definition, executor });

    expect(run.status).toBe("SUCCEEDED");
    expect(Object.fromEntries(run.steps.map((s) => [s.key, s.status]))).toEqual(
      {
        risky: "FAILED",
        notify: "SUCCEEDED",
        cleanup: "SUCCEEDED",
      },
    );
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
    const { parseBlockType } =
      await import("../../../src/pieces/engine/blocks.js");
    expect(
      parseBlockType("@activepieces/piece-http@0.11.19#send_request"),
    ).toEqual({
      packageName: "@activepieces/piece-http",
      version: "0.11.19",
      kind: "action",
      name: "send_request",
    });
    expect(
      parseBlockType("@activepieces/piece-http#send_request", {
        "@activepieces/piece-http": "0.11.19",
      }),
    ).toEqual({
      packageName: "@activepieces/piece-http",
      version: "0.11.19",
      kind: "action",
      name: "send_request",
    });
    expect(
      parseBlockType("@activepieces/piece-http#send_request"),
    ).toBeUndefined();
    expect(parseBlockType("no-action")).toBeUndefined();
  });

  it("classifies trigger block types", async () => {
    const { parseBlockType } =
      await import("../../../src/pieces/engine/blocks.js");
    expect(
      parseBlockType("@activepieces/piece-rss@0.5.0#trigger:new_item"),
    ).toEqual({
      packageName: "@activepieces/piece-rss",
      version: "0.5.0",
      kind: "trigger",
      name: "new_item",
    });
    expect(
      parseBlockType("@activepieces/piece-rss#trigger:new_item", {
        "@activepieces/piece-rss": "0.5.0",
      }),
    ).toEqual({
      packageName: "@activepieces/piece-rss",
      version: "0.5.0",
      kind: "trigger",
      name: "new_item",
    });
    expect(
      parseBlockType("@activepieces/piece-rss@0.5.0#trigger:"),
    ).toBeUndefined();
  });

  it("keeps the halves of a block type no version resolves", async () => {
    const { blockTypeParts } =
      await import("../../../src/pieces/engine/blocks.js");
    // What a caller with another source of versions needs: which piece, which
    // block, and the fact that the block type itself named no version.
    expect(blockTypeParts("@activepieces/piece-rss#trigger:new_item")).toEqual({
      packageName: "@activepieces/piece-rss",
      kind: "trigger",
      name: "new_item",
    });
    expect(
      blockTypeParts("@activepieces/piece-rss@0.5.0#trigger:new_item"),
    ).toEqual({
      packageName: "@activepieces/piece-rss",
      version: "0.5.0",
      kind: "trigger",
      name: "new_item",
    });
    expect(blockTypeParts("core#manual")).toEqual({
      packageName: "core",
      kind: "action",
      name: "manual",
    });
    expect(blockTypeParts("no-action")).toBeUndefined();
    expect(blockTypeParts("@acme/piece-x#trigger:")).toBeUndefined();
  });

  it("asks the host for a block type its registry cannot resolve", async () => {
    const { ActivepiecesBlockExecutor } =
      await import("../../../src/pieces/engine/blocks.js");
    const asked: string[] = [];
    const resolved: { name: string; version: string }[] = [];
    const executor = new ActivepiecesBlockExecutor({
      cacheDir: "/tmp/na",
      // What this host installed: nothing by this name.
      packages: {},
      resolveBlockType: (blockType) => {
        asked.push(blockType);
        return Promise.resolve({
          packageName: "@acme/piece-x",
          version: "1.2.3",
          kind: "action" as const,
          name: "do_thing",
        });
      },
      resolver: {
        resolve: (name: string, version: string) => {
          resolved.push({ name, version });
          return Promise.resolve({
            name,
            version,
            bundleDir: "/bundle",
            local: false,
          });
        },
      },
      worker: {
        runAction: () => Promise.resolve({ output: { ok: true } }),
      } as never,
    });
    const blockType = "@acme/piece-x#do_thing";

    const result = await executor.execute({
      blockType,
      config: {},
      step: { id: "s1", key: "s1", blockType, config: {} },
    });

    expect(result.output).toEqual({ ok: true });
    expect(asked).toEqual([blockType]);
    // The host's version is the one the bundle is fetched at.
    expect(resolved).toEqual([{ name: "@acme/piece-x", version: "1.2.3" }]);
    executor.dispose();
  });

  it("still refuses a block type the host cannot resolve either", async () => {
    const { ActivepiecesBlockExecutor, UnknownBlockTypeError } =
      await import("../../../src/pieces/engine/blocks.js");
    const executor = new ActivepiecesBlockExecutor({
      cacheDir: "/tmp/na",
      packages: {},
      resolveBlockType: () => Promise.resolve(undefined),
    });
    const blockType = "@acme/piece-x#do_thing";

    await expect(
      executor.execute({
        blockType,
        config: {},
        step: { id: "s1", key: "s1", blockType, config: {} },
      }),
    ).rejects.toBeInstanceOf(UnknownBlockTypeError);
    executor.dispose();
  });

  it("refuses to execute a trigger block type as a step", async () => {
    const { ActivepiecesBlockExecutor, TriggerBlockAsStepError } =
      await import("../../../src/pieces/engine/blocks.js");
    const executor = new ActivepiecesBlockExecutor({ cacheDir: "/tmp/na" });
    const blockType = "@activepieces/piece-rss@0.5.0#trigger:new_item";
    await expect(
      executor.execute({
        blockType,
        config: {},
        step: { id: "s1", key: "s1", blockType, config: {} },
      }),
    ).rejects.toBeInstanceOf(TriggerBlockAsStepError);
    executor.dispose();
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
      "host#custom-block": handler,
    });

    const result = await executor.execute({
      blockType: "host#custom-block",
      config: {},
      step: {
        id: "s",
        key: "s",
        blockType: "host#custom-block",
        config: {},
      },
    });
    expect(result.output).toBe("handled");
    expect(handled).toEqual(["host#custom-block"]);

    const branch = await executor.execute({
      blockType: "core#branch",
      config: { condition: true },
      step: { id: "b", key: "b", blockType: "core#branch", config: {} },
    });
    expect(branch.port).toBe("true");
  });
});
