// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, afterEach } from "vitest";
import { createRoutine } from "../src/core/routine.js";
import { createRoutineServiceAdapter } from "../src/core/routine-service.js";
import { createProcessManager } from "../src/core/processes.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import { defineTrigger } from "../src/core/trigger.js";
import type {
  CommandContext,
  Routine,
  RoutineConfig,
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

function makeConfig(overrides: Partial<RoutineConfig> = {}): RoutineConfig {
  return {
    id: "watcher",
    name: "File Watcher",
    tickInterval: TEST_TICK_INTERVAL,
    idleInterval: TEST_IDLE_INTERVAL,
    ...overrides,
  };
}

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

describe("RoutineServiceAdapter watchChunks", () => {
  it("delivers structured chunks through watchChunks", async () => {
    let triggerOnce = true;
    const trigger = defineTrigger({
      id: "chunk-trigger",
      type: "condition",
      poll: async (ctx) => {
        if (triggerOnce) {
          triggerOnce = false;
          return {
            type: "function" as const,
            params: {
              fn: async () => {
                await ctx.commandContext.runProcess("echo watched");
              },
            },
          };
        }
        return null;
      },
    });

    const pm = createProcessManager();
    routine = createRoutine({
      triggers: [trigger],
      commands: new Map(),
      tickInterval: TEST_TICK_INTERVAL,
      idleInterval: TEST_IDLE_INTERVAL,
      processManager: pm,
    });

    const adapter = createRoutineServiceAdapter(routine, makeConfig());

    const chunks: StreamChunk[] = [];
    const cleanup = adapter.watchChunks("watcher", "watcher", (chunk) =>
      chunks.push(chunk),
    );

    routine.setContext(makeContext(pm));
    await adapter.start("watcher");
    await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
    await adapter.stop("watcher");
    cleanup();

    const types = chunks.map((c) => c.type);
    expect(types).toContain("tool-call");
    expect(types).toContain("tool-output");
    expect(types).toContain("tool-result");
  });

  it("watchLogs still receives flat text alongside chunks", async () => {
    let triggerOnce = true;
    const trigger = defineTrigger({
      id: "dual-trigger",
      type: "condition",
      poll: async (ctx) => {
        if (triggerOnce) {
          triggerOnce = false;
          return {
            type: "function" as const,
            params: {
              fn: async () => {
                await ctx.commandContext.runProcess("echo logline");
              },
            },
          };
        }
        return null;
      },
    });

    const pm = createProcessManager();
    routine = createRoutine({
      triggers: [trigger],
      commands: new Map(),
      tickInterval: TEST_TICK_INTERVAL,
      idleInterval: TEST_IDLE_INTERVAL,
      processManager: pm,
    });

    const adapter = createRoutineServiceAdapter(routine, makeConfig());

    const chunks: StreamChunk[] = [];
    const logLines: string[] = [];
    const cleanupChunks = adapter.watchChunks("watcher", "watcher", (chunk) =>
      chunks.push(chunk),
    );
    const cleanupLogs = adapter.watchLogs("watcher", "watcher", (line) =>
      logLines.push(line),
    );

    routine.setContext(makeContext(pm));
    await adapter.start("watcher");
    await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
    await adapter.stop("watcher");
    cleanupChunks();
    cleanupLogs();

    // Both channels should have data
    expect(chunks.length).toBeGreaterThan(0);
    expect(logLines.length).toBeGreaterThan(0);
  });

  it("unsubscribe stops delivering chunks", async () => {
    let triggerCount = 0;
    const trigger = defineTrigger({
      id: "unsub-trigger",
      type: "condition",
      poll: async (ctx) => {
        triggerCount++;
        if (triggerCount <= 2) {
          return {
            type: "function" as const,
            params: {
              fn: async () => {
                await ctx.commandContext.runProcess("echo tick");
              },
            },
          };
        }
        return null;
      },
    });

    const pm = createProcessManager();
    routine = createRoutine({
      triggers: [trigger],
      commands: new Map(),
      tickInterval: TEST_TICK_INTERVAL,
      idleInterval: TEST_IDLE_INTERVAL,
      processManager: pm,
    });

    const adapter = createRoutineServiceAdapter(routine, makeConfig());

    const chunks: StreamChunk[] = [];
    const cleanup = adapter.watchChunks("watcher", "watcher", (chunk) =>
      chunks.push(chunk),
    );

    routine.setContext(makeContext(pm));
    await adapter.start("watcher");
    await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));

    // Unsubscribe after first tick
    const countBeforeUnsub = chunks.length;
    cleanup();

    await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
    await adapter.stop("watcher");

    // Should not have received significantly more chunks after unsubscribe
    // (may get a few in-flight ones, but no new full sequences)
    expect(chunks.length).toBe(countBeforeUnsub);
  });

  it("throws for unknown service on watchChunks", () => {
    routine = createRoutine({
      triggers: [],
      commands: new Map(),
      tickInterval: TEST_TICK_INTERVAL,
      idleInterval: TEST_IDLE_INTERVAL,
    });
    const adapter = createRoutineServiceAdapter(routine, makeConfig());
    expect(() => adapter.watchChunks("unknown", "x", () => {})).toThrow(
      "Unknown service",
    );
  });
});
