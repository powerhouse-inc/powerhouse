// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect } from "vitest";
import { z } from "zod";
import { defineCommand } from "../src/core/command.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";

describe("defineCommand", () => {
  const cmd = defineCommand({
    id: "test-cmd",
    description: "A test command",
    inputSchema: z.object({
      name: z.string().describe("A name"),
      count: z.number().default(1).describe("Repeat count"),
    }),
    execute: async ({ name, count }) => `${name} x${count}`,
  });

  it("preserves id and description", () => {
    expect(cmd.id).toBe("test-cmd");
    expect(cmd.description).toBe("A test command");
  });

  it("preserves the input schema", () => {
    const shape = cmd.inputSchema.shape;
    expect(shape).toHaveProperty("name");
    expect(shape).toHaveProperty("count");
  });

  it("executes with parsed input", async () => {
    const ctx = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
    };
    const result = await cmd.execute({ name: "Alice", count: 3 }, ctx);
    expect(result).toBe("Alice x3");
  });

  describe("positional", () => {
    it("accepts a valid positional config", () => {
      const c = defineCommand({
        id: "pos",
        description: "p",
        inputSchema: z.object({
          title: z.string(),
          priority: z.number().default(1),
        }),
        positional: ["title", "priority"],
        execute: async () => "ok",
      });
      expect(c.positional).toEqual(["title", "priority"]);
    });

    it("throws when positional key is not in inputSchema", () => {
      expect(() =>
        defineCommand({
          id: "pos",
          description: "p",
          inputSchema: z.object({ title: z.string() }),
          positional: ["missing"],
          execute: async () => "ok",
        }),
      ).toThrow("positional field 'missing' is not in inputSchema");
    });

    it("throws when required positional follows optional", () => {
      expect(() =>
        defineCommand({
          id: "pos",
          description: "p",
          inputSchema: z.object({
            title: z.string().optional(),
            priority: z.number(),
          }),
          positional: ["title", "priority"],
          execute: async () => "ok",
        }),
      ).toThrow(
        "required positional 'priority' may not follow an optional positional",
      );
    });

    it("throws when a positional key appears twice", () => {
      expect(() =>
        defineCommand({
          id: "pos",
          description: "p",
          inputSchema: z.object({ title: z.string() }),
          positional: ["title", "title"],
          execute: async () => "ok",
        }),
      ).toThrow("listed more than once");
    });
  });
});
