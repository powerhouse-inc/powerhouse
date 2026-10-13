// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, beforeEach } from "vitest";
import { z } from "zod";
import {
  defineCli,
  defineCommand,
  createReplSession,
  createMemoryWorkdirStore,
} from "../src/index.js";
import type {
  ReplSession,
  CommandContext,
  AgentProvider,
  StreamChunk,
  ServiceManager,
} from "../src/index.js";

describe("createReplSession", () => {
  const greet = defineCommand({
    id: "greet",
    description: "Greet someone by name",
    inputSchema: z.object({
      name: z.string().describe("Name of the person to greet"),
      loud: z.boolean().default(false).describe("Shout the greeting"),
    }),
    execute: async ({ name, loud }) => {
      const msg = `Hello, ${name}!`;
      return loud ? msg.toUpperCase() : msg;
    },
  });

  const echo = defineCommand({
    id: "echo",
    description: "Echo a message",
    inputSchema: z.object({
      message: z.string().describe("Message to echo"),
    }),
    execute: async ({ message }) => ({ text: message, data: { message } }),
  });

  const errorCmd = defineCommand({
    id: "fail",
    description: "Always fails",
    inputSchema: z.object({}),
    execute: async () => {
      throw new Error("command failed");
    },
  });

  const cli = defineCli({
    name: "test",
    version: "1.0.0",
    description: "Test CLI",
    commands: [greet, echo, errorCmd],
    interactive: { welcome: "Welcome to Test CLI" },
  });

  let session: ReplSession;
  let context: CommandContext;

  beforeEach(() => {
    context = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    session = createReplSession({ cli, context });
  });

  describe("welcome", () => {
    it("returns the welcome message", () => {
      expect(session.welcome).toBe("Welcome to Test CLI");
    });
  });

  describe("processInput", () => {
    it("handles empty input", async () => {
      const result = await session.processInput("");
      expect(result.type).toBe("empty");
    });

    it("handles /cli-docs", async () => {
      const result = await session.processInput("/cli-docs");
      expect(result.type).toBe("result");
      expect(result.text).toContain("As a CLI-first agent");
      expect(result.text).toContain("greet");
      expect(result.text).toContain("echo");
    });

    it("handles /exit", async () => {
      const result = await session.processInput("/exit");
      expect(result.type).toBe("exit");
      expect(result.text).toBe("Goodbye!");
    });

    it("handles /quit", async () => {
      const result = await session.processInput("/quit");
      expect(result.type).toBe("exit");
    });

    it("executes a command returning a string", async () => {
      const result = await session.processInput("/greet --name Alice");
      expect(result.type).toBe("result");
      expect(result.text).toContain("Hello, Alice!");
    });

    it("executes a command with boolean flag", async () => {
      const result = await session.processInput("/greet --name Alice --loud");
      expect(result.type).toBe("result");
      expect(result.text).toContain("HELLO, ALICE!");
    });

    it("executes a command returning { text }", async () => {
      const result = await session.processInput(
        '/echo --message "Hello World"',
      );
      expect(result.type).toBe("result");
      expect(result.text).toContain("Hello World");
    });

    it("executes a command with positional arguments", async () => {
      const addTask = defineCommand({
        id: "task",
        description: "Add a task",
        inputSchema: z.object({
          title: z.string().describe("Title"),
          priority: z.coerce.number().default(1).describe("Priority"),
        }),
        positional: ["title", "priority"],
        execute: async ({ title, priority }) => ({
          text: `${title}@${priority}`,
        }),
      });

      const cli2 = defineCli({
        name: "test",
        version: "1.0.0",
        description: "Test",
        commands: [addTask],
        interactive: { welcome: "" },
      });
      const ctx: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
      };
      const s = createReplSession({ cli: cli2, context: ctx });

      const r1 = await s.processInput('/task "Buy milk"');
      expect(r1.text).toContain("Buy milk@1");

      const r2 = await s.processInput('/task "Buy milk" 5');
      expect(r2.text).toContain("Buy milk@5");
    });

    it("prompts for missing required positional when prompt config is set", async () => {
      const addTask = defineCommand({
        id: "task",
        description: "Add a task",
        inputSchema: z.object({
          title: z.string().describe("Title"),
        }),
        positional: ["title"],
        prompt: {},
        execute: async ({ title }) => ({ text: `added:${title}` }),
      });

      const cli2 = defineCli({
        name: "test",
        version: "1.0.0",
        description: "Test",
        commands: [addTask],
        interactive: { welcome: "" },
      });
      const ctx: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
      };
      const s = createReplSession({ cli: cli2, context: ctx });

      const r1 = await s.processInput("/task");
      expect(r1.type).toBe("prompt");

      const r2 = await s.processInput("Buy milk");
      expect(r2.type).toBe("result");
      expect(r2.text).toContain("added:Buy milk");
    });

    it("captures ctx.stdout() output during direct command execution", async () => {
      const stdoutCmd = defineCommand({
        id: "verbose",
        description: "Writes progressive output",
        inputSchema: z.object({}),
        execute: async (_input, ctx) => {
          ctx.stdout("Step 1\n");
          ctx.stdout("Step 2\n");
          return { text: "Done" };
        },
      });

      const cli2 = defineCli({
        name: "test",
        version: "1.0.0",
        description: "Test",
        commands: [stdoutCmd],
        interactive: { welcome: "" },
      });

      const ctx: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
      };
      const s = createReplSession({ cli: cli2, context: ctx });
      const result = await s.processInput("/verbose");

      expect(result.type).toBe("result");
      expect(result.text).toContain("Step 1");
      expect(result.text).toContain("Step 2");
      expect(result.text).toContain("Done");
    });

    it("streams ctx.stdout() progressively via onStreamChunk during direct command execution", async () => {
      const stdoutCmd = defineCommand({
        id: "build",
        description: "Build with progress",
        inputSchema: z.object({}),
        execute: async (_input, ctx) => {
          ctx.stdout("Compiling...\n");
          ctx.stdout("Linking...\n");
          return { text: "Build complete" };
        },
      });

      const cli2 = defineCli({
        name: "test",
        version: "1.0.0",
        description: "Test",
        commands: [stdoutCmd],
        interactive: { welcome: "" },
      });

      const ctx: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
      };
      const s = createReplSession({ cli: cli2, context: ctx });

      const streamed: { type: string; text?: string }[] = [];
      s.onStreamChunk = (chunk) => {
        streamed.push({
          type: chunk.type,
          text: "text" in chunk ? (chunk as any).text : undefined,
        });
      };

      await s.processInput("/build");

      // Should emit: tool-call (on first stdout), tool-output (x2), tool-result
      expect(streamed).toHaveLength(4);
      expect(streamed[0]!.type).toBe("tool-call");
      expect(streamed[1]).toEqual({
        type: "tool-output",
        text: "Compiling...\n",
      });
      expect(streamed[2]).toEqual({
        type: "tool-output",
        text: "Linking...\n",
      });
      expect(streamed[3]!.type).toBe("tool-result");
    });

    it("does not leak captured stdout to process.stdout", async () => {
      const leaked: string[] = [];
      const stdoutCmd = defineCommand({
        id: "leaky",
        description: "Writes to stdout",
        inputSchema: z.object({}),
        execute: async (_input, ctx) => {
          ctx.stdout("captured\n");
          return { text: "ok" };
        },
      });

      const cli2 = defineCli({
        name: "test",
        version: "1.0.0",
        description: "Test",
        commands: [stdoutCmd],
        interactive: { welcome: "" },
      });

      const ctx: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "",
        stdout: (t) => {
          leaked.push(t);
        },
        runProcess: () => Promise.resolve({ success: true, output: "" }),
      };
      const s = createReplSession({ cli: cli2, context: ctx });
      await s.processInput("/leaky");

      // Original stdout should NOT have been called — output was captured
      expect(leaked).toEqual([]);
    });

    it("returns error for unknown command", async () => {
      const result = await session.processInput("/nonexistent");
      expect(result.type).toBe("error");
      expect(result.text).toContain("Unknown command");
      expect(result.text).toContain("nonexistent");
    });

    it("returns error for bare text", async () => {
      const result = await session.processInput("just some text");
      expect(result.type).toBe("error");
      expect(result.text).toContain("/cli-docs");
    });

    it("returns error for missing required arg", async () => {
      const result = await session.processInput("/greet");
      expect(result.type).toBe("error");
      expect(result.text).toContain("name");
    });

    it("returns error when command throws", async () => {
      const result = await session.processInput("/fail");
      expect(result.type).toBe("error");
      expect(result.text).toContain("command failed");
    });
  });

  describe("processInput — result formatting", () => {
    it("handles command returning null", async () => {
      const nullCmd = defineCommand({
        id: "null",
        description: "Returns null",
        inputSchema: z.object({}),
        execute: async () => null as unknown,
      });
      const nullCli = defineCli({
        name: "test",
        version: "1.0.0",
        description: "test",
        commands: [nullCmd],
        interactive: { welcome: "" },
      });
      const s = createReplSession({
        cli: nullCli,
        context: {
          workspace: createMemoryWorkdirStore(),
          config: {},
          workdir: "",
          stdout: () => {},
          runProcess: () => Promise.resolve({ success: true, output: "" }),
        },
      });
      const result = await s.processInput("/null");
      expect(result.type).toBe("result");
      expect(result.text).toBe("");
    });
  });

  describe("getCompletions", () => {
    it("completes command names", () => {
      const result = session.getCompletions("/gr");
      expect(result).toEqual(["/greet"]);
    });

    it("returns all commands for /", () => {
      const result = session.getCompletions("/");
      expect(result).toContain("/greet");
      expect(result).toContain("/echo");
      expect(result).toContain("/fail");
      expect(result).toContain("/cli-docs");
      expect(result).toContain("/exit");
    });
  });

  describe("getGhostSuggestion", () => {
    it("returns ghost suggestion for partial command", () => {
      const ghost = session.getGhostSuggestion("/gr");
      expect(ghost).toBe("/greet");
    });

    it("returns ghost suggestion for flag", () => {
      const ghost = session.getGhostSuggestion("/greet --na");
      expect(ghost).toContain("--name");
    });

    it("returns null for unknown command", () => {
      expect(session.getGhostSuggestion("/unknown")).toBeNull();
    });
  });
});

describe("parameter prompting", () => {
  const addTask = defineCommand({
    id: "add",
    description: "Add a task",
    inputSchema: z.object({
      title: z.string().describe("Task title"),
      priority: z
        .enum(["low", "medium", "high"])
        .optional()
        .describe("Task priority"),
      due: z.string().optional().describe("Due date"),
    }),
    prompt: {
      promptForDefaults: false,
      promptOptional: ["priority"],
    },
    execute: async ({ title, priority }) => ({
      text: `Added: ${title} [${priority ?? "none"}]`,
    }),
  });

  const addRequired = defineCommand({
    id: "add-req",
    description: "Add with required fields",
    inputSchema: z.object({
      title: z.string().describe("Task title"),
      body: z.string().describe("Task body"),
    }),
    prompt: {},
    execute: async ({ title, body }) => ({
      text: `${title}: ${body}`,
    }),
  });

  const addDefaults = defineCommand({
    id: "add-def",
    description: "Add with defaults prompting",
    inputSchema: z.object({
      title: z.string().describe("Task title"),
      priority: z
        .enum(["low", "medium", "high"])
        .default("medium")
        .describe("Task priority"),
    }),
    prompt: {
      promptForDefaults: true,
    },
    execute: async ({ title, priority }) => ({
      text: `${title} [${priority}]`,
    }),
  });

  function makeSession(commands: Parameters<typeof defineCli>[0]["commands"]) {
    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands,
      interactive: { welcome: "" },
    });
    return createReplSession({
      cli,
      context: {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
      },
    });
  }

  it("does not prompt when all required fields are provided", async () => {
    const session = makeSession([addTask]);
    const result = await session.processInput('/add --title "Buy milk"');
    expect(result.type).toBe("result");
    expect(session.isPrompting).toBe(false);
  });

  it("includes promptOptional fields when prompting for missing required", async () => {
    const session = makeSession([addTask]);
    // title is required and missing → triggers prompting, which also asks for priority
    const r1 = await session.processInput("/add");
    expect(r1.type).toBe("prompt");
    expect(r1.promptLabel).toBe("title");

    const r2 = await session.processInput("Buy milk");
    expect(r2.type).toBe("prompt");
    expect(r2.promptLabel).toBe("priority");

    const r3 = await session.processInput("high");
    expect(r3.type).toBe("result");
    expect(r3.text).toContain("Buy milk");
    expect(r3.text).toContain("high");
    expect(session.isPrompting).toBe(false);
  });

  it("accepts empty input for optional prompted field", async () => {
    const session = makeSession([addTask]);
    await session.processInput("/add");
    await session.processInput("Buy milk");
    // priority prompt — accept default (skip)
    const result = await session.processInput("");
    expect(result.type).toBe("result");
    expect(result.text).toContain("Buy milk");
  });

  it("prompts for missing required fields when command has prompt config", async () => {
    const session = makeSession([addRequired]);
    const result = await session.processInput("/add-req");
    expect(result.type).toBe("prompt");
    expect(result.promptLabel).toBe("title");
  });

  it("prompts for each required field sequentially", async () => {
    const session = makeSession([addRequired]);
    await session.processInput("/add-req");
    const r2 = await session.processInput("My Task");
    expect(r2.type).toBe("prompt");
    expect(r2.promptLabel).toBe("body");
    const r3 = await session.processInput("Task details");
    expect(r3.type).toBe("result");
    expect(r3.text).toContain("My Task");
    expect(r3.text).toContain("Task details");
  });

  it("re-prompts when required field is left empty", async () => {
    const session = makeSession([addRequired]);
    await session.processInput("/add-req");
    const r2 = await session.processInput("");
    expect(r2.type).toBe("prompt");
    expect(r2.promptLabel).toBe("title");
    expect(r2.text).toContain("required");
  });

  it("skips prompting when all args are provided", async () => {
    const session = makeSession([addTask]);
    const result = await session.processInput(
      '/add --title "Buy milk" --priority high',
    );
    expect(result.type).toBe("result");
    expect(session.isPrompting).toBe(false);
  });

  it("promptForDefaults includes default fields when prompting is triggered", async () => {
    const session = makeSession([addDefaults]);
    // title is required and missing → triggers prompting
    // promptForDefaults means priority (which has a default) also gets prompted
    const r1 = await session.processInput("/add-def");
    expect(r1.type).toBe("prompt");
    expect(r1.promptLabel).toBe("title");

    const r2 = await session.processInput("Task");
    expect(r2.type).toBe("prompt");
    expect(r2.promptLabel).toBe("priority");
  });

  it("accepts default value on empty input when promptForDefaults", async () => {
    const session = makeSession([addDefaults]);
    await session.processInput("/add-def");
    await session.processInput("Task");
    const result = await session.processInput("");
    expect(result.type).toBe("result");
    expect(result.text).toContain("medium"); // default applied
  });

  it("does not prompt for defaults when all required fields are provided", async () => {
    const session = makeSession([addDefaults]);
    const result = await session.processInput('/add-def --title "Task"');
    expect(result.type).toBe("result");
    expect(result.text).toContain("medium");
  });

  it("disables completions during prompting", async () => {
    const session = makeSession([addTask]);
    await session.processInput("/add");
    expect(session.getCompletions("/add")).toEqual([]);
    expect(session.getGhostSuggestion("/add")).toBeNull();
  });

  it("prompts for boolean fields with true/false hint", async () => {
    const boolCmd = defineCommand({
      id: "toggle",
      description: "Toggle",
      inputSchema: z.object({
        verbose: z.boolean().describe("Verbose output"),
      }),
      prompt: {},
      execute: async ({ verbose }) => ({ text: `verbose=${verbose}` }),
    });
    const session = makeSession([boolCmd]);
    const r1 = await session.processInput("/toggle");
    expect(r1.type).toBe("prompt");
    expect(r1.text).toContain("true/false");

    const r2 = await session.processInput("true");
    expect(r2.type).toBe("result");
    expect(r2.text).toContain("verbose=true");
  });

  it("handles error during prompted command execution", async () => {
    const failCmd = defineCommand({
      id: "fail",
      description: "Fails",
      inputSchema: z.object({
        x: z.string().describe("Value"),
      }),
      prompt: {},
      execute: async () => {
        throw new Error("boom");
      },
    });
    const session = makeSession([failCmd]);
    await session.processInput("/fail");
    const result = await session.processInput("test");
    expect(result.type).toBe("error");
    expect(result.text).toContain("boom");
  });

  it("enters prompting for missing required fields with partial args", async () => {
    const session = makeSession([addRequired]);
    // Provide title but not body — parseArgs throws, prompting catches it
    const r1 = await session.processInput('/add-req --title "My Task"');
    expect(r1.type).toBe("prompt");
    expect(r1.promptLabel).toBe("body");

    const r2 = await session.processInput("The body text");
    expect(r2.type).toBe("result");
    expect(r2.text).toContain("My Task");
    expect(r2.text).toContain("The body text");
  });

  it("handles partial args with boolean flags when entering prompting", async () => {
    const mixedCmd = defineCommand({
      id: "mixed",
      description: "Mixed fields",
      inputSchema: z.object({
        title: z.string().describe("Title"),
        verbose: z.boolean().default(false).describe("Verbose"),
      }),
      prompt: {},
      execute: async ({ title, verbose }) => ({
        text: `${title} v=${verbose}`,
      }),
    });
    const session = makeSession([mixedCmd]);
    // Provide verbose but not title — title is required, triggers prompting via error path
    const r1 = await session.processInput("/mixed --verbose");
    expect(r1.type).toBe("prompt");
    expect(r1.promptLabel).toBe("title");

    const r2 = await session.processInput("Test");
    expect(r2.type).toBe("result");
    expect(r2.text).toContain("Test");
    expect(r2.text).toContain("v=true");
  });

  it("uses field key when description is missing in prompt text", async () => {
    const noDescCmd = defineCommand({
      id: "nodesc",
      description: "No desc fields",
      inputSchema: z.object({
        value: z.string(),
      }),
      prompt: {},
      execute: async ({ value }) => ({ text: value }),
    });
    const session = makeSession([noDescCmd]);
    const r1 = await session.processInput("/nodesc");
    expect(r1.type).toBe("prompt");
    expect(r1.text).toContain("value"); // falls back to key
  });

  it("skips optional prompted field on empty input when prompting is active", async () => {
    const optCmd = defineCommand({
      id: "opt",
      description: "Optional prompting",
      inputSchema: z.object({
        name: z.string().describe("Name"),
        note: z.string().optional().describe("Note"),
      }),
      prompt: { promptOptional: ["note"] },
      execute: async ({ name, note }) => ({
        text: `${name}:${note ?? "none"}`,
      }),
    });
    const session = makeSession([optCmd]);
    // Omit required name → triggers prompting, which also asks for note (promptOptional)
    const r1 = await session.processInput("/opt");
    expect(r1.type).toBe("prompt");
    expect(r1.promptLabel).toBe("name");

    const r2 = await session.processInput("Test");
    expect(r2.type).toBe("prompt");
    expect(r2.promptLabel).toBe("note");

    // Skip optional note
    const r3 = await session.processInput("");
    expect(r3.type).toBe("result");
    expect(r3.text).toContain("none");
  });

  it("applies non-prompted defaults and includes promptOptional when required fields missing", async () => {
    const mixedDefaultsCmd = defineCommand({
      id: "mixed-defaults",
      description: "Mixed defaults",
      inputSchema: z.object({
        title: z.string().describe("Title"),
        priority: z
          .enum(["low", "medium", "high"])
          .default("medium")
          .describe("Priority"),
        verbose: z.boolean().default(false).describe("Verbose"),
      }),
      prompt: {
        promptOptional: ["priority"], // priority is prompted when prompting is active, verbose is not
      },
      execute: async ({ title, priority, verbose }) => ({
        text: `${title} [${priority}] v=${verbose}`,
      }),
    });
    const session = makeSession([mixedDefaultsCmd]);
    // Missing title triggers prompting; priority (promptOptional) also prompted; verbose gets default
    const r1 = await session.processInput("/mixed-defaults");
    expect(r1.type).toBe("prompt");
    expect(r1.promptLabel).toBe("title");

    const r2 = await session.processInput("Test");
    expect(r2.type).toBe("prompt");
    expect(r2.promptLabel).toBe("priority");

    const r3 = await session.processInput("high");
    expect(r3.type).toBe("result");
    expect(r3.text).toContain("Test");
    expect(r3.text).toContain("high");
    expect(r3.text).toContain("v=false"); // verbose got its default
  });

  it("does not prompt for commands without prompt config", async () => {
    const noPrompt = defineCommand({
      id: "simple",
      description: "Simple",
      inputSchema: z.object({
        name: z.string().describe("Name"),
      }),
      execute: async ({ name }) => name,
    });
    const session = makeSession([noPrompt]);
    const result = await session.processInput("/simple");
    expect(result.type).toBe("error");
    expect(result.text).toContain("name");
  });
});

describe("headless interactive mode via run()", () => {
  const greet = defineCommand({
    id: "greet",
    description: "Greet someone by name",
    inputSchema: z.object({
      name: z.string().describe("Name"),
    }),
    execute: async ({ name }) => `Hello, ${name}!`,
  });

  const cli = defineCli({
    name: "test",
    version: "1.0.0",
    description: "Test CLI",
    commands: [greet],
    interactive: { welcome: "Welcome!" },
  });

  it("runs commands from interactiveInput and prints output", async () => {
    const output: string[] = [];
    const inputs = ["/greet --name Alice", "/exit"];

    await cli.run(["node", "test", "-i"], {
      stdout: (msg) => output.push(msg),
      stderr: () => {},
      exit: () => {},
      interactiveInput: (async function* () {
        for (const input of inputs) yield input;
      })(),
    });

    expect(output[0]).toBe("Welcome!");
    expect(output).toEqual(
      expect.arrayContaining([expect.stringContaining("Hello, Alice!")]),
    );
    expect(output).toContain("Goodbye!");
  });

  it("shows welcome message", async () => {
    const output: string[] = [];

    await cli.run(["node", "test", "-i"], {
      stdout: (msg) => output.push(msg),
      stderr: () => {},
      exit: () => {},
      interactiveInput: (async function* () {
        yield "/exit";
      })(),
    });

    expect(output[0]).toBe("Welcome!");
  });

  it("handles /cli-docs in headless mode", async () => {
    const output: string[] = [];

    await cli.run(["node", "test", "-i"], {
      stdout: (msg) => output.push(msg),
      stderr: () => {},
      exit: () => {},
      interactiveInput: (async function* () {
        yield "/cli-docs";
        yield "/exit";
      })(),
    });

    const helpOutput = output.find((o) => o.includes("As a CLI-first agent"));
    expect(helpOutput).toBeDefined();
  });

  it("rejects -i when interactive is not configured", async () => {
    const noInteractive = defineCli({
      name: "test",
      version: "1.0.0",
      description: "No interactive",
      commands: [greet],
    });

    const errors: string[] = [];
    let exitCode: number | undefined;

    await noInteractive.run(["node", "test", "-i"], {
      stdout: () => {},
      stderr: (msg) => errors.push(msg),
      exit: (code) => {
        exitCode = code;
      },
    });

    expect(errors[0]).toContain("not configured");
    expect(exitCode).toBe(1);
  });
});

describe("piped stdin processes commands (via interactiveInput)", () => {
  const greet = defineCommand({
    id: "greet",
    description: "Greet someone by name",
    inputSchema: z.object({
      name: z.string().describe("Name"),
    }),
    execute: async ({ name }) => `Hello, ${name}!`,
  });

  it("processes multiple commands from piped input and exits on /exit", async () => {
    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test CLI",
      commands: [greet],
      interactive: { welcome: "Welcome!" },
    });

    const output: string[] = [];

    // Simulate piped stdin by providing interactiveInput (same code path)
    await cli.run(["node", "test", "-i"], {
      stdout: (msg) => output.push(msg),
      stderr: () => {},
      exit: () => {},
      interactiveInput: (async function* () {
        yield "/greet --name World";
        yield "/greet --name Alice";
        yield "/exit";
      })(),
    });

    expect(output[0]).toBe("Welcome!");
    expect(output).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Hello, World!"),
        expect.stringContaining("Hello, Alice!"),
      ]),
    );
    expect(output).toContain("Goodbye!");
  });

  it("exits cleanly when piped input ends without /exit", async () => {
    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test CLI",
      commands: [greet],
      interactive: { welcome: "Hi" },
    });

    const output: string[] = [];
    let exitCode: number | undefined;

    await cli.run(["node", "test", "-i"], {
      stdout: (msg) => output.push(msg),
      stderr: () => {},
      exit: (code) => {
        exitCode = code;
      },
      interactiveInput: (async function* () {
        yield "/greet --name Test";
      })(),
    });

    expect(output).toEqual(
      expect.arrayContaining([expect.stringContaining("Hello, Test!")]),
    );
    expect(exitCode).toBe(0);
  });
});

describe("default command — agent routing", () => {
  function createTestAgent(
    responses: Record<string, StreamChunk[]>,
  ): AgentProvider {
    return {
      id: "test-assistant",
      async *stream(prompt) {
        const chunks = responses[prompt] ?? [
          { type: "text-delta" as const, text: `Echo: ${prompt}` },
        ];
        for (const chunk of chunks) yield chunk;
      },
    };
  }

  const search = defineCommand({
    id: "search",
    description: "Search",
    inputSchema: z.object({ query: z.string().describe("Query") }),
    execute: async ({ query }) => ({ text: `Results for: ${query}` }),
  });

  it("routes bare text to agent when agent factory is set", async () => {
    const agent = createTestAgent({
      "What is TypeScript?": [
        {
          type: "text-delta",
          text: "TypeScript is a typed superset of JavaScript.",
        },
      ],
    });

    const cli = defineCli({
      name: "assist",
      version: "1.0.0",
      description: "Assistant",
      commands: [search],
      interactive: { welcome: "Hi!" },
    });
    cli.configureAgent(async () => agent);

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context, agentProvider: agent });

    const result = await session.processInput("What is TypeScript?");
    expect(result.type).toBe("result");
    expect(result.text).toContain(
      "TypeScript is a typed superset of JavaScript.",
    );
  });

  it("still routes /command to direct execution", async () => {
    const agent = createTestAgent({});

    const cli = defineCli({
      name: "assist",
      version: "1.0.0",
      description: "Assistant",
      commands: [search],
      interactive: { welcome: "Hi!" },
    });
    cli.configureAgent(async () => agent);

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context, agentProvider: agent });

    const result = await session.processInput('/search --query "hello"');
    expect(result.type).toBe("result");
    expect(result.text).toContain("Results for: hello");
  });

  it("streams tool-call and tool-result chunks into output", async () => {
    const agent = createTestAgent({
      "search for cats": [
        { type: "tool-call", toolName: "search", args: { query: "cats" } },
        {
          type: "tool-result",
          toolName: "search",
          result: "3 results",
          isError: false,
        },
        { type: "text-delta", text: "Here are results about cats." },
      ],
    });

    const cli = defineCli({
      name: "assist",
      version: "1.0.0",
      description: "Assistant",
      commands: [search],
      interactive: { welcome: "" },
    });
    cli.configureAgent(async () => agent);

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context, agentProvider: agent });

    const result = await session.processInput("search for cats");
    expect(result.text).toContain("▶");
    expect(result.text).toContain("search");
    expect(result.text).toContain("✓");
    expect(result.text).toContain("Here are results about cats.");
  });

  it("handles error chunks from agent", async () => {
    const agent = createTestAgent({
      break: [
        { type: "text-delta", text: "Starting..." },
        { type: "error", error: "API rate limit exceeded" },
      ],
    });

    const cli = defineCli({
      name: "assist",
      version: "1.0.0",
      description: "Assistant",
      commands: [search],
      interactive: { welcome: "" },
    });
    cli.configureAgent(async () => agent);

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context, agentProvider: agent });

    const result = await session.processInput("break");
    expect(result.text).toContain("Starting...");
    expect(result.text).toContain("API rate limit exceeded");
  });

  it("returns error for bare text when no agent is configured", async () => {
    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [search],
      interactive: { welcome: "" },
    });

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context });

    const result = await session.processInput("just some text");
    expect(result.type).toBe("error");
  });

  it("returns error when agent factory is set but provider is not passed", async () => {
    const cli = defineCli({
      name: "assist",
      version: "1.0.0",
      description: "Assistant",
      commands: [search],
      interactive: { welcome: "" },
    });
    cli.configureAgent(async () => ({ id: "x", async *stream() {} }));

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    // No agentProvider passed — session should still route text to agent handler
    const session = createReplSession({ cli, context });

    const result = await session.processInput("hello");
    expect(result.type).toBe("error");
    expect(result.text).toContain("Agent not available");
  });
});

describe("onStreamChunk callback", () => {
  it("receives raw chunks and cumulative text during agent streaming", async () => {
    const agent: AgentProvider = {
      id: "test",
      async *stream() {
        yield {
          type: "tool-call" as const,
          toolName: "search",
          args: { q: "cats" },
        };
        yield {
          type: "tool-result" as const,
          toolName: "search",
          result: "3 results",
          isError: false,
        };
        yield { type: "text-delta" as const, text: "Found cats." };
      },
    };

    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [],
      interactive: { welcome: "" },
    });
    cli.configureAgent(async () => agent);

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context, agentProvider: agent });

    const chunks: { type: string; fullText: string }[] = [];
    session.onStreamChunk = (chunk, fullText) => {
      chunks.push({ type: chunk.type, fullText });
    };

    await session.processInput("find cats");

    expect(chunks.length).toBe(3);
    expect(chunks[0]!.type).toBe("tool-call");
    expect(chunks[1]!.type).toBe("tool-result");
    expect(chunks[2]!.type).toBe("text-delta");

    // Each call gets cumulative text
    expect(chunks[2]!.fullText).toContain("Found cats.");
    expect(chunks[2]!.fullText).toContain("search");
  });

  it("emits tool-output chunks when _onToolOutput is triggered during agent streaming", async () => {
    // Command that writes progressive output via ctx.stdout
    const verboseCmd = defineCommand({
      id: "build",
      description: "Build project",
      inputSchema: z.object({}),
      execute: async (_input, ctx) => {
        ctx.stdout("Compiling...\n");
        ctx.stdout("Linking...\n");
        return { text: "Build complete" };
      },
    });

    // Agent that calls the verbose command (simulated via tool-call/result)
    // But the actual _onToolOutput hook is set by session.handleAgentPrompt,
    // so we need an agent that triggers tool execution through Mastra's loop.
    // Since we can't easily test the full Mastra loop here, we test the hook
    // directly by simulating what happens: the session sets _onToolOutput on context,
    // and during the stream loop, tool execution fires it.

    // We simulate this by having the agent yield chunks and manually triggering
    // the _onToolOutput callback during the stream.
    let contextRef: CommandContext | null = null;
    const agent: AgentProvider = {
      id: "test",
      async *stream() {
        yield { type: "tool-call" as const, toolName: "build", args: {} };
        // Simulate tool execution triggering _onToolOutput
        if (contextRef?._onToolOutput) {
          contextRef._onToolOutput("build", "Compiling...\n");
          contextRef._onToolOutput("build", "Linking...\n");
        }
        yield {
          type: "tool-result" as const,
          toolName: "build",
          result: "Build complete",
          isError: false,
        };
      },
    };

    const cli2 = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [verboseCmd],
      interactive: { welcome: "" },
    });
    cli2.configureAgent(async () => agent);

    const context2: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    contextRef = context2;
    const session2 = createReplSession({
      cli: cli2,
      context: context2,
      agentProvider: agent,
    });

    const chunks: { type: string; text?: string }[] = [];
    session2.onStreamChunk = (chunk) => {
      chunks.push({
        type: chunk.type,
        text: "text" in chunk ? (chunk as any).text : undefined,
      });
    };

    await session2.processInput("build my project");

    // Should have: tool-call, tool-output x2, tool-result
    const toolOutputChunks = chunks.filter((c) => c.type === "tool-output");
    expect(toolOutputChunks.length).toBe(2);
    expect(toolOutputChunks[0]!.text).toBe("Compiling...\n");
    expect(toolOutputChunks[1]!.text).toBe("Linking...\n");

    // _onToolOutput should be cleaned up after streaming
    expect(context2._onToolOutput).toBeUndefined();
  });
});

describe("session edge cases", () => {
  const echo = defineCommand({
    id: "echo",
    description: "Echo message",
    inputSchema: z.object({ message: z.string().describe("Message") }),
    execute: async ({ message }) => ({ text: message }),
  });

  const svc = defineCommand({
    id: "svc",
    description: "Service management",
    inputSchema: z.object({
      action: z.string().default("ps"),
      manage: z.boolean().default(false),
    }),
    execute: async () => ({ text: "ok" }),
  });

  it("/foo-manage for unregistered service returns unknown command", async () => {
    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [echo, svc],
      interactive: { welcome: "" },
    });

    const context: CommandContext = {
      workdir: "",
      workspace: createMemoryWorkdirStore(),
      config: {},
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context });

    const result = await session.processInput("/foo-manage");
    expect(result.type).toBe("error");
    expect(result.text).toContain("Unknown command");
  });

  it("handles agent stream errors gracefully", async () => {
    const failingAgent: AgentProvider = {
      id: "failing",
      // eslint-disable-next-line require-yield -- throws before any yield by design
      async *stream() {
        throw new Error("LLM connection failed");
      },
    };

    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [echo],
      interactive: { welcome: "" },
    });
    cli.configureAgent(async () => failingAgent);

    const context: CommandContext = {
      workdir: "",
      workspace: createMemoryWorkdirStore(),
      config: {},
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({
      cli,
      context,
      agentProvider: failingAgent,
    });

    const result = await session.processInput("hello agent");
    expect(result.type).toBe("error");
    expect(result.text).toContain("LLM connection failed");
  });

  it("routes skill command invocation to agent with skill prefix", async () => {
    const {
      defineCli,
      defineCommand,
      createReplSession,
      createMemoryWorkdirStore,
    } = await import("../src/index.js");
    const { mkdtemp, mkdir, writeFile, rm } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");

    const tmp = await mkdtemp(join(tmpdir(), "session-skill-"));
    try {
      const skillDir = join(tmp, "my-skill");
      await mkdir(skillDir, { recursive: true });
      await writeFile(
        join(skillDir, "SKILL.md"),
        '---\nname: my-skill\ndescription: "Test skill"\n---\n\nSkill content.\n',
      );

      const skillCli = defineCli({
        name: "test",
        version: "1.0.0",
        description: "Test",
        commands: [],
        prompts: { artifacts: [tmp] },
        interactive: { welcome: "hi" },
      });

      const prompts: string[] = [];
      const agent: AgentProvider = {
        id: "test-agent",
        async *stream(prompt: string) {
          prompts.push(prompt);
          yield { type: "text-delta" as const, text: "skill done" };
        },
      };

      const ctx = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
      };
      const session = createReplSession({
        cli: skillCli,
        context: ctx,
        agentProvider: agent,
      });

      const result = await session.processInput(
        '/my-skill --prompt "build an invoice model"',
      );
      expect(result.type).toBe("result");
      expect(prompts).toHaveLength(1);
      expect(prompts[0]).toContain("my-skill");
      expect(prompts[0]).toContain("build an invoice model");
    } finally {
      await rm(tmp, { recursive: true, force: true });
    }
  });
});

describe("outputWindow", () => {
  it("exposes outputWindow on session with default value", () => {
    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [],
      interactive: { welcome: "" },
    });

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context });

    expect(session.outputWindow).toBe(6);
  });

  it("respects custom outputWindow from interactive config", () => {
    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [],
      interactive: { welcome: "", outputWindow: 3 },
    });

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context });

    expect(session.outputWindow).toBe(3);
  });

  it("head-crops verbose tool-result output in streaming mode", async () => {
    // Agent that produces a tool-result with many lines of output
    const verboseResult = Array.from(
      { length: 20 },
      (_, i) => `line ${i + 1}`,
    ).join("\n");
    const agent: AgentProvider = {
      id: "test",
      async *stream() {
        yield { type: "tool-call" as const, toolName: "install", args: {} };
        yield {
          type: "tool-result" as const,
          toolName: "install",
          result: { text: verboseResult },
          isError: false,
        };
        yield { type: "text-delta" as const, text: "Done." };
      },
    };

    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [],
      interactive: { welcome: "", outputWindow: 3 },
    });
    cli.configureAgent(async () => agent);

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context, agentProvider: agent });

    const result = await session.processInput("install stuff");
    expect(result.type).toBe("result");
    // The output should contain the truncation indicator
    expect(result.text).toContain("more lines");
    // Should contain the first few body lines
    expect(result.text).toContain("line 1");
    expect(result.text).toContain("line 3");
    // Should NOT contain lines beyond the window
    expect(result.text).not.toContain("line 20");
  });

  it("does not crop text-delta output", async () => {
    const longText = Array.from(
      { length: 20 },
      (_, i) => `paragraph ${i + 1}`,
    ).join("\n");
    const agent: AgentProvider = {
      id: "test",
      async *stream() {
        yield { type: "text-delta" as const, text: longText };
      },
    };

    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [],
      interactive: { welcome: "", outputWindow: 3 },
    });
    cli.configureAgent(async () => agent);

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context, agentProvider: agent });

    const result = await session.processInput("write something long");
    expect(result.type).toBe("result");
    // All text should be present — no cropping
    expect(result.text).toContain("paragraph 1");
    expect(result.text).toContain("paragraph 20");
    expect(result.text).not.toContain("more lines");
  });

  it("does not crop short tool-result output", async () => {
    const agent: AgentProvider = {
      id: "test",
      async *stream() {
        yield { type: "tool-call" as const, toolName: "ping", args: {} };
        yield {
          type: "tool-result" as const,
          toolName: "ping",
          result: "pong",
          isError: false,
        };
      },
    };

    const cli = defineCli({
      name: "test",
      version: "1.0.0",
      description: "Test",
      commands: [],
      interactive: { welcome: "", outputWindow: 6 },
    });
    cli.configureAgent(async () => agent);

    const context: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
    };
    const session = createReplSession({ cli, context, agentProvider: agent });

    const result = await session.processInput("ping");
    expect(result.type).toBe("result");
    expect(result.text).toContain("pong");
    expect(result.text).not.toContain("more lines");
  });

  it("exit message includes active services when services are running", () => {
    const noop = defineCommand({
      id: "noop",
      description: "noop",
      inputSchema: z.object({}),
      execute: async () => undefined,
    });

    const stubServices: ServiceManager = {
      start: async () => "id",
      stop: async () => {},
      list: () => [
        {
          serviceId: "db",
          instanceId: "i1",
          name: "Database",
          status: "ready" as const,
          pid: 123,
          workdir: "/app",
        },
      ],
      getDefinition: () => undefined,
      logs: () => "",
      watchLogs: () => () => {},
      scanProjects: () => [],
      purgeStoppedInstances: () => {},
    };

    const ctx: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
      services: stubServices,
    };

    const svcCli = defineCli({
      name: "svc-exit",
      version: "1.0.0",
      description: "Service exit test",
      commands: [noop],
      interactive: { welcome: "hi" },
    });

    const sess = createReplSession({ cli: svcCli, context: ctx });
    expect(sess.exitMessage).toContain("Database still active");
    expect(sess.exitMessage).toContain("/app");
    expect(sess.exitMessage).toContain("svc-exit db-stop");
  });

  it("-manage command returns error when service definition is missing", async () => {
    const { defineService } = await import("../src/index.js");

    // Create a CLI with a real service so the -manage command exists
    const manageCli = defineCli({
      name: "manage-test",
      version: "1.0.0",
      description: "Manage test",
      commands: [],
      interactive: { welcome: "hi" },
      services: [
        defineService({
          id: "my-svc",
          name: "My Service",
          command: "echo hi",
        }),
      ],
    });

    // Provide a stub ServiceManager that returns undefined for getDefinition
    const stubServices: ServiceManager = {
      start: async () => "id",
      stop: async () => {},
      list: () => [],
      getDefinition: () => undefined,
      logs: () => "",
      watchLogs: () => () => {},
      scanProjects: () => [],
      purgeStoppedInstances: () => {},
    };

    const ctx: CommandContext = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      runProcess: () => Promise.resolve({ success: true, output: "" }),
      services: stubServices,
    };

    const sess = createReplSession({ cli: manageCli, context: ctx });
    const result = await sess.processInput("/my-svc-manage");
    expect(result.type).toBe("error");
    expect(result.text).toContain("Unknown service: my-svc");
  });
});
