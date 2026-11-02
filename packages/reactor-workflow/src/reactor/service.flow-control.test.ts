// The core Router and Loop through a real runtime: routing, and a loop's
// iterations journaled under their own paths beside each step's own row.
import { actions } from "@powerhousedao/workflow/document-models/workflow";
import { describe, expect, it, vi } from "vitest";
import {
  CORE,
  CTX,
  fire,
  settles,
  stepsOf,
  waitpointSuite,
} from "../../test/helpers/waitpoints.js";
import { RUN_ITERATIONS_LIMIT } from "./service.js";
import { TRUNCATED_PAYLOAD_KEY, TRUNCATED_PAYLOAD_SENTINEL } from "./store.js";

// check fails on its reject value; list splits its text into rows.
const suite = waitpointSuite({
  actions: `
    check: {
      name: "check",
      displayName: "Check",
      props: {
        text: { displayName: "Text", type: "SHORT_TEXT", required: false },
        reject: { displayName: "Reject", type: "SHORT_TEXT", required: false },
      },
      run: async (ctx) => {
        if (ctx.propsValue.text === ctx.propsValue.reject) {
          throw new Error("rejected " + ctx.propsValue.text);
        }
        return { text: ctx.propsValue.text };
      },
    },
    list: {
      name: "list",
      displayName: "List",
      props: { text: { displayName: "Text", type: "SHORT_TEXT", required: true } },
      run: async (ctx) => ({ rows: ctx.propsValue.text.split(",") }),
    },
`,
});

// Applies document actions to a workflow, then publishes it.
let published = Date.parse("2026-01-02T00:00:00.000Z");
function republish(id: string, ...changes: unknown[]) {
  suite.documents.apply(
    id,
    ...(changes as never[]),
    actions.publishWorkflow({
      publishedAt: new Date(published++).toISOString(),
    }),
  );
}

// Every journaled row of a run, loop iterations included, by step path.
async function pathsOf(runId: string) {
  const rows = await (await suite.service.store())!.getSteps(runId, {
    withIterations: true,
  });
  return Object.fromEntries(rows.map((row) => [row.step_path, row]));
}

const outputOf = (row: { output: string | null } | undefined) =>
  JSON.parse(row?.output ?? "null") as unknown;

describe("Router", () => {
  it("routes to the first branch that holds", async () => {
    suite.define(
      "wf-router",
      [
        [
          "route",
          "core:router",
          {
            branches: [
              {
                name: "Big",
                left: "{{trigger.payload.n}}",
                operator: "NUMBER_IS_GREATER_THAN",
                right: "10",
              },
            ],
          },
        ],
        ["big", "core:assert", { value: "big" }],
        ["small", "core:assert", { value: "small" }],
      ],
      {
        piece: CORE,
        edges: [
          ["t1", "route", "next"],
          ["route", "big", "branch_1"],
          ["route", "small", "otherwise"],
        ],
      },
    );
    const big = await fire(suite.service, "wf-router", { n: 11 });
    await settles(suite.service, big.runId!, "SUCCEEDED");
    const bigSteps = await stepsOf(suite.service, big.runId!);
    expect(bigSteps.route?.port).toBe("branch_1");
    expect(bigSteps.big?.status).toBe("SUCCEEDED");
    expect(bigSteps.small?.status).toBe("SKIPPED");

    const small = await fire(suite.service, "wf-router", { n: 2 });
    await settles(suite.service, small.runId!, "SUCCEEDED");
    expect((await stepsOf(suite.service, small.runId!)).route?.port).toBe(
      "otherwise",
    );
    expect(small.warnings ?? []).toEqual([]);
  });
});

describe("Loop", () => {
  it("journals each iteration under its path and serves them with the run", async () => {
    suite.define(
      "wf-loop",
      [
        ["loop", "core:loop", { items: "{{trigger.payload.rows}}" }],
        ["check", "core:assert", { value: "{{steps.loop.output.item}}" }],
        ["after", "core:assert", { value: "{{steps.loop.output.count}}" }],
      ],
      {
        piece: CORE,
        edges: [
          ["t1", "loop", "next"],
          ["loop", "check", "each"],
          ["loop", "after", "next"],
        ],
      },
    );
    const fired = await fire(suite.service, "wf-loop", { rows: ["x", "y"] });
    await settles(suite.service, fired.runId!, "SUCCEEDED");

    const top = await stepsOf(suite.service, fired.runId!);
    expect(top.check).toMatchObject({
      status: "SUCCEEDED",
      step_path: "check",
    });
    expect(JSON.parse(top.check!.output!)).toEqual({ value: "y" });
    expect(JSON.parse(top.after!.output!)).toEqual({ value: 2 });
    expect(JSON.parse(top.loop!.output!)).toMatchObject({
      count: 2,
      iterations: [
        { index: 1, item: "x", steps: { check: { value: "x" } } },
        { index: 2, item: "y", steps: { check: { value: "y" } } },
      ],
    });

    const run = await suite.service.run(fired.runId!, CTX);
    expect(run?.steps.map((step) => step.step_path)).toEqual([
      "loop[1]/check",
      "loop[2]/check",
      "loop",
      "check",
      "after",
    ]);
    expect(JSON.parse(run!.steps[0]!.output!)).toEqual({ value: "x" });

    // A listing leaves the iterations to the run's detail.
    const [listed] = await suite.service.runs({ workflowId: "wf-loop" }, CTX);
    expect(listed!.steps.map((step) => step.step_path)).toEqual([
      "loop",
      "check",
      "after",
    ]);
    expect(JSON.parse(listed!.steps[1]!.output!)).toEqual({ value: "y" });
    expect(run?.iterationsTotal).toBeUndefined();
  });

  it("serves the first iterations of a long loop, and their total", async () => {
    suite.define(
      "wf-loop-long",
      [
        ["loop", "core:loop", { items: "{{trigger.payload.rows}}" }],
        ["check", "core:assert", { value: "{{steps.loop.output.item}}" }],
      ],
      {
        piece: CORE,
        edges: [
          ["t1", "loop", "next"],
          ["loop", "check", "each"],
        ],
      },
    );
    const rows = Array.from(
      { length: RUN_ITERATIONS_LIMIT + 5 },
      (_, i) => `r${i}`,
    );
    const fired = await fire(suite.service, "wf-loop-long", { rows });
    await settles(suite.service, fired.runId!, "SUCCEEDED");
    const run = await suite.service.run(fired.runId!, CTX);
    const iterations = run!.steps.filter(
      (step) => step.step_path !== step.step_id,
    );
    expect(iterations).toHaveLength(RUN_ITERATIONS_LIMIT);
    expect(iterations[0]!.step_path).toBe("loop[1]/check");
    expect(run!.iterationsTotal).toBe(RUN_ITERATIONS_LIMIT + 5);
    expect(run!.steps.at(-1)!.step_path).toBe("check");
  }, 60_000);

  it("reruns a loop whose body changed, and replays one that did not", async () => {
    const edit = (id: string, changes: Record<string, string>) =>
      republish(
        id,
        ...Object.entries(changes).map(([step, value]) =>
          actions.setStepConfig({ id: step, config: { value } }),
        ),
      );
    const failedRun = async (id: string) => {
      suite.define(
        id,
        [
          ["loop", "core:loop", { items: "{{trigger.payload.rows}}" }],
          ["check", "core:assert", { value: "{{steps.loop.output.item}}" }],
          ["after", "core:assert", { value: "" }],
        ],
        {
          piece: CORE,
          edges: [
            ["t1", "loop", "next"],
            ["loop", "check", "each"],
            ["loop", "after", "next"],
          ],
        },
      );
      const fired = await fire(suite.service, id, { rows: [1] });
      await settles(suite.service, fired.runId!, "FAILED");
      return fired.runId!;
    };

    const kept = await failedRun("wf-loop-kept");
    edit("wf-loop-kept", { after: "done" });
    const replayed = await suite.service.rerun(kept, CTX);
    expect(replayed.status).toBe("SUCCEEDED");
    // The loop runs again over its items; each iteration's body replays.
    const unchanged = await stepsOf(suite.service, replayed.runId!);
    expect(unchanged.loop?.status).toBe("SUCCEEDED");
    expect(unchanged.check?.status).toBe("REPLAYED");

    const edited = await failedRun("wf-loop-edited");
    edit("wf-loop-edited", {
      check: "changed {{steps.loop.output.item}}",
      after: "done",
    });
    const rerun = await suite.service.rerun(edited, CTX);
    expect(rerun.status).toBe("SUCCEEDED");
    const changed = await stepsOf(suite.service, rerun.runId!);
    expect(changed.loop?.status).toBe("SUCCEEDED");
    expect(JSON.parse(changed.check!.output!)).toEqual({ value: "changed 1" });
  });

  it("fails a run whose loop body leads out of it", async () => {
    suite.define(
      "wf-loop-open",
      [
        ["loop", "core:loop", { items: "{{trigger.payload.rows}}" }],
        ["check", "core:assert", { value: "x" }],
        ["after", "core:assert", { value: "y" }],
      ],
      {
        piece: CORE,
        edges: [
          ["t1", "loop", "next"],
          ["loop", "check", "each"],
          ["check", "after", "next"],
          ["loop", "after", "next"],
        ],
      },
    );
    const fired = await fire(suite.service, "wf-loop-open", { rows: [1] });
    const row = await settles(suite.service, fired.runId!, "FAILED");
    expect(row.error).toContain('in the body of loop "loop"');
  });
});

describe("Loop rerun", () => {
  // loop -(each)-> echo -> check; loop -(next)-> after
  const looped = (
    id: string,
    options: { items?: string; after?: string; reject?: string } = {},
  ) =>
    suite.define(
      id,
      [
        [
          "loop",
          "core:loop",
          { items: options.items ?? "{{trigger.payload.rows}}" },
        ],
        ["echo", "echo", { text: "{{steps.loop.output.item}}" }],
        [
          "check",
          "check",
          { text: "{{steps.loop.output.item}}", reject: options.reject ?? "b" },
        ],
        ["after", "core:assert", { value: options.after ?? "done" }],
      ],
      {
        edges: [
          ["t1", "loop", "next"],
          ["loop", "echo", "each"],
          ["echo", "check", "next"],
          ["loop", "after", "next"],
        ],
      },
    );

  it("replays the iterations that ran and runs the rest", async () => {
    looped("wf-iter");
    const fired = await fire(suite.service, "wf-iter", {
      rows: ["a", "b", "c"],
    });
    await settles(suite.service, fired.runId!, "FAILED");
    const before = await pathsOf(fired.runId!);
    republish(
      "wf-iter",
      actions.setStepConfig({
        id: "check",
        config: { text: "{{steps.loop.output.item}}", reject: "none" },
      }),
    );

    const rerun = await suite.service.rerun(fired.runId!, CTX);
    expect(rerun.status).toBe("SUCCEEDED");
    const after = await pathsOf(rerun.runId!);
    // Both echoes of the failed run already wrote; neither is repeated.
    for (const path of ["loop[1]/echo", "loop[2]/echo"]) {
      expect(after[path]?.status).toBe("REPLAYED");
      expect(outputOf(after[path])).toEqual(outputOf(before[path]));
    }
    expect(after["loop[3]/echo"]?.status).toBe("SUCCEEDED");
    expect(after["loop[2]/check"]?.status).toBe("SUCCEEDED");
    expect(outputOf(after.loop)).toMatchObject({ count: 3 });
  });

  it("runs an iteration again when its item changed", async () => {
    suite.define(
      "wf-iter-items",
      [
        ["src", "list", { text: "a,b" }],
        ["loop", "core:loop", { items: "{{steps.src.output.rows}}" }],
        ["echo", "echo", { text: "{{steps.loop.output.item}}" }],
        ["check", "check", { text: "{{steps.loop.output.item}}", reject: "b" }],
      ],
      {
        edges: [
          ["t1", "src", "next"],
          ["src", "loop", "next"],
          ["loop", "echo", "each"],
          ["echo", "check", "next"],
        ],
      },
    );
    const fired = await fire(suite.service, "wf-iter-items");
    await settles(suite.service, fired.runId!, "FAILED");
    republish(
      "wf-iter-items",
      actions.setStepConfig({ id: "src", config: { text: "a,x" } }),
    );

    const rerun = await suite.service.rerun(fired.runId!, CTX);
    expect(rerun.status).toBe("SUCCEEDED");
    const after = await pathsOf(rerun.runId!);
    expect(after["loop[1]/echo"]?.status).toBe("REPLAYED");
    expect(after["loop[2]/echo"]?.status).toBe("SUCCEEDED");
    expect(outputOf(after["loop[2]/echo"])).toMatchObject({ text: "x" });
  });

  it("runs every iteration again when the body was rewired", async () => {
    suite.define(
      "wf-iter-rewired",
      [
        ["loop", "core:loop", { items: "{{trigger.payload.rows}}" }],
        ["echo", "echo", { text: "{{steps.loop.output.item}}" }],
        ["check", "check", { text: "{{steps.loop.output.item}}" }],
        ["after", "core:assert", { value: "" }],
      ],
      {
        edges: [
          ["t1", "loop", "next"],
          ["loop", "echo", "each"],
          ["loop", "check", "each"],
          ["loop", "after", "next"],
        ],
      },
    );
    const fired = await fire(suite.service, "wf-iter-rewired", {
      rows: ["a", "b"],
    });
    await settles(suite.service, fired.runId!, "FAILED");
    republish(
      "wf-iter-rewired",
      actions.removeEdge({ id: "e2" }),
      actions.addEdge({ id: "e9", from: "echo", to: "check", port: "next" }),
      actions.setStepConfig({ id: "after", config: { value: "done" } }),
    );

    const rerun = await suite.service.rerun(fired.runId!, CTX);
    expect(rerun.status).toBe("SUCCEEDED");
    const after = await pathsOf(rerun.runId!);
    expect(after["loop[1]/echo"]?.status).toBe("SUCCEEDED");
    expect(after["loop[2]/echo"]?.status).toBe("SUCCEEDED");
    expect(after.check!.status).toBe("SUCCEEDED");
  });

  it("runs a loop again when a body step re-reads", async () => {
    looped("wf-iter-reread", { after: "", reject: "none" });
    const fired = await fire(suite.service, "wf-iter-reread", {
      rows: ["a", "b"],
    });
    await settles(suite.service, fired.runId!, "FAILED");
    await suite.db
      .updateTable("step_execution")
      .set({
        output: JSON.stringify({
          [TRUNCATED_PAYLOAD_KEY]: TRUNCATED_PAYLOAD_SENTINEL,
          bytes: 999_999,
          prefix: "{",
        }),
      })
      .where("run_id", "=", fired.runId!)
      .where("step_id", "=", "echo")
      .execute();
    republish(
      "wf-iter-reread",
      actions.setStepConfig({
        id: "after",
        config: { value: "{{steps.echo.output.text}}" },
      }),
    );
    // Every step reads: the truncated echoes run again instead of replaying.
    const rereads = vi
      .spyOn(
        suite.service as unknown as { rereads: () => Promise<boolean> },
        "rereads",
      )
      .mockResolvedValue(true);
    const rerun = await suite.service
      .rerun(fired.runId!, CTX)
      .finally(() => rereads.mockRestore());

    expect(rerun.error ?? null).toBeNull();
    expect(rerun.status).toBe("SUCCEEDED");
    const after = await pathsOf(rerun.runId!);
    expect(after["loop[2]/echo"]?.status).toBe("SUCCEEDED");
    expect(outputOf(after.after)).toEqual({ value: "b" });
  });

  it("replays a loop whose body has an author-skipped step", async () => {
    suite.define(
      "wf-iter-skip",
      [
        ["loop", "core:loop", { items: "{{trigger.payload.rows}}" }],
        ["echo", "echo", { text: "{{steps.loop.output.item}}" }],
        ["noop", "echo", { text: "skipped" }],
        ["after", "core:assert", { value: "" }],
      ],
      {
        edges: [
          ["t1", "loop", "next"],
          ["loop", "echo", "each"],
          ["echo", "noop", "next"],
          ["loop", "after", "next"],
        ],
        stepFields: { noop: { skip: true } },
      },
    );
    const fired = await fire(suite.service, "wf-iter-skip", { rows: ["a"] });
    await settles(suite.service, fired.runId!, "FAILED");
    const before = await pathsOf(fired.runId!);
    expect(before["loop[1]/noop"]?.config_hash).not.toBeNull();
    republish(
      "wf-iter-skip",
      actions.setStepConfig({ id: "after", config: { value: "done" } }),
    );

    const rerun = await suite.service.rerun(fired.runId!, CTX);
    expect(rerun.status).toBe("SUCCEEDED");
    const after = await pathsOf(rerun.runId!);
    expect(after["loop[1]/echo"]?.status).toBe("REPLAYED");
    expect(outputOf(after["loop[1]/echo"])).toEqual(
      outputOf(before["loop[1]/echo"]),
    );
  });
});
