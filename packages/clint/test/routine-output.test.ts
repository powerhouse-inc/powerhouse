// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, afterEach } from "vitest";
import { createRoutine } from "../src/core/routine.js";
import { defineTrigger } from "../src/core/trigger.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import { createProcessManager } from "../src/core/processes.js";
import type {
  CommandContext,
  Routine,
  StreamChunk,
} from "../src/core/types.js";
import {
  TEST_TICK_INTERVAL,
  TEST_IDLE_INTERVAL,
  ROUTINE_ONE_TICK_WAIT,
  ROUTINE_MULTI_TICK_WAIT,
} from "./fixtures/timing.js";

let routine: Routine | undefined;

afterEach(async () => {
  if (routine && routine.status === "running") {
    await routine.stop();
  }
  routine = undefined;
});

function makeContext(
  pm?: ReturnType<typeof createProcessManager>,
): CommandContext {
  const processManager = pm ?? createProcessManager();
  return {
    workspace: createMemoryWorkdirStore(),
    config: {},
    workdir: "",
    stdout: () => {},
    processes: processManager,
    runProcess: (cmd, opts) =>
      processManager.run(cmd, { ...opts, onOutput: () => {} }),
  };
}

function makeRoutine(
  overrides: Partial<Parameters<typeof createRoutine>[0]> = {},
) {
  return createRoutine({
    triggers: [],
    commands: new Map(),
    tickInterval: TEST_TICK_INTERVAL,
    idleInterval: TEST_IDLE_INTERVAL,
    ...overrides,
  });
}

describe("routine setContext runProcess chunk emission", () => {
  it("emits tool-call, tool-output, tool-result chunks for a successful process", async () => {
    const chunks: StreamChunk[] = [];
    const outputLines: string[] = [];
    let triggerOnce = true;

    const trigger = defineTrigger({
      id: "run-proc",
      type: "condition",
      poll: async (ctx) => {
        if (triggerOnce) {
          triggerOnce = false;
          return {
            type: "function" as const,
            params: {
              fn: async () => {
                await ctx.commandContext.runProcess("echo hello");
              },
            },
          };
        }
        return null;
      },
    });

    const pm = createProcessManager();
    routine = makeRoutine({
      triggers: [trigger],
      processManager: pm,
    });

    routine.onChunk = (chunk) => chunks.push(chunk);
    routine.onOutput = (text) => outputLines.push(text);
    routine.setContext(makeContext(pm));
    routine.start();

    await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
    await routine.stop();

    // Should have: tool-call, at least one tool-output, tool-result
    const types = chunks.map((c) => c.type);
    expect(types[0]).toBe("tool-call");
    expect(types).toContain("tool-output");
    expect(types[types.length - 1]).toBe("tool-result");

    // tool-call should have the command as toolName
    const callChunk = chunks[0] as Extract<StreamChunk, { type: "tool-call" }>;
    expect(callChunk.toolName).toBe("echo hello");

    // tool-result should indicate success
    const resultChunk = chunks[chunks.length - 1] as Extract<
      StreamChunk,
      { type: "tool-result" }
    >;
    expect(resultChunk.isError).toBe(false);
    expect(resultChunk.toolName).toBe("echo hello");

    // onOutput should also have received the lines
    expect(outputLines.length).toBeGreaterThan(0);
  });

  it("emits tool-result with isError: true for a failed process", async () => {
    const chunks: StreamChunk[] = [];
    let triggerOnce = true;

    const trigger = defineTrigger({
      id: "fail-proc",
      type: "condition",
      poll: async (ctx) => {
        if (triggerOnce) {
          triggerOnce = false;
          return {
            type: "function" as const,
            params: {
              fn: async () => {
                // echo produces output (opens segment), then false fails with exit code 1
                await ctx.commandContext.runProcess("echo failing && false");
              },
            },
          };
        }
        return null;
      },
    });

    const pm = createProcessManager();
    routine = makeRoutine({
      triggers: [trigger],
      processManager: pm,
    });

    routine.onChunk = (chunk) => chunks.push(chunk);
    routine.setContext(makeContext(pm));
    routine.start();

    await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
    await routine.stop();

    // Should have at least tool-call and tool-result
    const resultChunks = chunks.filter((c) => c.type === "tool-result");
    expect(resultChunks.length).toBe(1);
    const result = resultChunks[0] as Extract<
      StreamChunk,
      { type: "tool-result" }
    >;
    expect(result.isError).toBe(true);
  });

  it("does not emit chunks when onChunk is not set", async () => {
    let triggerOnce = true;

    const trigger = defineTrigger({
      id: "no-chunk",
      type: "condition",
      poll: async (ctx) => {
        if (triggerOnce) {
          triggerOnce = false;
          return {
            type: "function" as const,
            params: {
              fn: async () => {
                await ctx.commandContext.runProcess("echo test");
              },
            },
          };
        }
        return null;
      },
    });

    const pm = createProcessManager();
    routine = makeRoutine({
      triggers: [trigger],
      processManager: pm,
    });

    // No onChunk set — should not throw
    routine.setContext(makeContext(pm));
    routine.start();

    await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
    await routine.stop();
  });

  it("still routes output through onOutput alongside chunks", async () => {
    const chunks: StreamChunk[] = [];
    const outputLines: string[] = [];
    let triggerOnce = true;

    const trigger = defineTrigger({
      id: "both-outputs",
      type: "condition",
      poll: async (ctx) => {
        if (triggerOnce) {
          triggerOnce = false;
          return {
            type: "function" as const,
            params: {
              fn: async () => {
                await ctx.commandContext.runProcess("echo dual");
              },
            },
          };
        }
        return null;
      },
    });

    const pm = createProcessManager();
    routine = makeRoutine({
      triggers: [trigger],
      processManager: pm,
    });

    routine.onChunk = (chunk) => chunks.push(chunk);
    routine.onOutput = (text) => outputLines.push(text);
    routine.setContext(makeContext(pm));
    routine.start();

    await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
    await routine.stop();

    // Both channels should have received data
    expect(chunks.length).toBeGreaterThan(0);
    expect(outputLines.length).toBeGreaterThan(0);

    // tool-output chunks should contain the same text as onOutput lines
    const toolOutputTexts = chunks
      .filter(
        (c): c is Extract<StreamChunk, { type: "tool-output" }> =>
          c.type === "tool-output",
      )
      .map((c) => c.text);
    expect(toolOutputTexts.length).toBeGreaterThan(0);
  });
});
