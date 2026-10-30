import { blockKey } from "@powerhousedao/pieces-framework/block-type";
import { knownPorts } from "@powerhousedao/pieces-framework/workflow";
import {
  ActivepiecesBlockExecutor,
  CompositeBlockExecutor,
} from "../../../src/pieces/engine/blocks.js";
import {
  deadPortWarnings,
  runWorkflow,
  type ReplayedStep,
} from "../../../src/pieces/engine/coordinator.js";
import type {
  BlockExecution,
  BlockExecutor,
  StepExecutionRecord,
  WorkflowDefinition,
  WorkflowStepDef,
} from "../../../src/pieces/engine/types.js";
import {
  CORE_PIECE_NAME,
  CORE_PIECE_VERSION,
} from "../../../src/pieces/index.js";

// Echoes its config; "fail" throws, "pause" suspends, "secret" answers with
// its connection's credential.
class FakeExecutor implements BlockExecutor {
  readonly calls: BlockExecution[] = [];

  execute(execution: BlockExecution) {
    this.calls.push(execution);
    if (execution.block.name === "fail") {
      return Promise.reject(new Error("boom"));
    }
    if (execution.block.name === "secret") {
      return Promise.resolve({
        output: { value: "s3cr3t-token" },
        redactValues: ["s3cr3t-token"],
      });
    }
    if (execution.block.name === "pause") {
      return Promise.resolve({
        output: null,
        paused: { waitpointId: "wp-1" },
      });
    }
    return Promise.resolve({ output: execution.config });
  }
}

const core = (name: string) =>
  blockKey({ pieceName: CORE_PIECE_NAME, kind: "action", name });

// Core blocks run in process; everything else is fake.
function executorWith(fake = new FakeExecutor()) {
  const inProcess = new ActivepiecesBlockExecutor({ cacheDir: "/tmp/na" });
  return {
    fake,
    executor: new CompositeBlockExecutor(fake, {
      [core("router")]: inProcess,
      [core("loop")]: inProcess,
      [core("branch")]: inProcess,
      [core("delay")]: inProcess,
    }),
  };
}

const TRIGGER = {
  id: "t",
  pieceName: CORE_PIECE_NAME,
  pieceVersion: CORE_PIECE_VERSION,
  triggerName: "manual",
  config: {},
};

function edge(id: string, from: string, to: string, port = "next") {
  return { id, from, to, port };
}

function step(
  id: string,
  config: unknown = {},
  actionName = "ok",
): WorkflowStepDef {
  return {
    id,
    key: id,
    pieceName: "fake",
    pieceVersion: "1.0.0",
    actionName,
    config,
  };
}

function coreStep(id: string, actionName: string, config: unknown) {
  return {
    ...step(id, config, actionName),
    pieceName: CORE_PIECE_NAME,
    pieceVersion: CORE_PIECE_VERSION,
  };
}

const statuses = (steps: StepExecutionRecord[]) =>
  Object.fromEntries(steps.map((s) => [s.key, s.status]));

describe("router", () => {
  const routed = (status: unknown) => {
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        coreStep("route", "router", {
          branches: [
            {
              name: "Paid",
              left: "{{trigger.payload.status}}",
              operator: "TEXT_EXACTLY_MATCHES",
              right: "paid",
            },
            {
              left: "{{trigger.payload.status}}",
              operator: "TEXT_CONTAINS",
              right: "pa",
            },
            {
              name: "Missing",
              left: "{{trigger.payload.status}}",
              operator: "DOES_NOT_EXIST",
            },
          ],
        }),
        step("paid"),
        step("partial"),
        step("missing"),
        step("other"),
      ],
      edges: [
        edge("e0", "t", "route"),
        edge("e1", "route", "paid", "branch_1"),
        edge("e2", "route", "partial", "branch_2"),
        edge("e3", "route", "missing", "branch_3"),
        edge("e4", "route", "other", "otherwise"),
      ],
    };
    const { executor } = executorWith();
    return runWorkflow({
      definition,
      executor,
      triggerPayload: status === undefined ? {} : { status },
      declaredPorts: knownPorts,
    });
  };

  it("takes the first branch that holds", async () => {
    const run = await routed("paid");
    expect(run.status).toBe("SUCCEEDED");
    expect(run.steps[0]).toMatchObject({
      port: "branch_1",
      output: { branch: "Paid", index: 1 },
    });
    expect(statuses(run.steps)).toEqual({
      route: "SUCCEEDED",
      paid: "SUCCEEDED",
      partial: "SKIPPED",
      missing: "SKIPPED",
      other: "SKIPPED",
    });
    expect(run.warnings).toBeUndefined();
  });

  it("names an unnamed branch by its position", async () => {
    const run = await routed("partly");
    expect(run.steps[0]).toMatchObject({
      port: "branch_2",
      output: { branch: "Branch 2", index: 2 },
    });
  });

  it("fails on a missing value unless the branch tests for existence", async () => {
    // Every branch resolves before any is tested.
    const failed = await routed(undefined);
    expect(failed.status).toBe("FAILED");
    expect(failed.steps[0]?.error).toContain("Unresolved reference");

    const { executor } = executorWith();
    const run = await runWorkflow({
      definition: {
        trigger: TRIGGER,
        steps: [
          coreStep("route", "router", {
            branches: [
              { left: "{{trigger.payload.status}}", operator: "EXISTS" },
              {
                left: "{{trigger.payload.status}}",
                operator: "DOES_NOT_EXIST",
              },
            ],
          }),
        ],
        edges: [edge("e0", "t", "route")],
      },
      executor,
      triggerPayload: {},
    });
    expect(run.steps[0]).toMatchObject({
      port: "branch_2",
      output: { branch: "Branch 2", index: 2 },
    });
  });

  it("takes otherwise when nothing matches", async () => {
    const run = await routed("refunded");
    expect(run.steps[0]).toMatchObject({
      port: "otherwise",
      output: { branch: null, index: null },
    });
    expect(statuses(run.steps)).toMatchObject({
      other: "SUCCEEDED",
      paid: "SKIPPED",
    });
  });

  it("fails the step naming the branch whose operand is mistyped", async () => {
    const { executor } = executorWith();
    const run = await runWorkflow({
      definition: {
        trigger: TRIGGER,
        steps: [
          coreStep("route", "router", {
            branches: [
              {
                name: "Big",
                left: "lots",
                operator: "NUMBER_IS_GREATER_THAN",
                right: "1",
              },
            ],
          }),
        ],
        edges: [edge("e0", "t", "route")],
      },
      executor,
    });
    expect(run.status).toBe("FAILED");
    expect(run.steps[0]?.error).toContain('Router: branch "Big"');
  });

  it("warns about an edge on a branch the router does not have", () => {
    const warnings = deadPortWarnings(
      {
        trigger: TRIGGER,
        steps: [
          coreStep("route", "router", { branches: [{ name: "One" }] }),
          step("a"),
          step("b"),
        ],
        edges: [
          edge("e1", "route", "a", "branch_1"),
          edge("e2", "route", "b", "branch_2"),
        ],
      },
      knownPorts,
    );
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(
      /^Edge from "route" to "b" leaves on port "branch_2", which .* never takes$/,
    );
  });

  it("does not warn about the branches of a router bound to an expression", () => {
    const warnings = deadPortWarnings(
      {
        trigger: TRIGGER,
        steps: [
          coreStep("route", "router", {
            branches: "{{trigger.payload.rules}}",
          }),
          step("a"),
          step("b"),
        ],
        edges: [
          edge("e1", "route", "a", "branch_1"),
          edge("e2", "route", "b", "branch_2"),
        ],
      },
      knownPorts,
    );
    expect(warnings).toEqual([]);
  });
});

describe("loop", () => {
  // trigger -> loop -(each)-> body1 -> body2 ; loop -(next)-> after
  function looped(
    items: unknown,
    body: WorkflowStepDef[] = [
      step("body1", { item: "{{steps.loop.output.item}}" }),
      step("body2", {
        index: "{{steps.loop.output.index}}",
        prev: "{{steps.body1.output.item}}",
      }),
    ],
    extraEdges: ReturnType<typeof edge>[] = [],
  ): WorkflowDefinition {
    return {
      trigger: TRIGGER,
      steps: [
        coreStep("loop", "loop", { items }),
        ...body,
        step("after", { count: "{{steps.loop.output.count}}" }),
      ],
      edges: [
        edge("e0", "t", "loop"),
        edge("e1", "loop", body[0].id, "each"),
        ...(body.length > 1 && extraEdges.length === 0
          ? [edge("e2", body[0].id, body[1].id)]
          : []),
        ...extraEdges,
        edge("e3", "loop", "after"),
      ],
    };
  }

  async function run(
    definition: WorkflowDefinition,
    payload: unknown = { rows: ["a", "b", "c"] },
    extra: Partial<Parameters<typeof runWorkflow>[0]> = {},
  ) {
    const journal: { record: StepExecutionRecord; ordinal: number }[] = [];
    const { executor, fake } = executorWith();
    const result = await runWorkflow({
      definition,
      executor,
      triggerPayload: payload,
      onStep: (record, ordinal) => {
        journal.push({ record, ordinal });
      },
      ...extra,
    });
    return { result, journal, fake };
  }

  it("runs the body once per item, then continues on next", async () => {
    const { result, journal, fake } = await run(
      looped("{{trigger.payload.rows}}"),
    );
    expect(result.status).toBe("SUCCEEDED");
    expect(fake.calls.map((call) => call.step.id)).toEqual([
      "body1",
      "body2",
      "body1",
      "body2",
      "body1",
      "body2",
      "after",
    ]);
    expect(fake.calls[3].config).toEqual({ index: 2, prev: "b" });
    expect(fake.calls[6].config).toEqual({ count: 3 });
    const loop = result.steps.find((s) => s.key === "loop")!;
    expect(loop).toMatchObject({ status: "SUCCEEDED", port: "next" });
    expect(loop.output).toEqual({
      item: "c",
      index: 3,
      count: 3,
      iterations: [
        {
          index: 1,
          item: "a",
          steps: { body1: { item: "a" }, body2: { index: 1, prev: "a" } },
        },
        {
          index: 2,
          item: "b",
          steps: { body1: { item: "b" }, body2: { index: 2, prev: "b" } },
        },
        {
          index: 3,
          item: "c",
          steps: { body1: { item: "c" }, body2: { index: 3, prev: "c" } },
        },
      ],
    });
    // Body steps end on their last iteration's record.
    expect(result.steps.find((s) => s.key === "body2")?.output).toEqual({
      index: 3,
      prev: "c",
    });
    // Each iteration under its own path, then the loop, then top-level rows.
    expect(journal.map(({ record }) => record.path ?? record.stepId)).toEqual([
      "loop[1]/body1",
      "loop[1]/body2",
      "loop[2]/body1",
      "loop[2]/body2",
      "loop[3]/body1",
      "loop[3]/body2",
      "loop",
      "body1",
      "body2",
      "after",
    ]);
    expect(journal.map(({ ordinal }) => ordinal)).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8, 9,
    ]);
  });

  it("skips the body of an empty list and takes next", async () => {
    const { result, fake } = await run(looped("{{trigger.payload.rows}}"), {
      rows: [],
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(statuses(result.steps)).toEqual({
      loop: "SUCCEEDED",
      body1: "SKIPPED",
      body2: "SKIPPED",
      after: "SUCCEEDED",
    });
    expect(result.steps[0].output).toEqual({
      item: null,
      index: 0,
      count: 0,
      iterations: [],
    });
    expect(fake.calls.map((call) => call.step.id)).toEqual(["after"]);
  });

  it("fails the loop on items that are not a list", async () => {
    const { result, fake } = await run(looped("{{trigger.payload.rows}}"), {
      rows: { a: 1 },
    });
    expect(result.status).toBe("FAILED");
    expect(result.steps[0]?.error).toContain("Loop: items must be a list");
    expect(fake.calls).toHaveLength(0);
  });

  it("runs a loop nested in a body", async () => {
    const definition: WorkflowDefinition = {
      trigger: TRIGGER,
      steps: [
        coreStep("outer", "loop", { items: "{{trigger.payload.rows}}" }),
        coreStep("inner", "loop", { items: "{{steps.outer.output.item}}" }),
        step("cell", {
          row: "{{steps.outer.output.index}}",
          value: "{{steps.inner.output.item}}",
        }),
        step("after"),
      ],
      edges: [
        edge("e0", "t", "outer"),
        edge("e1", "outer", "inner", "each"),
        edge("e2", "inner", "cell", "each"),
        edge("e3", "outer", "after"),
      ],
    };
    const { result, journal, fake } = await run(definition, {
      rows: [[1, 2], [3]],
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(fake.calls.map((call) => call.config)).toEqual([
      { row: 1, value: 1 },
      { row: 1, value: 2 },
      { row: 2, value: 3 },
      {},
    ]);
    expect(journal.map(({ record }) => record.path ?? record.stepId)).toEqual([
      "outer[1]/inner[1]/cell",
      "outer[1]/inner[2]/cell",
      "outer[1]/inner",
      "outer[2]/inner[1]/cell",
      "outer[2]/inner",
      "outer",
      "inner",
      "cell",
      "after",
    ]);
  });

  it("fails the run on a body failure with no error edge", async () => {
    const { result, fake } = await run(
      looped("{{trigger.payload.rows}}", [step("body1", {}, "fail")]),
    );
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe('Step "body1" failed: boom');
    expect(fake.calls).toHaveLength(1);
    expect(statuses(result.steps)).toEqual({
      loop: "FAILED",
      body1: "FAILED",
      after: "SKIPPED",
    });
    expect(result.steps[0].error).toContain("Item 1:");
  });

  it("carries on through a body failure its error edge handles", async () => {
    const { result, fake } = await run(
      looped(
        "{{trigger.payload.rows}}",
        [
          step("body1", {}, "fail"),
          step("handled", { why: "{{steps.body1.error}}" }),
        ],
        [edge("e2", "body1", "handled", "error")],
      ),
    );
    expect(result.status).toBe("SUCCEEDED");
    expect(fake.calls.map((call) => call.step.id)).toEqual([
      "body1",
      "handled",
      "body1",
      "handled",
      "body1",
      "handled",
      "after",
    ]);
  });

  it("refuses a body that leads out of the loop", async () => {
    const definition = looped(
      "{{trigger.payload.rows}}",
      [step("body1")],
      [edge("x", "body1", "after")],
    );
    const { result, fake } = await run(definition);
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain(
      'Step "after" is reached both from "body1" in the body of loop "loop" and from "loop" outside it',
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("refuses a body step reached from outside the loop", async () => {
    const definition = looped(
      "{{trigger.payload.rows}}",
      [step("body1")],
      [edge("x", "t", "body1")],
    );
    const { result } = await run(definition);
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain(
      'Step "body1" in the body of loop "loop" is also reached from "t" outside it',
    );
  });

  it("refuses to wait inside a loop", async () => {
    const delay = coreStep("wait", "delay", { mode: "for", seconds: 5 });
    const { result } = await run(looped("{{trigger.payload.rows}}", [delay]));
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe('Step "wait" cannot wait inside a loop yet');

    const paused = await run(
      looped("{{trigger.payload.rows}}", [step("pauses", {}, "pause")]),
    );
    expect(paused.result.status).toBe("FAILED");
    expect(paused.result.error).toBe(
      'Step "pauses" cannot wait inside a loop yet',
    );
  });

  it("refuses a Call Flow that waits inside a loop before it runs", async () => {
    const call = {
      ...step("call", { flowId: "wf-1", waitForResponse: true }, "callFlow"),
      pieceName: "@activepieces/piece-subflows",
    };
    const { result, fake } = await run(
      looped("{{trigger.payload.rows}}", [call]),
    );
    expect(result.status).toBe("FAILED");
    expect(result.error).toBe('Step "call" cannot wait inside a loop yet');
    expect(fake.calls).toHaveLength(0);

    const noWait = {
      ...call,
      config: { flowId: "wf-1", waitForResponse: false },
    };
    const fired = await run(looped("{{trigger.payload.rows}}", [noWait]));
    expect(fired.result.status).toBe("SUCCEEDED");
    expect(fired.fake.calls).toHaveLength(4);
  });

  it("keeps a body step's credential out of the loop row", async () => {
    const { result, journal } = await run(
      looped("{{trigger.payload.rows}}", [step("lookup", {}, "secret")]),
      { rows: ["a"] },
    );
    expect(result.status).toBe("SUCCEEDED");
    const loopRow = journal.find(({ record }) => record.stepId === "loop");
    expect(loopRow?.record.output).toMatchObject({
      iterations: [{ steps: { lookup: { value: "[redacted:secret]" } } }],
    });
    expect(JSON.stringify(journal)).not.toContain("s3cr3t");
  });

  it("caps journaled iterations by UTF-8 bytes under the payload cap", async () => {
    // 3 bytes a character in UTF-8, one in UTF-16.
    const wide = "\u20ac".repeat(20_000);
    const { result } = await run(
      looped("{{trigger.payload.rows}}", [
        step("body1", { text: "{{steps.loop.output.item}}" }),
      ]),
      { rows: [wide, wide, wide] },
    );
    expect(result.status).toBe("SUCCEEDED");
    const output = result.steps[0]!.output as {
      iterations: unknown[];
      iterationsTruncated?: boolean;
    };
    expect(output.iterations).toHaveLength(1);
    expect(output.iterationsTruncated).toBe(true);
    expect(
      new TextEncoder().encode(JSON.stringify(output)).length,
    ).toBeLessThan(256 * 1024);
  });

  it("replays an iteration whose item is unchanged, by its path", async () => {
    const definition = looped("{{trigger.payload.rows}}");
    const completedSteps = new Map<string, ReplayedStep>([
      ["loop[1]/body1", { output: { item: "a" }, port: "next" }],
      ["loop[1]/body2", { output: { index: 1, prev: "a" }, port: "next" }],
      ["loop[2]/body1", { output: { item: "b" }, port: "next" }],
      ["loop[2]/body2", { output: { index: 2, prev: "b" }, port: "next" }],
    ]);
    const { result, journal, fake } = await run(definition, undefined, {
      completedSteps,
      // The second item changed since the run being rerun.
      loopItems: new Map([["loop", ["a", "B"]]]),
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(fake.calls.map((call) => call.step.id)).toEqual([
      "body1",
      "body2",
      "body1",
      "body2",
      "after",
    ]);
    const paths = Object.fromEntries(
      journal.map(({ record }) => [
        record.path ?? record.stepId,
        record.status,
      ]),
    );
    expect(paths).toMatchObject({
      "loop[1]/body1": "REPLAYED",
      "loop[1]/body2": "REPLAYED",
      "loop[2]/body1": "SUCCEEDED",
      "loop[3]/body1": "SUCCEEDED",
      loop: "SUCCEEDED",
    });
  });

  it("runs a loop rather than replay it whole", async () => {
    const definition = looped("{{trigger.payload.rows}}");
    const completedSteps = new Map<string, ReplayedStep>([
      ["loop", { output: { count: 3 }, port: "next" }],
      ["body2", { output: { index: 3, prev: "c" }, port: "next" }],
    ]);
    const { result, fake } = await run(definition, undefined, {
      completedSteps,
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(fake.calls.filter((c) => c.step.id === "body1")).toHaveLength(3);
  });

  it("refuses a body step that leads back to its loop", async () => {
    const { result, fake } = await run(
      looped("{{trigger.payload.rows}}", undefined, [
        edge("e2", "body1", "body2"),
        edge("e4", "body2", "loop"),
      ]),
    );
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain(
      '"body2" in the body of loop "loop" leads back',
    );
    expect(fake.calls).toHaveLength(0);
  });

  it("hashes an author-skipped step and a loop's body shape", async () => {
    const definition = looped("{{trigger.payload.rows}}", [
      step("body1", { item: "{{steps.loop.output.item}}" }),
      { ...step("body2"), skip: true },
    ]);
    const { journal } = await run(definition);
    const skipped = journal.find(({ record }) => record.stepId === "body2");
    expect(skipped?.record.configHash).toEqual(expect.any(String));
    const rewired = {
      ...definition,
      edges: definition.edges.filter((e) => e.id !== "e2"),
    };
    const loopHash = async (d: WorkflowDefinition) =>
      (await run(d)).journal.find(({ record }) => record.stepId === "loop")
        ?.record.configHash;
    expect(await loopHash(rewired)).not.toBe(await loopHash(definition));
  });

  it("runs the loop fresh when it did not complete, ignoring body replays", async () => {
    const definition = looped("{{trigger.payload.rows}}");
    const completedSteps = new Map<string, ReplayedStep>([
      ["body1", { output: { item: "stale" }, port: "next" }],
    ]);
    const { result, fake } = await run(definition, undefined, {
      completedSteps,
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(fake.calls.filter((c) => c.step.id === "body1")).toHaveLength(3);
  });

  it("carries a completed loop's body with it on resume", async () => {
    const definition = looped("{{trigger.payload.rows}}");
    const carried = (output: unknown) => ({
      status: "SUCCEEDED" as const,
      port: "next",
      output: () => output,
    });
    const { result, fake } = await run(definition, undefined, {
      carriedSteps: new Map([
        ["loop", carried({ count: 3 })],
        ["body1", carried({ item: "c" })],
        ["body2", carried({ index: 3, prev: "c" })],
      ]),
    });
    expect(result.status).toBe("SUCCEEDED");
    expect(fake.calls.map((call) => call.step.id)).toEqual(["after"]);
    expect(statuses(result.steps)).toMatchObject({
      body1: "SUCCEEDED",
      body2: "SUCCEEDED",
    });
  });
});
