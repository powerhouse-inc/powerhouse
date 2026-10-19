// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { createTypes } from "../src/core/types-binding.js";

describe("createTypes", () => {
  const configSchema = z.object({ port: z.number(), host: z.string() });

  it("returns a typed factory bundle with defineCommand/defineTrigger/defineService", () => {
    const factory = createTypes({ configSchema });
    expect(typeof factory.defineCommand).toBe("function");
    expect(typeof factory.defineTrigger).toBe("function");
    expect(typeof factory.defineService).toBe("function");
  });

  it("defineCommand runtime is a pass-through that preserves fields", () => {
    const { defineCommand } = createTypes({ configSchema });
    const execute = async () => null;
    const cmd = defineCommand({
      id: "c",
      description: "test",
      inputSchema: z.object({ x: z.string() }),
      execute,
    });
    expect(cmd.id).toBe("c");
    expect(cmd.description).toBe("test");
    expect(cmd.execute).toBe(execute);
  });

  it("defineTrigger runtime is a pass-through that preserves fields", () => {
    const { defineTrigger } = createTypes({ configSchema });
    const state = () => ({ pending: 0 });
    const poll = async () => null;
    const trigger = defineTrigger<{ pending: number }>({
      id: "t",
      type: "condition",
      state,
      poll,
    });
    expect(trigger.id).toBe("t");
    expect(trigger.type).toBe("condition");
    expect(trigger.state).toBe(state);
    expect(trigger.poll).toBe(poll);
  });

  it("defineService runtime is a pass-through that preserves fields", () => {
    const { defineService } = createTypes({ configSchema });
    const env = () => ({ PORT: "3000" });
    const svc = defineService({
      id: "s",
      command: "my-cmd",
      env,
    });
    expect(svc.id).toBe("s");
    expect(svc.command).toBe("my-cmd");
    expect(svc.env).toBe(env);
  });

  it("accepts an optional registry without affecting runtime", () => {
    const registry = { "test/doc": {} } as Record<string, never>;
    const factory = createTypes({ configSchema, registry });
    expect(typeof factory.defineTrigger).toBe("function");
  });
});
