import { describe, it, expect, vi } from "vitest";
import { z } from "zod";
import { initLifecycle } from "../src/core/lifecycle.js";
import { IDENTITY_WRAPS, composeWraps } from "../src/core/wraps.js";
import { createEventBus } from "../src/core/events.js";
import { createLogger } from "../src/core/logger.js";
import type {
  LifecycleHook,
  LifecycleInitContext,
  BootTimings,
} from "../src/core/types.js";

function makeCtx(): LifecycleInitContext {
  const bootTimings: BootTimings = {
    bootStartedAt: 1000,
    configResolvedAt: 1100,
    lifecycleInitStartedAt: 1200,
  };
  return {
    config: {},
    cliName: "test-cli",
    cliVersion: "1.0.0",
    log: createLogger("error", () => {}),
    eventBus: createEventBus(),
    userStoreFolder: "/tmp/test-store",
    isInteractive: false,
    bootTimings,
  };
}

describe("initLifecycle", () => {
  it("returns IDENTITY_WRAPS and no-op shutdown when no hooks are registered", async () => {
    const result = await initLifecycle([], makeCtx());
    expect(result.wraps).toBe(IDENTITY_WRAPS);
    expect(result.handles).toEqual([]);
    await expect(result.shutdown()).resolves.toBeUndefined();
  });

  it("calls each hook onInit in declaration order with the same ctx", async () => {
    const calls: string[] = [];
    const ctx = makeCtx();
    const hookA: LifecycleHook = {
      name: "A",
      onInit: (c) => {
        calls.push(`A:${c.cliName}`);
        return {};
      },
    };
    const hookB: LifecycleHook = {
      name: "B",
      onInit: (c) => {
        calls.push(`B:${c.cliName}`);
        return {};
      },
    };
    await initLifecycle([hookA, hookB], ctx);
    expect(calls).toEqual(["A:test-cli", "B:test-cli"]);
  });

  it("composes contributions from multiple hooks middleware-style", async () => {
    const trace: string[] = [];
    const hookA: LifecycleHook = {
      name: "A",
      onInit: () => ({
        contribute: {
          command: async (id, inner) => {
            trace.push(`A-pre:${id}`);
            const r = await inner();
            trace.push(`A-post:${id}`);
            return r;
          },
        },
      }),
    };
    const hookB: LifecycleHook = {
      name: "B",
      onInit: () => ({
        contribute: {
          command: async (id, inner) => {
            trace.push(`B-pre:${id}`);
            const r = await inner();
            trace.push(`B-post:${id}`);
            return r;
          },
        },
      }),
    };
    const { wraps } = await initLifecycle([hookA, hookB], makeCtx());
    await wraps.command("cmd1", async () => {
      trace.push("inner");
      return 42;
    });
    // A's wrap is outermost (registered first); B's wrap runs inside A.
    expect(trace).toEqual([
      "A-pre:cmd1",
      "B-pre:cmd1",
      "inner",
      "B-post:cmd1",
      "A-post:cmd1",
    ]);
  });

  it("calls shutdown in reverse-init order", async () => {
    const calls: string[] = [];
    const hookA: LifecycleHook = {
      name: "A",
      onInit: () => ({
        shutdown: async () => {
          calls.push("A-shutdown");
        },
      }),
    };
    const hookB: LifecycleHook = {
      name: "B",
      onInit: () => ({
        shutdown: async () => {
          calls.push("B-shutdown");
        },
      }),
    };
    const result = await initLifecycle([hookA, hookB], makeCtx());
    await result.shutdown();
    expect(calls).toEqual(["B-shutdown", "A-shutdown"]);
  });

  it("swallows shutdown errors and writes to stderr — one hook failing does not block others", async () => {
    const stderrSpy = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const calls: string[] = [];
    const hookA: LifecycleHook = {
      name: "A",
      onInit: () => ({
        shutdown: async () => {
          calls.push("A-shutdown");
        },
      }),
    };
    const hookB: LifecycleHook = {
      name: "B",
      onInit: () => ({
        shutdown: async () => {
          throw new Error("B-broke");
        },
      }),
    };
    const result = await initLifecycle([hookA, hookB], makeCtx());
    await result.shutdown();
    expect(calls).toEqual(["A-shutdown"]);
    expect(
      stderrSpy.mock.calls.some((c) => String(c[0]).includes("B-broke")),
    ).toBe(true);
    stderrSpy.mockRestore();
  });

  it("handles missing shutdown gracefully", async () => {
    const hook: LifecycleHook = { name: "A", onInit: () => ({}) };
    const result = await initLifecycle([hook], makeCtx());
    await expect(result.shutdown()).resolves.toBeUndefined();
  });

  it("awaits async onInit", async () => {
    let resolved = false;
    const hook: LifecycleHook = {
      name: "A",
      onInit: async () => {
        await new Promise((r) => setTimeout(r, 5));
        resolved = true;
        return {};
      },
    };
    await initLifecycle([hook], makeCtx());
    expect(resolved).toBe(true);
  });

  it("propagates onInit errors — a failing plugin halts CLI startup", async () => {
    const hook: LifecycleHook = {
      name: "broken",
      onInit: () => {
        throw new Error("init failed");
      },
    };
    await expect(initLifecycle([hook], makeCtx())).rejects.toThrow(
      "init failed",
    );
  });
});

describe("composeWraps + IDENTITY_WRAPS", () => {
  it("IDENTITY_WRAPS passes through every wrap", async () => {
    const result = await IDENTITY_WRAPS.command("x", async () => "r");
    expect(result).toBe("r");

    const tool = { execute: () => "out" };
    expect(IDENTITY_WRAPS.tool("t", tool)).toBe(tool);

    const inner = async function* () {
      yield 1;
      yield 2;
    };
    expect(IDENTITY_WRAPS.agentStream(inner, { agentId: "a" })).toBe(inner);

    const it = await IDENTITY_WRAPS.routineIteration(
      { index: 0 },
      async () => "rt",
    );
    expect(it).toBe("rt");
  });

  it("composeWraps([]) returns IDENTITY_WRAPS", () => {
    expect(composeWraps([])).toBe(IDENTITY_WRAPS);
  });

  it("composeWraps with one partial contribution falls through to identity for unspecified wraps", async () => {
    const wraps = composeWraps([
      { contribute: { tool: (name, t) => ({ ...t, marked: name }) as any } },
    ]);
    // tool is overridden
    const tagged = wraps.tool("foo", { execute: () => "x" } as any) as any;
    expect(tagged.marked).toBe("foo");
    // command falls through to identity
    expect(await wraps.command("y", async () => "r")).toBe("r");
  });

  it("agentStream composition wraps inner-to-outer", async () => {
    const calls: string[] = [];
    const trackingWrap =
      (label: string) =>
      <P, O, T>(inner: (p: P, o?: O) => AsyncGenerator<T>) =>
        async function* (p: P, o?: O) {
          calls.push(`${label}:start`);
          for await (const chunk of inner(p, o)) yield chunk;
          calls.push(`${label}:end`);
        };
    const wraps = composeWraps([
      { contribute: { agentStream: trackingWrap("A") } },
      { contribute: { agentStream: trackingWrap("B") } },
    ]);
    const inner = async function* () {
      yield 1;
    };
    const wrapped = wraps.agentStream(inner, { agentId: "x" });
    for await (const _ of wrapped(null as never)) {
      /* drain */
    }
    expect(calls).toEqual(["B:start", "A:start", "A:end", "B:end"]);
  });

  it("routineIteration composition runs outer wrap around inner", async () => {
    const calls: string[] = [];
    const wraps = composeWraps([
      {
        contribute: {
          routineIteration: async (_a, inner) => {
            calls.push("A-pre");
            const r = await inner();
            calls.push("A-post");
            return r;
          },
        },
      },
      {
        contribute: {
          routineIteration: async (_a, inner) => {
            calls.push("B-pre");
            const r = await inner();
            calls.push("B-post");
            return r;
          },
        },
      },
    ]);
    await wraps.routineIteration({ index: 0 }, async () => {
      calls.push("body");
    });
    expect(calls).toEqual(["A-pre", "B-pre", "body", "B-post", "A-post"]);
  });
});
