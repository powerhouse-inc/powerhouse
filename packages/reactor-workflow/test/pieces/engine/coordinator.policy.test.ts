// Per-step retry, the run deadline, INDETERMINATE and the truncated replay:
// the four things the coordinator gained in W3.3. Every one of them was a
// document-model field nothing read (backlog items 4, 6, 15).
import { describe, expect, it } from "vitest";
import { runWorkflow } from "../../../src/pieces/engine/coordinator.js";
import {
  effectiveRetryPolicy,
  isRetryableError,
  MAX_STEP_ATTEMPTS,
  retryDelayMs,
} from "../../../src/pieces/engine/retry.js";
import { HostCallIndeterminateError } from "../../../src/pieces/activepieces/worker/host-call.js";
import { ActivepiecesBlockExecutor } from "../../../src/pieces/engine/blocks.js";
import type {
  BlockDefaults,
  BlockExecution,
  BlockExecutor,
  WorkflowDefinition,
} from "../../../src/pieces/engine/types.js";
import { CORE_PIECE_VERSION } from "../../../src/pieces/index.js";

const TRIGGER = {
  id: "t",
  pieceName: "@powerhousedao/piece-core",
  pieceVersion: CORE_PIECE_VERSION,
  triggerName: "manual",
  config: {},
};

// Fails the first `failures` calls, then echoes its config.
class FlakyExecutor implements BlockExecutor {
  readonly calls: BlockExecution[] = [];

  constructor(
    private failures: number,
    private readonly error: () => Error = () => new Error("boom"),
  ) {}

  execute(execution: BlockExecution) {
    this.calls.push(execution);
    if (this.failures > 0) {
      this.failures -= 1;
      return Promise.reject(this.error());
    }
    return Promise.resolve({ output: execution.config });
  }
}

function step(
  id: string,
  key: string,
  retry?: unknown,
  config: unknown = { n: 1 },
) {
  return {
    id,
    key,
    pieceName: "@acme/piece-x",
    pieceVersion: "1.0.0",
    actionName: "go",
    config,
    ...(retry === undefined ? {} : { retry }),
  };
}

function definition(
  steps: WorkflowDefinition["steps"],
  edges: WorkflowDefinition["edges"] = [],
): WorkflowDefinition {
  return {
    name: "w",
    trigger: TRIGGER,
    steps,
    edges: [
      { id: "e-entry", from: "t", to: steps[0].id, port: "next" },
      ...edges,
    ],
    variables: [],
  };
}

const NO_WAIT = {
  maxAttempts: 3,
  backoff: "FIXED",
  initialDelaySeconds: 0,
  maxDelaySeconds: 0,
  retryOn: [],
};

describe("retry policy resolution", () => {
  it("reads one attempt as no policy, so every reader has one branch", () => {
    expect(effectiveRetryPolicy({ maxAttempts: 1 })).toBeNull();
    expect(effectiveRetryPolicy(null)).toBeNull();
    expect(effectiveRetryPolicy({ maxAttempts: 0 })).toBeNull();
  });

  it("clamps an unbounded maxAttempts", () => {
    expect(effectiveRetryPolicy({ maxAttempts: 10_000 })?.maxAttempts).toBe(
      MAX_STEP_ATTEMPTS,
    );
  });

  it("backs off fixed and exponentially, capped by maxDelaySeconds", () => {
    const fixed = effectiveRetryPolicy({
      maxAttempts: 5,
      backoff: "FIXED",
      initialDelaySeconds: 2,
      maxDelaySeconds: 60,
      retryOn: [],
    })!;
    expect([2, 3, 4].map((a) => retryDelayMs(fixed, a))).toEqual([
      2000, 2000, 2000,
    ]);

    const exponential = effectiveRetryPolicy({
      maxAttempts: 5,
      backoff: "EXPONENTIAL",
      initialDelaySeconds: 2,
      maxDelaySeconds: 7,
      retryOn: [],
    })!;
    expect([2, 3, 4, 5].map((a) => retryDelayMs(exponential, a))).toEqual([
      2000, 4000, 7000, 7000,
    ]);
  });

  it("admits every error on an empty retryOn, and filters on a full one", () => {
    const open = effectiveRetryPolicy({ maxAttempts: 2, retryOn: [] })!;
    expect(isRetryableError(open, new Error("anything"))).toBe(true);

    const narrow = effectiveRetryPolicy({
      maxAttempts: 2,
      retryOn: ["TypeError", "429"],
    })!;
    expect(isRetryableError(narrow, new TypeError("nope"))).toBe(true);
    expect(isRetryableError(narrow, new Error("HTTP 429 Too Many"))).toBe(true);
    expect(isRetryableError(narrow, new Error("HTTP 500"))).toBe(false);
  });
});

describe("the coordinator's retry", () => {
  it("runs a step maxAttempts times and then fails, waiting between attempts", async () => {
    const executor = new FlakyExecutor(99);
    const waits: number[] = [];

    const result = await runWorkflow({
      definition: definition([
        step("a", "first", {
          maxAttempts: 3,
          backoff: "EXPONENTIAL",
          initialDelaySeconds: 1,
          maxDelaySeconds: 30,
          retryOn: [],
        }),
      ]),
      executor,
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    expect(executor.calls).toHaveLength(3);
    expect(waits).toEqual([1000, 2000]);
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("after 3 attempts");
    expect(result.steps[0].status).toBe("FAILED");
    expect(result.steps[0].attempts).toBe(3);
  });

  it("stops retrying as soon as the step succeeds", async () => {
    const executor = new FlakyExecutor(2);

    const result = await runWorkflow({
      definition: definition([step("a", "first", NO_WAIT)]),
      executor,
    });

    expect(executor.calls).toHaveLength(3);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps[0].attempts).toBe(3);
  });

  it("runs once when the step has no policy, and journals no attempt count", async () => {
    const executor = new FlakyExecutor(99);

    const result = await runWorkflow({
      definition: definition([step("a", "first")]),
      executor,
    });

    expect(executor.calls).toHaveLength(1);
    expect(result.steps[0].attempts).toBeUndefined();
  });

  it("falls back to the workflow's defaultRetry", async () => {
    const executor = new FlakyExecutor(1);

    await runWorkflow({
      definition: definition([step("a", "first")]),
      executor,
      defaultRetry: effectiveRetryPolicy(NO_WAIT),
    });

    expect(executor.calls).toHaveLength(2);
  });

  it("lets the step's own policy override the workflow default", async () => {
    const executor = new FlakyExecutor(99);

    await runWorkflow({
      definition: definition([step("a", "first", { maxAttempts: 1 })]),
      executor,
      defaultRetry: effectiveRetryPolicy(NO_WAIT),
    });

    expect(executor.calls).toHaveLength(1);
  });

  it("does not retry an error retryOn excludes", async () => {
    const executor = new FlakyExecutor(99);

    await runWorkflow({
      definition: definition([
        step("a", "first", { ...NO_WAIT, retryOn: ["TimeoutError"] }),
      ]),
      executor,
    });

    expect(executor.calls).toHaveLength(1);
  });
});

describe("action defaults", () => {
  const defaults =
    (value: BlockDefaults | undefined, asked: string[] = []) =>
    (block: { name: string }) => {
      asked.push(block.name);
      return Promise.resolve(value);
    };

  it("applies the workflow's retry over the action's when the step sets none", async () => {
    const executor = new FlakyExecutor(99);

    const result = await runWorkflow({
      definition: definition([step("a", "first")]),
      executor,
      defaultRetry: effectiveRetryPolicy(NO_WAIT),
      blockDefaults: defaults({ retry: { maxAttempts: 1 } }),
    });

    expect(executor.calls).toHaveLength(3);
    expect(result.steps[0].attempts).toBe(3);
  });

  it("applies the action's retry when the workflow's retries nothing", async () => {
    const executor = new FlakyExecutor(99);

    await runWorkflow({
      definition: definition([step("a", "first")]),
      executor,
      // The document's initial default.
      defaultRetry: effectiveRetryPolicy({ maxAttempts: 1 }),
      blockDefaults: defaults({ retry: { maxAttempts: 2 } }),
      sleep: () => Promise.resolve(),
    });

    expect(executor.calls).toHaveLength(2);
  });

  it("retries by the action's policy when neither step nor workflow has one", async () => {
    const executor = new FlakyExecutor(1);

    await runWorkflow({
      definition: definition([step("a", "first")]),
      executor,
      blockDefaults: defaults({ retry: { maxAttempts: 2 } }),
      sleep: () => Promise.resolve(),
    });

    expect(executor.calls).toHaveLength(2);
  });

  it("backs off from 5s exponentially when the action names no delay", async () => {
    const waits: number[] = [];

    await runWorkflow({
      definition: definition([step("a", "first")]),
      executor: new FlakyExecutor(99),
      blockDefaults: defaults({ retry: { maxAttempts: 4 } }),
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    expect(waits).toEqual([5_000, 10_000, 20_000]);
  });

  it("keeps the delays the action declares", async () => {
    const waits: number[] = [];

    await runWorkflow({
      definition: definition([step("a", "first")]),
      executor: new FlakyExecutor(99),
      blockDefaults: defaults({
        retry: { maxAttempts: 3, backoff: "FIXED", initialDelaySeconds: 1 },
      }),
      sleep: (ms) => {
        waits.push(ms);
        return Promise.resolve();
      },
    });

    expect(waits).toEqual([1_000, 1_000]);
  });

  it("lets the step's own retry win over the action's", async () => {
    const executor = new FlakyExecutor(99);

    await runWorkflow({
      definition: definition([step("a", "first", NO_WAIT)]),
      executor,
      blockDefaults: defaults({ retry: { maxAttempts: 1 } }),
    });

    expect(executor.calls).toHaveLength(3);
  });

  it("still clamps the action's maxAttempts", async () => {
    const executor = new FlakyExecutor(99);

    await runWorkflow({
      definition: definition([step("a", "first")]),
      executor,
      blockDefaults: defaults({ retry: { maxAttempts: 1000 } }),
      sleep: () => Promise.resolve(),
    });

    expect(executor.calls).toHaveLength(MAX_STEP_ATTEMPTS);
  });

  it("passes the action's timeout only to a step without its own", async () => {
    const executor = new FlakyExecutor(0);
    const asked: string[] = [];

    await runWorkflow({
      definition: definition(
        [
          step("a", "unset"),
          { ...step("b", "own", NO_WAIT), timeoutSeconds: 5 },
        ],
        [{ id: "e1", from: "a", to: "b", port: "next" }],
      ),
      executor,
      blockDefaults: defaults({ timeoutSeconds: 300 }, asked),
    });

    expect(executor.calls[0].defaultTimeoutSeconds).toBe(300);
    expect(executor.calls[1].defaultTimeoutSeconds).toBeUndefined();
    // A step that sets both never asks.
    expect(asked).toHaveLength(1);
  });

  it("keeps the workflow's retry when the lookup fails", async () => {
    const executor = new FlakyExecutor(99);

    const result = await runWorkflow({
      definition: definition([step("a", "first")]),
      executor,
      defaultRetry: effectiveRetryPolicy(NO_WAIT),
      blockDefaults: () => Promise.reject(new Error("describe failed")),
    });

    expect(executor.calls).toHaveLength(3);
    expect(executor.calls[0].defaultTimeoutSeconds).toBeUndefined();
    expect(result.status).toBe("FAILED");
  });

  it("runs once when the lookup fails and the workflow has no retry", async () => {
    const executor = new FlakyExecutor(99);

    await runWorkflow({
      definition: definition([step("a", "first")]),
      executor,
      blockDefaults: () => Promise.reject(new Error("describe failed")),
    });

    expect(executor.calls).toHaveLength(1);
  });

  it("still asks for the action's timeout under the workflow's retry", async () => {
    const executor = new FlakyExecutor(0);
    const asked: string[] = [];

    await runWorkflow({
      definition: definition(
        [step("a", "unset"), { ...step("b", "timed"), timeoutSeconds: 5 }],
        [{ id: "e1", from: "a", to: "b", port: "next" }],
      ),
      executor,
      defaultRetry: effectiveRetryPolicy(NO_WAIT),
      blockDefaults: defaults({ timeoutSeconds: 300 }, asked),
    });

    expect(executor.calls[0].defaultTimeoutSeconds).toBe(300);
    // Its own timeout and the workflow's retry leave nothing to ask.
    expect(asked).toHaveLength(1);
  });

  it("times the piece out by step, then action, then executor default", async () => {
    const seen: (number | undefined)[] = [];
    const executor = new ActivepiecesBlockExecutor({
      cacheDir: "/tmp/na",
      defaultTimeoutMs: 30_000,
      resolver: {
        resolve: (target) =>
          Promise.resolve({ ...target, bundleDir: "/bundle", local: false }),
      },
      worker: {
        runAction: (_request: unknown, options: { timeoutMs?: number }) => {
          seen.push(options.timeoutMs);
          return Promise.resolve({ output: null });
        },
      } as never,
    });
    const run = (timeoutSeconds: number | undefined, fallback?: number) =>
      runWorkflow({
        definition: definition([
          {
            ...step("a", "first"),
            ...(timeoutSeconds ? { timeoutSeconds } : {}),
          },
        ]),
        executor,
        blockDefaults: defaults(
          fallback ? { timeoutSeconds: fallback } : undefined,
        ),
      });

    await run(5, 300);
    await run(undefined, 300);
    await run(undefined);
    executor.dispose();

    // Remaining time after staging, so at most the resolved timeout.
    const [own, action, runtime] = seen;
    expect(own).toBeLessThanOrEqual(5_000);
    expect(own).toBeGreaterThan(4_000);
    expect(action).toBeLessThanOrEqual(300_000);
    expect(action).toBeGreaterThan(299_000);
    expect(runtime).toBeLessThanOrEqual(30_000);
    expect(runtime).toBeGreaterThan(29_000);
  });
});

describe("the run deadline", () => {
  it("cancels the run rather than failing it", async () => {
    const executor = new FlakyExecutor(0);

    const result = await runWorkflow({
      definition: definition(
        [step("a", "first"), step("b", "second")],
        [{ id: "e1", from: "a", to: "b", port: "next" }],
      ),
      executor,
      deadline: Date.now() - 1,
    });

    expect(executor.calls).toHaveLength(0);
    expect(result.status).toBe("CANCELLED");
    expect(result.error).toContain("runTimeoutSeconds");
  });

  it("stops between steps, keeping the ones that finished", async () => {
    const executor = new FlakyExecutor(0);
    // Expires once the first step has run.
    let now = Date.now();
    const deadline = now + 1;
    const result = await runWorkflow({
      definition: definition(
        [step("a", "first"), step("b", "second")],
        [{ id: "e1", from: "a", to: "b", port: "next" }],
      ),
      executor,
      deadline,
      sleep: () => Promise.resolve(),
    });
    now = Date.now();

    // Either both steps beat the clock or the run was cancelled with the
    // first one journaled; what must never happen is a FAILED run.
    expect(["SUCCEEDED", "CANCELLED"]).toContain(result.status);
    expect(now).toBeGreaterThanOrEqual(deadline - 1);
  });

  // The outcome must not hang on graph shape: a step that would only be
  // skipped runs nothing, so it is no reason to cancel a finished run.
  it("does not cancel for a step that would only be skipped", async () => {
    const deadline = Date.now() + 20;
    const executor: BlockExecutor = {
      execute: async (execution) => {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return { output: execution.config };
      },
    };

    const result = await runWorkflow({
      definition: definition(
        [step("a", "first"), step("b", "on-error")],
        [{ id: "e1", from: "a", to: "b", port: "error" }],
      ),
      executor,
      deadline,
    });

    expect(Date.now()).toBeGreaterThan(deadline);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps.map((record) => record.status)).toEqual([
      "SUCCEEDED",
      "SKIPPED",
    ]);
  });

  it("does not retry past the deadline", async () => {
    const executor = new FlakyExecutor(99);

    await runWorkflow({
      definition: definition([step("a", "first", NO_WAIT)]),
      executor,
      deadline: Date.now() - 1,
    });

    // The deadline is checked before the first step, so nothing ran at all.
    expect(executor.calls).toHaveLength(0);
  });

  // The wait used to be slept in full, with the deadline left to "the next
  // attempt's own check" — which did not exist inside the retry loop. So the
  // next attempt ran its side effect after the run had expired, and the run
  // ended FAILED rather than CANCELLED.
  it("clips the retry wait to the deadline and runs no further attempt", async () => {
    const executor = new FlakyExecutor(99);
    const slept: number[] = [];
    const longWait = {
      maxAttempts: 5,
      backoff: "FIXED",
      initialDelaySeconds: 300,
      maxDelaySeconds: 300,
      retryOn: [],
    };

    const result = await runWorkflow({
      definition: definition([step("a", "first", longWait)]),
      executor,
      // Time for the first attempt, nowhere near the five-minute backoff.
      deadline: Date.now() + 30,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });

    // One attempt: the wait outlives the run, so there is no second one.
    expect(executor.calls).toHaveLength(1);
    // And the wait was clipped to what was left, not slept in full.
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeLessThanOrEqual(30);
    // CANCELLED, not FAILED: the clock stopped the run, the workflow did not
    // fail. A CANCELLED run is not rerunnable and reads as no workflow defect.
    expect(result.status).toBe("CANCELLED");
    expect(result.error).toContain("runTimeoutSeconds");
    // The attempt that failed is still journaled, as the record of the work.
    expect(result.steps[0]).toMatchObject({ key: "first", status: "FAILED" });
  });

  it("takes no error port when the deadline cut the retry short", async () => {
    const executor = new FlakyExecutor(99);

    const result = await runWorkflow({
      definition: definition(
        [
          step("a", "first", { ...NO_WAIT, initialDelaySeconds: 60 }),
          step("b", "handler"),
        ],
        [{ id: "e-err", from: "a", to: "b", port: "error" }],
      ),
      executor,
      deadline: Date.now() + 20,
      sleep: () => Promise.resolve(),
    });

    expect(result.status).toBe("CANCELLED");
    // Nothing downstream may run after the run has ended, handler or not.
    expect(result.steps[1].status).toBe("SKIPPED");
  });
});

// Resolution reads the scope and nothing else, and no attempt changes the
// scope, so a resolution error is deterministic: retrying it burns the whole
// budget, backoff and all, on something that cannot come right.
describe("a deterministic resolution failure", () => {
  it("fails the step on the first attempt, with no retries", async () => {
    const executor = new FlakyExecutor(0);
    const slept: number[] = [];

    const result = await runWorkflow({
      definition: definition([
        step("a", "first", NO_WAIT, { n: "{{steps.nope.output.id}}" }),
      ]),
      executor,
      sleep: (ms) => {
        slept.push(ms);
        return Promise.resolve();
      },
    });

    // The executor never ran: resolution failed before the first attempt.
    expect(executor.calls).toHaveLength(0);
    // And no backoff waits were served out on the way to failing.
    expect(slept).toEqual([]);
    expect(result.status).toBe("FAILED");
    expect(result.steps[0]).toMatchObject({ key: "first", status: "FAILED" });
    // One attempt, so the record carries no attempts count at all.
    expect(result.steps[0].attempts).toBeUndefined();
  });
});

describe("an indeterminate host call", () => {
  it("records INDETERMINATE, takes no port and is never retried", async () => {
    const executor = new FlakyExecutor(
      99,
      () => new HostCallIndeterminateError("reactor.submit", 10_000),
    );

    const result = await runWorkflow({
      definition: definition(
        [step("a", "first", NO_WAIT), step("b", "handler")],
        [{ id: "e-err", from: "a", to: "b", port: "error" }],
      ),
      executor,
    });

    // One attempt: a retry would be a second write.
    expect(executor.calls).toHaveLength(1);
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("INDETERMINATE");
    expect(result.steps[0].status).toBe("INDETERMINATE");
    // The error port is NOT taken: nothing may claim to have handled a step
    // whose write may have landed.
    expect(result.steps[1].status).toBe("SKIPPED");
  });
});

describe("replaying a step whose journaled output was truncated", () => {
  it("does not re-execute it", async () => {
    const executor = new FlakyExecutor(0);

    const result = await runWorkflow({
      definition: definition([step("a", "charge")]),
      executor,
      completedSteps: new Map([["a", { port: "next", outputTruncated: true }]]),
    });

    expect(executor.calls).toHaveLength(0);
    expect(result.status).toBe("SUCCEEDED");
    expect(result.steps[0].status).toBe("REPLAYED");
    // The marker is not journaled as the step's output either.
    expect(result.steps[0].output).toBeUndefined();
  });

  it("fails the rerun by name when a later step reads its output", async () => {
    const executor = new FlakyExecutor(0);

    const result = await runWorkflow({
      definition: definition(
        [
          step("a", "charge"),
          step("b", "receipt", undefined, {
            id: "{{steps.charge.output.id}}",
          }),
        ],
        [{ id: "e1", from: "a", to: "b", port: "next" }],
      ),
      executor,
      completedSteps: new Map([["a", { port: "next", outputTruncated: true }]]),
    });

    expect(executor.calls).toHaveLength(0);
    expect(result.status).toBe("FAILED");
    expect(result.error).toContain("truncated its output");
    expect(result.error).toContain("not re-run");
  });

  // The leaf path landed ON the wrapper and was refused. The PARENT path landed
  // on the step's entry, one level above it, which looked like an ordinary
  // object - so the wrapper went over to the piece and JSON.stringify dropped
  // the reason with the symbol it hangs on. The step received a bare `{}`.
  it("refuses a parent path too, not just the leaf one", async () => {
    for (const reference of [
      "{{steps.charge}}",
      "{{steps.charge.output}}",
      "{{steps}}",
    ]) {
      const executor = new FlakyExecutor(0);

      const result = await runWorkflow({
        definition: definition(
          [
            step("a", "charge"),
            step("b", "receipt", undefined, { body: reference }),
          ],
          [{ id: "e1", from: "a", to: "b", port: "next" }],
        ),
        executor,
        completedSteps: new Map([
          ["a", { port: "next", outputTruncated: true }],
        ]),
      });

      // Nothing ran, and the failure names the truncation rather than handing
      // the piece an empty object.
      expect(executor.calls, reference).toHaveLength(0);
      expect(result.status, reference).toBe("FAILED");
      expect(result.error, reference).toContain("truncated its output");
      expect(result.steps[1], reference).toMatchObject({
        key: "receipt",
        status: "FAILED",
      });
      // And the input journaled for it carries no wrapper masquerading as data.
      expect(JSON.stringify(result.steps[1].input ?? null)).not.toContain("{}");
    }
  });
});
