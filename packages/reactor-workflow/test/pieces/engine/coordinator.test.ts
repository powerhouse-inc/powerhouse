import {
  ActivepiecesBlockExecutor,
  CompositeBlockExecutor,
} from "../../../src/pieces/engine/blocks.js";
import { runWorkflow } from "../../../src/pieces/engine/coordinator.js";
import {
  lookupPath,
  resolveExpressions,
} from "../../../src/pieces/engine/expressions.js";
import {
  blockKey,
  type BlockRef,
} from "@powerhousedao/pieces-framework/block-type";
import {
  stepBlock,
  type BlockExecution,
  type BlockExecutor,
  type WorkflowDefinition,
} from "../../../src/pieces/engine/types.js";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
} from "../../../src/pieces/index.js";

// Fake executor: echoes resolved config; the action "fail" throws.
class FakeExecutor implements BlockExecutor {
  readonly calls: BlockExecution[] = [];

  execute(execution: BlockExecution) {
    this.calls.push(execution);
    if (execution.block.name === "fail") {
      return Promise.reject(new Error("boom"));
    }
    return Promise.resolve({ output: execution.config });
  }
}

const TRIGGER = {
  id: "t",
  pieceName: "@powerhousedao/piece-core",
  pieceVersion: CORE_PIECE_VERSION,
  triggerName: "manual",
  config: {},
};

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

  it("recurses through objects and arrays, and fails on a missing path", () => {
    expect(
      resolveExpressions(
        { a: ["{{variables.region}}"], b: { c: "{{missing.path?}}" } },
        scope,
      ),
    ).toEqual({ a: ["eu"], b: { c: null } });
    expect(() => resolveExpressions("{{missing.path}}", scope)).toThrow(
      "Unresolved reference {{missing.path}}",
    );
    expect(
      lookupPath(scope, ["steps", "fetch", "output", "body", "items"]),
    ).toEqual([1, 2]);
  });
});

function expressions(...props: string[]) {
  return props.map((prop) => ({ prop, mode: "EXPRESSION" }));
}

describe("runWorkflow", () => {
  it("runs a linear flow passing outputs between steps", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        {
          id: "a",
          key: "first",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: { v: "{{trigger.payload.msg}}" },
          propertySettings: expressions("v"),
        },
        {
          id: "b",
          key: "second",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: { got: "{{steps.first.output.v}}" },
          propertySettings: expressions("got"),
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
        {
          id: "a",
          key: "ok",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
        {
          id: "b",
          key: "fails",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "fail",
          config: {},
        },
        {
          id: "c",
          key: "after",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
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
        {
          id: "a",
          key: "first",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
        {
          id: "b",
          key: "taken",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
        {
          id: "c",
          key: "untaken",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
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
        {
          id: "a",
          key: "first",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
        {
          id: "b",
          key: "second",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "fail",
          config: {},
        },
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
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: { v: "{{trigger.payload.msg}}" },
          propertySettings: expressions("v"),
        },
        {
          id: "b",
          key: "second",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "fail",
          config: {},
        },
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
    definition.steps[1].actionName = "ok";
    definition.steps[1].config = { got: "{{steps.first.output.v}}" };
    definition.steps[1].propertySettings = expressions("got");
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

  it("routes the core branch's ports and skips the untaken side", async () => {
    // The core piece runs in process, through the piece executor.
    const executor = new CompositeBlockExecutor(new FakeExecutor(), {
      [blockKey({
        pieceName: CORE_PIECE_NAME,
        kind: "action",
        name: "branch",
      })]: new ActivepiecesBlockExecutor({ cacheDir: "/tmp/na" }),
    });
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        {
          id: "br",
          key: "check",
          pieceName: "@powerhousedao/piece-core",
          pieceVersion: CORE_PIECE_VERSION,
          actionName: "branch",
          config: {
            operator: "BOOLEAN_IS_TRUE",
            left: "{{trigger.payload.go}}",
          },
          propertySettings: expressions("left"),
        },
        {
          id: "yes",
          key: "yes",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
        {
          id: "no",
          key: "no",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
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
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: { n: "{{trigger.payload.n}}" },
          propertySettings: expressions("n"),
        },
        {
          id: "b",
          key: "b",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
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
        {
          id: "a",
          key: "risky",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "fail",
          config: {},
        },
        {
          id: "b",
          key: "ok-path",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
        {
          id: "c",
          key: "recover",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
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
        {
          id: "a",
          key: "risky",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "fail",
          config: {},
        },
        {
          id: "c",
          key: "recover",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          // What a document-dispatch on the failure branch would write.
          config: { note: "could not reach it: {{steps.risky.error}}" },
          propertySettings: expressions("note"),
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
        {
          id: "a",
          key: "fine",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: { v: 1 },
        },
        {
          id: "b",
          key: "after",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {
            was: "{{steps.fine.error?}}",
            got: "{{steps.fine.output.v}}",
          },
          propertySettings: expressions("was", "got"),
        },
      ],
      edges: [edge("e1", "t", "a"), edge("e2", "a", "b")],
    };

    const run = await runWorkflow({ definition, executor });

    expect(run.steps[1].output).toEqual({ was: null, got: 1 });
  });

  it("runs every successor on a port, not just the first", async () => {
    const executor = new FakeExecutor();
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        {
          id: "a",
          key: "risky",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "fail",
          config: {},
        },
        {
          id: "b",
          key: "notify",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
        {
          id: "c",
          key: "cleanup",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
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
        {
          id: "a",
          key: "risky",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "fail",
          config: {},
        },
        {
          id: "b",
          key: "after",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
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
      steps: [
        {
          id: "a",
          key: "solo",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
      ],
      edges: [],
    };
    const run = await runWorkflow({ definition: noTrigger, executor });
    expect(run.steps[0].status).toBe("SUCCEEDED");

    const withTrigger: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        {
          id: "a",
          key: "orphan",
          pieceName: "fake",
          pieceVersion: "1.0.0",
          actionName: "ok",
          config: {},
        },
      ],
      edges: [],
    };
    const orphanRun = await runWorkflow({ definition: withTrigger, executor });
    expect(orphanRun.steps[0].status).toBe("SKIPPED");
  });
});

const PIECE_X = {
  pieceName: "@acme/piece-x",
  pieceVersion: "1.2.0",
  actionName: "do_thing",
};

function execution(step: {
  pieceName: string;
  pieceVersion: string;
  actionName: string;
}): BlockExecution {
  const def = { id: "s1", key: "s1", ...step, config: {} };
  return { block: stepBlock(def), config: {}, step: def };
}

describe("pinnedResolution", () => {
  it("runs a block at its pin", async () => {
    const { pinnedResolution } =
      await import("../../../src/pieces/engine/blocks.js");
    expect(
      pinnedResolution({
        pieceName: "@activepieces/piece-http",
        pieceVersion: "0.11.19",
        kind: "action",
        name: "send_request",
      }),
    ).toMatchObject({
      match: "exact",
      resolved: { version: "0.11.19" },
      requested: { pieceName: "@activepieces/piece-http", kind: "action" },
    });
  });

  it("refuses an inexact version", async () => {
    const { pinnedResolution } =
      await import("../../../src/pieces/engine/blocks.js");
    const block = {
      pieceName: "@acme/piece-x",
      pieceVersion: "latest",
      kind: "action" as const,
      name: "go",
    };
    expect(pinnedResolution(block)).toMatchObject({
      match: "missing",
      note: '@acme/piece-x action "go" pins "latest", which is not an exact semver version',
    });
  });
});

describe("ActivepiecesBlockExecutor resolution", () => {
  it("runs the version and source the host's policy chose", async () => {
    const { ActivepiecesBlockExecutor } =
      await import("../../../src/pieces/engine/blocks.js");
    const asked: BlockRef[] = [];
    const resolved: unknown[] = [];
    const executor = new ActivepiecesBlockExecutor({
      cacheDir: "/tmp/na",
      resolveBlock: (block) => {
        asked.push(block);
        return Promise.resolve({
          requested: block,
          resolved: { version: "1.2.3", source: "registry" },
          match: "compatible",
          note: "Pinned 1.2.0 is not available; runs 1.2.3 from registry",
        });
      },
      resolver: {
        resolve: (target) => {
          resolved.push(target);
          return Promise.resolve({
            ...target,
            bundleDir: "/bundle",
            local: false,
          });
        },
      },
      worker: {
        runAction: () => Promise.resolve({ output: { ok: true } }),
      } as never,
    });

    const result = await executor.execute(execution(PIECE_X));

    expect(result.output).toEqual({ ok: true });
    expect(result.resolution?.match).toBe("compatible");
    expect(asked).toEqual([
      {
        pieceName: "@acme/piece-x",
        pieceVersion: "1.2.0",
        kind: "action",
        name: "do_thing",
      },
    ]);
    expect(resolved).toEqual([
      { name: "@acme/piece-x", version: "1.2.3", source: "registry" },
    ]);
    executor.dispose();
  });

  it("fails a missing resolution with its note", async () => {
    const { ActivepiecesBlockExecutor, UnknownBlockError } =
      await import("../../../src/pieces/engine/blocks.js");
    const executor = new ActivepiecesBlockExecutor({ cacheDir: "/tmp/na" });

    const failure = executor.execute(
      execution({ ...PIECE_X, pieceVersion: "^1.2.0" }),
    );
    await expect(failure).rejects.toBeInstanceOf(UnknownBlockError);
    await expect(failure).rejects.toThrow("not an exact semver version");
    executor.dispose();
  });

  it("refuses to execute a trigger as a step", async () => {
    const { ActivepiecesBlockExecutor, TriggerBlockAsStepError } =
      await import("../../../src/pieces/engine/blocks.js");
    const executor = new ActivepiecesBlockExecutor({ cacheDir: "/tmp/na" });
    const run = execution({
      pieceName: "@activepieces/piece-rss",
      pieceVersion: "0.5.0",
      actionName: "new_item",
    });
    await expect(
      executor.execute({ ...run, block: { ...run.block, kind: "trigger" } }),
    ).rejects.toBeInstanceOf(TriggerBlockAsStepError);
    executor.dispose();
  });
});

describe("CompositeBlockExecutor handlers", () => {
  it("routes a handler's block, by block key, to it first", async () => {
    const handled: string[] = [];
    const handler = {
      execute: (execution: BlockExecution) => {
        handled.push(execution.block.name);
        return Promise.resolve({ output: "handled" });
      },
    };
    const custom = {
      pieceName: "host",
      pieceVersion: "1.0.0",
      actionName: "custom-block",
    };
    const executor = new CompositeBlockExecutor(new FakeExecutor(), {
      [blockKey({
        pieceName: "host",
        kind: "action" as const,
        name: "custom-block",
      })]: handler,
    });

    const result = await executor.execute(execution(custom));
    expect(result.output).toBe("handled");
    expect(handled).toEqual(["custom-block"]);

    const other = await executor.execute(
      execution({ ...custom, actionName: "other" }),
    );
    expect(other.output).toEqual({});
  });
});
