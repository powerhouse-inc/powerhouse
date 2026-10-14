import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  defineCommand,
  getCompletions,
  getGhostSuggestion,
  getCompletionSuffix,
  applyCompletion,
} from "../src/index.js";

describe("getCompletions", () => {
  const greet = defineCommand({
    id: "greet",
    description: "Greet someone",
    inputSchema: z.object({
      name: z.string().describe("Name"),
      loud: z.boolean().default(false).describe("Shout"),
    }),
    execute: async ({ name, loud }) =>
      loud ? `HELLO, ${name}!` : `Hello, ${name}!`,
  });

  const list = defineCommand({
    id: "list",
    description: "List items",
    inputSchema: z.object({
      filter: z
        .enum(["all", "open", "done"])
        .default("open")
        .describe("Filter"),
    }),
    execute: async () => "items",
  });

  const commands = [greet, list];

  describe("command name completion", () => {
    it("completes partial command name", () => {
      expect(getCompletions("/gr", commands)).toEqual(["/greet"]);
    });

    it("completes with all matches", () => {
      const result = getCompletions("/l", commands);
      expect(result).toContain("/list");
    });

    it("completes / with all commands and builtins", () => {
      const result = getCompletions("/", commands);
      expect(result).toContain("/greet");
      expect(result).toContain("/list");
      expect(result).not.toContain("/help"); // help is no longer a builtin; cli-docs is a command
      expect(result).toContain("/exit");
      expect(result).toContain("/quit");
    });

    it("returns empty for no match", () => {
      expect(getCompletions("/xyz", commands)).toEqual([]);
    });

    it("returns empty for non-/ input", () => {
      expect(getCompletions("hello", commands)).toEqual([]);
    });
  });

  describe("flag name completion", () => {
    it("completes flag names for a command", () => {
      expect(getCompletions("/greet --na", commands)).toEqual(["--name"]);
    });

    it("completes all flags for --", () => {
      const result = getCompletions("/greet --", commands);
      expect(result).toContain("--name");
      expect(result).toContain("--loud");
    });

    it("suggests flags after trailing space", () => {
      const result = getCompletions("/greet ", commands);
      expect(result).toContain("--name");
      expect(result).toContain("--loud");
    });

    it("excludes already-used flags", () => {
      const result = getCompletions("/greet --name Alice --", commands);
      expect(result).not.toContain("--name");
      expect(result).toContain("--loud");
    });

    it("suggests remaining flags after trailing space with used flags", () => {
      const result = getCompletions("/greet --name Alice ", commands);
      expect(result).not.toContain("--name");
      expect(result).toContain("--loud");
    });

    it("suggests remaining flags after boolean flag with trailing space", () => {
      const result = getCompletions("/greet --loud ", commands);
      expect(result).toContain("--name");
      expect(result).not.toContain("--loud");
    });

    it("suggests flags after single dash", () => {
      const result = getCompletions("/greet -", commands);
      expect(result).toContain("--name");
      expect(result).toContain("--loud");
    });
  });

  describe("enum value completion", () => {
    it("completes enum values for a flag", () => {
      expect(getCompletions("/list --filter d", commands)).toEqual(["done"]);
    });

    it("completes all enum values for trailing space after flag", () => {
      const result = getCompletions("/list --filter ", commands);
      expect(result).toContain("all");
      expect(result).toContain("open");
      expect(result).toContain("done");
    });

    it("returns empty for non-enum field", () => {
      expect(getCompletions("/greet --name A", commands)).toEqual([]);
    });
  });

  describe("quote handling", () => {
    it("returns empty inside quoted string", () => {
      expect(getCompletions('/greet --name "Alice', commands)).toEqual([]);
    });

    it("returns completions after closed quote", () => {
      const result = getCompletions('/greet --name "Alice" --', commands);
      expect(result).toContain("--loud");
    });
  });

  describe("edge cases", () => {
    it("returns empty for unknown command args", () => {
      expect(getCompletions("/unknown --foo", commands)).toEqual([]);
    });

    it("returns empty for bare value after command (no -- prefix)", () => {
      expect(getCompletions("/greet foo", commands)).toEqual([]);
    });

    it("returns empty for unknown field in enum lookup", () => {
      expect(getCompletions("/list --nonexistent x", commands)).toEqual([]);
    });

    it("returns empty for empty input", () => {
      expect(getCompletions("", commands)).toEqual([]);
    });

    it("handles completion with only two parts (command + partial flag)", () => {
      expect(getCompletions("/greet --n", commands)).toEqual(["--name"]);
    });
  });
});

describe("applyCompletion", () => {
  it("replaces entire input for command completion", () => {
    expect(applyCompletion("/gr", "/greet")).toBe("/greet");
  });

  it("replaces last token for flag completion", () => {
    expect(applyCompletion("/greet --na", "--name")).toBe("/greet --name");
  });

  it("replaces last token for enum value completion", () => {
    expect(applyCompletion("/list --filter d", "done")).toBe(
      "/list --filter done",
    );
  });

  it("appends when input has trailing space", () => {
    expect(applyCompletion("/list --filter ", "open")).toBe(
      "/list --filter open",
    );
  });

  it("handles single slash", () => {
    expect(applyCompletion("/", "/help")).toBe("/help");
  });

  it("preserves leading content for multi-token input", () => {
    expect(applyCompletion("/greet --name Alice --lo", "--loud")).toBe(
      "/greet --name Alice --loud",
    );
  });

  it("appends flag after trailing space", () => {
    expect(applyCompletion("/greet ", "--name")).toBe("/greet --name");
  });
});

describe("getGhostSuggestion", () => {
  const greet = defineCommand({
    id: "greet",
    description: "Greet someone",
    inputSchema: z.object({
      name: z.string().describe("Name"),
      loud: z.boolean().default(false).describe("Shout"),
    }),
    execute: async () => "hi",
  });

  const list = defineCommand({
    id: "list",
    description: "List items",
    inputSchema: z.object({
      filter: z
        .enum(["all", "open", "done"])
        .default("open")
        .describe("Filter"),
    }),
    execute: async () => "items",
  });

  const noop = defineCommand({
    id: "noop",
    description: "No-op",
    inputSchema: z.object({}),
    execute: async () => null,
  });

  const commands = [greet, list, noop];

  it("suggests completed command name", () => {
    const ghost = getGhostSuggestion("/gr", commands);
    expect(ghost).toBe("/greet");
  });

  it("suggests flag with opening quote for non-boolean field", () => {
    const ghost = getGhostSuggestion("/greet --na", commands);
    expect(ghost).toBe('/greet --name "');
  });

  it("suggests flag after trailing space with opening quote", () => {
    const ghost = getGhostSuggestion("/greet ", commands);
    expect(ghost).toContain("--name");
    expect(ghost).toContain('"');
  });

  it("suggests boolean flag without placeholder", () => {
    const ghost = getGhostSuggestion("/greet --lo", commands);
    expect(ghost).toBe("/greet --loud");
  });

  it("returns null for no match", () => {
    expect(getGhostSuggestion("/xyz", commands)).toBeNull();
  });

  it("returns null for non-command input", () => {
    expect(getGhostSuggestion("hello", commands)).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(getGhostSuggestion("", commands)).toBeNull();
  });

  it("suggests enum value", () => {
    const ghost = getGhostSuggestion("/list --filter d", commands);
    expect(ghost).toBe("/list --filter done");
  });

  it("suggests closing quote inside open quote", () => {
    const ghost = getGhostSuggestion('/greet --name "Alice', commands);
    expect(ghost).toBe('/greet --name "Alice"');
  });
});

describe("completions — coverage gaps", () => {
  const greet = defineCommand({
    id: "greet",
    description: "Greet someone",
    inputSchema: z.object({
      name: z.string().describe("Name"),
      loud: z.boolean().default(false).describe("Shout"),
    }),
    execute: async () => "hi",
  });

  const list = defineCommand({
    id: "list",
    description: "List items",
    inputSchema: z.object({
      filter: z
        .enum(["all", "open", "done"])
        .default("open")
        .describe("Filter"),
    }),
    execute: async () => "items",
  });

  const commands = [greet, list];

  it("handles tab character in tokenizer", () => {
    const result = getCompletions("/greet\t--na", commands);
    expect(result).toEqual(["--name"]);
  });

  it("returns empty tokens after bare / with trailing space", () => {
    // `/ ` → tokens = ['/'], trailingSpace = true, cmdName = '' → no cmd → empty
    const result = getCompletions("/ ", commands);
    expect(result).toEqual([]);
  });

  it("completes value via prevToken for enum field", () => {
    // `/list --filter d` where `d` is a partial value and `--filter` is prevToken
    const result = getCompletions("/list --filter d", commands);
    expect(result).toEqual(["done"]);
  });

  it("returns empty suffix for unknown command", () => {
    const result = getCompletionSuffix("--x", "/unknown --x", commands);
    expect(result).toBe("");
  });

  it("returns space suffix for enum field completion", () => {
    const result = getCompletionSuffix("--filter", "/list --filter", commands);
    expect(result).toBe(" ");
  });

  it("unwraps enum through default/optional wrappers", () => {
    const wrappedCmd = defineCommand({
      id: "wrapped",
      description: "Wrapped enum",
      inputSchema: z.object({
        status: z
          .enum(["active", "inactive"])
          .default("active")
          .optional()
          .describe("Status"),
      }),
      execute: async () => "ok",
    });
    const result = getCompletions("/wrapped --status ", [wrappedCmd]);
    expect(result).toContain("active");
    expect(result).toContain("inactive");
  });
});
