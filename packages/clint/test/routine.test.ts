// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, afterEach } from "vitest";
import { createRoutine } from "../src/core/routine.js";
import { defineTrigger } from "../src/core/trigger.js";
import { defineCommand } from "../src/core/command.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import { createEventBus } from "../src/core/events.js";
import { z } from "zod";
import type { Routine } from "../src/core/types.js";
import {
  TEST_TICK_INTERVAL,
  TEST_IDLE_INTERVAL,
  ROUTINE_ONE_TICK_WAIT,
  ROUTINE_MULTI_TICK_WAIT,
} from "./fixtures/timing.js"; // plain JS — avoids rootDir issues

let routine: Routine | undefined;

afterEach(async () => {
  if (routine && routine.status === "running") {
    await routine.stop();
  }
  routine = undefined;
});

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

describe("createRoutine", () => {
  describe("state machine", () => {
    it("starts in init status", () => {
      routine = makeRoutine();
      expect(routine.status).toBe("init");
    });

    it("transitions to running on start()", async () => {
      routine = makeRoutine();
      routine.start();
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      expect(routine.status).toBe("running");
    });

    it("transitions to ready on stop()", async () => {
      routine = makeRoutine();
      routine.start();
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      await routine.stop();
      expect(routine.status).toBe("ready");
    });

    it("can restart after stopping", async () => {
      routine = makeRoutine();
      routine.start();
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      await routine.stop();
      expect(routine.status).toBe("ready");
      routine.start();
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      expect(routine.status).toBe("running");
    });

    it("start() is idempotent when already running", async () => {
      routine = makeRoutine();
      routine.start();
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      routine.start(); // should not throw
      expect(routine.status).toBe("running");
    });

    it("stop() is a no-op when not running", async () => {
      routine = makeRoutine();
      await routine.stop(); // should not throw
      expect(routine.status).toBe("init");
    });
  });

  describe("trigger setup", () => {
    it("calls trigger setup before first poll", async () => {
      let setupCalled = false;
      const trigger = defineTrigger({
        id: "setup-test",
        type: "condition",
        setup: async () => {
          setupCalled = true;
        },
        poll: async () => null,
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();
      expect(setupCalled).toBe(true);
    });

    it("calls state() initializer exactly once before setup", async () => {
      let stateCalls = 0;
      let setupStateValue: unknown;

      const trigger = defineTrigger<{ pending: number }>({
        id: "state-init",
        type: "condition",
        state: () => {
          stateCalls++;
          return { pending: 42 };
        },
        setup: async (ctx) => {
          setupStateValue = ctx.state.pending;
        },
        poll: async () => null,
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();

      expect(stateCalls).toBe(1);
      expect(setupStateValue).toBe(42);
    });

    it("defaults to {} when no state initializer is provided", async () => {
      let observedState: unknown;

      const trigger = defineTrigger({
        id: "no-state-init",
        type: "condition",
        setup: async (ctx) => {
          observedState = { ...ctx.state };
        },
        poll: async () => null,
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();

      expect(observedState).toEqual({});
    });

    it("provides state object to trigger context", async () => {
      let stateValue: unknown;
      const trigger = defineTrigger({
        id: "state-test",
        type: "condition",
        setup: async (ctx) => {
          ctx.state.counter = 0;
        },
        poll: async (ctx) => {
          (ctx.state.counter as number)++;
          stateValue = ctx.state.counter;
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(typeof stateValue).toBe("number");
      expect(stateValue as number).toBeGreaterThan(0);
    });
  });

  describe("work item execution", () => {
    it("executes function work items", async () => {
      let executed = false;
      let triggerFired = false;

      const trigger = defineTrigger({
        id: "fn-trigger",
        type: "condition",
        poll: async () => {
          if (!triggerFired) {
            triggerFired = true;
            return {
              type: "function" as const,
              params: {
                fn: async () => {
                  executed = true;
                },
              },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(executed).toBe(true);
    });

    it("dispatches command work items", async () => {
      let buildCalled = false;
      let triggerFired = false;

      const trigger = defineTrigger({
        id: "cmd-trigger",
        type: "condition",
        poll: async () => {
          if (!triggerFired) {
            triggerFired = true;
            return {
              type: "command" as const,
              params: { commandId: "build", args: {} },
            };
          }
          return null;
        },
      });

      const buildCmd = defineCommand({
        id: "build",
        description: "Build",
        inputSchema: z.object({}),
        execute: async () => {
          buildCalled = true;
          return "ok";
        },
      });

      routine = makeRoutine({
        triggers: [trigger],
        commands: new Map([["build", buildCmd]]),
        context: {
          workspace: createMemoryWorkdirStore(),
          config: {},
          workdir: "",
          stdout: () => {},
        },
      });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(buildCalled).toBe(true);
    });

    it("calls onSuccess on successful work item", async () => {
      let successCalled = false;
      let triggerFired = false;

      const trigger = defineTrigger({
        id: "success-trigger",
        type: "condition",
        poll: async () => {
          if (!triggerFired) {
            triggerFired = true;
            return {
              type: "function" as const,
              params: { fn: async () => "result" },
              callbacks: {
                onSuccess: () => {
                  successCalled = true;
                },
              },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(successCalled).toBe(true);
    });

    it("calls onFailure on failed work item", async () => {
      let failureCalled = false;
      let triggerFired = false;

      const trigger = defineTrigger({
        id: "fail-trigger",
        type: "condition",
        poll: async () => {
          if (!triggerFired) {
            triggerFired = true;
            return {
              type: "function" as const,
              params: {
                fn: async () => {
                  throw new Error("boom");
                },
              },
              callbacks: {
                onFailure: () => {
                  failureCalled = true;
                },
              },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(failureCalled).toBe(true);
    });

    it("continues loop after work item failure", async () => {
      let pollCount = 0;

      const trigger = defineTrigger({
        id: "continue-trigger",
        type: "condition",
        poll: async () => {
          pollCount++;
          if (pollCount === 1) {
            return {
              type: "function" as const,
              params: {
                fn: async () => {
                  throw new Error("fail");
                },
              },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) =>
        setTimeout(r, ROUTINE_MULTI_TICK_WAIT + TEST_TICK_INTERVAL),
      );
      await routine.stop();
      expect(pollCount).toBeGreaterThan(1);
    });
  });

  describe("error handling", () => {
    it("swallows trigger poll errors and continues", async () => {
      let pollCount = 0;
      const trigger = defineTrigger({
        id: "error-trigger",
        type: "condition",
        poll: async () => {
          pollCount++;
          if (pollCount === 1) throw new Error("poll error");
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(pollCount).toBeGreaterThan(1);
    });

    it("reports unknown work item type via onFailure", async () => {
      let failureError: Error | undefined;
      let triggerFired = false;

      const trigger = defineTrigger({
        id: "bad-type-trigger",
        type: "condition",
        poll: async () => {
          if (!triggerFired) {
            triggerFired = true;
            return {
              type: "unknown-type" as any,
              params: {},
              callbacks: {
                onFailure: (err: Error) => {
                  failureError = err;
                },
              },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(failureError?.message).toContain("Unknown work item type");
    });

    it("reports unknown command via onFailure", async () => {
      let failureError: Error | undefined;
      let triggerFired = false;

      const trigger = defineTrigger({
        id: "bad-cmd-trigger",
        type: "condition",
        poll: async () => {
          if (!triggerFired) {
            triggerFired = true;
            return {
              type: "command" as const,
              params: { commandId: "nonexistent", args: {} },
              callbacks: {
                onFailure: (err: Error) => {
                  failureError = err;
                },
              },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(failureError?.message).toContain("Unknown command");
    });
  });

  describe("config access", () => {
    it("passes config to trigger context", async () => {
      let receivedConfig: Record<string, unknown> = {};

      const trigger = defineTrigger({
        id: "config-trigger",
        type: "condition",
        poll: async (ctx) => {
          receivedConfig = ctx.context.config as Record<string, unknown>;
          return null;
        },
      });

      routine = makeRoutine({
        triggers: [trigger],
        context: {
          workspace: createMemoryWorkdirStore(),
          config: { watchDir: "./src" },
          workdir: "",
          stdout: () => {},
        },
      });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();
      expect(receivedConfig.watchDir).toBe("./src");
    });
  });

  describe("command context enrichment", () => {
    it("provides emit to commands dispatched from routine", async () => {
      let emitFn: unknown;
      let triggerFired = false;
      const bus = createEventBus();

      const trigger = defineTrigger({
        id: "emit-cmd-trigger",
        type: "condition",
        poll: async () => {
          if (!triggerFired) {
            triggerFired = true;
            return {
              type: "command" as const,
              params: { commandId: "check", args: {} },
            };
          }
          return null;
        },
      });

      const checkCmd = defineCommand({
        id: "check",
        description: "Check emit",
        inputSchema: z.object({}),
        execute: async (_, ctx) => {
          emitFn = ctx.emit;
          return "ok";
        },
      });

      routine = makeRoutine({
        triggers: [trigger],
        commands: new Map([["check", checkCmd]]),
        context: {
          workspace: createMemoryWorkdirStore(),
          config: {},
          workdir: "",
          stdout: () => {},
        },
        eventBus: bus,
      });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();
      expect(typeof emitFn).toBe("function");
    });
  });

  describe("event bus integration", () => {
    it("trigger context emit publishes to shared event bus", async () => {
      const bus = createEventBus();
      let eventReceived = false;
      let triggerFired = false;

      bus.on("test:event", () => {
        eventReceived = true;
      });

      const trigger = defineTrigger({
        id: "emit-trigger",
        type: "condition",
        poll: async (ctx) => {
          if (!triggerFired) {
            triggerFired = true;
            ctx.context.emit!("test:event", { ok: true });
          }
          return null;
        },
      });

      routine = makeRoutine({
        triggers: [trigger],
        eventBus: bus,
      });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();
      expect(eventReceived).toBe(true);
    });
  });

  describe("onOutput", () => {
    it("calls onOutput with text from command result objects", async () => {
      const outputLines: string[] = [];
      let triggerOnce = true;

      const trigger = defineTrigger({
        id: "once",
        type: "condition",
        poll: async () => {
          if (triggerOnce) {
            triggerOnce = false;
            return { type: "command" as const, params: { commandId: "say" } };
          }
          return null;
        },
      });

      const say = defineCommand({
        id: "say",
        description: "Say something",
        inputSchema: z.object({}),
        execute: async () => ({ text: "hello from routine" }),
      });

      routine = makeRoutine({
        triggers: [trigger],
        commands: new Map([["say", say]]),
      });
      routine.onOutput = (text) => outputLines.push(text);

      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();

      expect(outputLines).toContain("hello from routine");
    });

    it("calls onOutput with stringified non-object results", async () => {
      const outputLines: string[] = [];
      let triggerOnce = true;

      const trigger = defineTrigger({
        id: "once",
        type: "condition",
        poll: async () => {
          if (triggerOnce) {
            triggerOnce = false;
            return {
              type: "function" as const,
              params: { fn: async () => 42 },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.onOutput = (text) => outputLines.push(text);

      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();

      expect(outputLines).toContain("42");
    });

    it("does not call onOutput when result is null", async () => {
      const outputLines: string[] = [];
      let triggerOnce = true;

      const trigger = defineTrigger({
        id: "once",
        type: "condition",
        poll: async () => {
          if (triggerOnce) {
            triggerOnce = false;
            return {
              type: "function" as const,
              params: { fn: async () => null },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.onOutput = (text) => outputLines.push(text);

      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();

      expect(outputLines).toEqual([]);
    });

    it("does not call onOutput when no callback is set", async () => {
      let triggerOnce = true;

      const trigger = defineTrigger({
        id: "once",
        type: "condition",
        poll: async () => {
          if (triggerOnce) {
            triggerOnce = false;
            return {
              type: "function" as const,
              params: { fn: async () => "silent" },
            };
          }
          return null;
        },
      });

      // No onOutput set — should not throw
      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();
    });
  });

  describe("trigger teardown", () => {
    it("calls teardown on all triggers when routine stops", async () => {
      const teardownOrder: string[] = [];

      const t1 = defineTrigger({
        id: "td-1",
        type: "condition",
        poll: async () => null,
        teardown: async () => {
          teardownOrder.push("td-1");
        },
      });

      const t2 = defineTrigger({
        id: "td-2",
        type: "condition",
        poll: async () => null,
        teardown: async () => {
          teardownOrder.push("td-2");
        },
      });

      routine = makeRoutine({ triggers: [t1, t2] });
      routine.start();
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      await routine.stop();

      expect(teardownOrder).toEqual(["td-1", "td-2"]);
    });

    it("passes trigger context to teardown", async () => {
      let teardownState: unknown;

      const trigger = defineTrigger({
        id: "td-ctx",
        type: "condition",
        setup: async (ctx) => {
          ctx.state.key = "value";
        },
        poll: async () => null,
        teardown: async (ctx) => {
          teardownState = ctx.state.key;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();

      expect(teardownState).toBe("value");
    });

    it("swallows teardown errors and continues with remaining triggers", async () => {
      const teardownOrder: string[] = [];

      const t1 = defineTrigger({
        id: "td-err-1",
        type: "condition",
        poll: async () => null,
        teardown: async () => {
          throw new Error("boom");
        },
      });

      const t2 = defineTrigger({
        id: "td-err-2",
        type: "condition",
        poll: async () => null,
        teardown: async () => {
          teardownOrder.push("td-err-2");
        },
      });

      routine = makeRoutine({ triggers: [t1, t2] });
      routine.start();
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      await routine.stop();

      // t2 teardown still called despite t1 error
      expect(teardownOrder).toEqual(["td-err-2"]);
    });

    it("does not call teardown for triggers without it", async () => {
      const trigger = defineTrigger({
        id: "no-td",
        type: "condition",
        poll: async () => null,
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      // Should not throw
      await routine.stop();
      expect(routine.status).toBe("ready");
    });
  });

  describe("triggerIds and queueLength", () => {
    it("exposes trigger IDs", () => {
      const t1 = defineTrigger({
        id: "a",
        type: "condition",
        poll: async () => null,
      });
      const t2 = defineTrigger({
        id: "b",
        type: "condition",
        poll: async () => null,
      });
      routine = makeRoutine({ triggers: [t1, t2] });
      expect(routine.triggerIds).toEqual(["a", "b"]);
    });

    it("exposes queue length (starts at 0)", () => {
      routine = makeRoutine();
      expect(routine.queueLength).toBe(0);
    });
  });

  describe("setContext", () => {
    it("updates the context used by command execution", async () => {
      let receivedConfig: Record<string, unknown> = {};
      let triggerOnce = true;

      const trigger = defineTrigger({
        id: "once",
        type: "condition",
        poll: async () => {
          if (triggerOnce) {
            triggerOnce = false;
            return { type: "command" as const, params: { commandId: "check" } };
          }
          return null;
        },
      });

      const check = defineCommand({
        id: "check",
        description: "Check config",
        inputSchema: z.object({}),
        execute: async (_, { config }) => {
          receivedConfig = config;
          return null;
        },
      });

      routine = makeRoutine({
        triggers: [trigger],
        commands: new Map([["check", check]]),
      });

      routine.setContext({
        workspace: createMemoryWorkdirStore(),
        config: { key: "updated-value" },
        workdir: "",
        stdout: () => {},
      });

      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();

      expect(receivedConfig).toEqual({ key: "updated-value" });
    });
  });

  describe("trigger context capabilities", () => {
    it("reactor() and agent() return undefined when capabilities not set", async () => {
      let capturedCtx: any;
      const trigger = defineTrigger({
        id: "cap-test",
        description: "test",
        setup: async (ctx) => {
          capturedCtx = ctx;
        },
        poll: async () => [],
      });

      routine = makeRoutine({ triggers: [trigger] });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await routine.stop();

      // No capabilities were set → reactor/agent return undefined
      expect(capturedCtx).toBeDefined();
      const reactor = await capturedCtx.reactor();
      const agent = await capturedCtx.agent();
      expect(reactor).toBeUndefined();
      expect(agent).toBeUndefined();
    });
  });

  describe("command work items", () => {
    it("executeWorkItem provides emit on extended context", async () => {
      const bus = createEventBus();
      const emittedEvents: Array<{ event: string; data: unknown }> = [];
      bus.on("test-event", (data) =>
        emittedEvents.push({ event: "test-event", data }),
      );

      let capturedCtx: any;
      const cmd = defineCommand({
        id: "emit-test",
        description: "emits an event",
        inputSchema: z.object({}),
        execute: async (_input, ctx) => {
          capturedCtx = ctx;
          ctx.emit?.("test-event", { hello: "world" });
          return {};
        },
      });

      // Only emit a work item on the first poll to avoid repeated execution
      let polled = false;
      const trigger = defineTrigger({
        id: "cmd-trigger",
        description: "test",
        setup: async () => {},
        poll: async () => {
          if (polled) return null;
          polled = true;
          return {
            type: "command" as const,
            params: { commandId: "emit-test", args: {} },
          };
        },
      });

      routine = makeRoutine({
        triggers: [trigger],
        commands: new Map([["emit-test", cmd]]),
        eventBus: bus,
      });
      routine.start();
      // Wait long enough for setup + poll + execute cycle
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT * 2));
      await routine.stop();

      expect(capturedCtx).toBeDefined();
      expect(typeof capturedCtx.emit).toBe("function");
      expect(emittedEvents.length).toBeGreaterThan(0);
      expect(emittedEvents[0]!.data).toEqual({ hello: "world" });
    });
  });

  describe("wraps capability", () => {
    it("invokes wraps.routineIteration once per loop iteration with monotonic index", async () => {
      const iterations: Array<{ index: number }> = [];
      const spyWraps = {
        command: (_id: string, inner: () => Promise<unknown>) => inner(),
        agentStream: ((inner: unknown) => inner) as any,
        tool: ((_n: string, t: unknown) => t) as any,
        routineIteration: async <R>(
          attrs: { index: number },
          inner: () => Promise<R>,
        ): Promise<R> => {
          iterations.push({ ...attrs });
          return inner();
        },
      };

      routine = makeRoutine();
      routine.setCapabilities({ wraps: spyWraps });
      routine.start();
      await new Promise((r) => setTimeout(r, ROUTINE_MULTI_TICK_WAIT));
      await routine.stop();

      expect(iterations.length).toBeGreaterThanOrEqual(2);
      // Indices should be 0, 1, 2, … (monotonic, starting at 0)
      for (let i = 0; i < iterations.length; i++) {
        expect(iterations[i]!.index).toBe(i);
      }
    });
  });
});
