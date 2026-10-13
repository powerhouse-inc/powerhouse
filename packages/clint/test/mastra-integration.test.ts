// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, afterAll, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { rm, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { z } from "zod";
import { defineCommand } from "../src/core/command.js";
import { createMastraHelpers } from "../src/integrations/mastra/index.js";
import { commandsToMastraTools } from "../src/integrations/mastra/tools.js";
import { mapMastraStream } from "../src/integrations/mastra/stream.js";
import {
  createMemoryWorkdirStore,
  createWorkdirStore,
} from "../src/core/store.js";
import type {
  AgentSetupContext,
  PromptsConfig,
  ServiceInstanceStatus,
  ServiceManager,
} from "../src/core/types.js";
import { IDENTITY_WRAPS } from "../src/core/wraps.js";
import type { SkillInfo } from "../src/core/skills.js";

const testWorkspace = join(
  tmpdir(),
  `ph-clint-mastra-test-${randomBytes(4).toString("hex")}`,
);

afterAll(async () => {
  try {
    await rm(testWorkspace, { recursive: true });
  } catch {}
});

const echoCommand = defineCommand({
  id: "echo",
  description: "Echo input back",
  inputSchema: z.object({ text: z.string() }),
  execute: async (input) => ({ text: input.text }),
});

function makeAgentSetupContext(
  overrides?: Partial<AgentSetupContext>,
): AgentSetupContext {
  const workdir = overrides?.workdir ?? testWorkspace;
  return {
    workdir,
    config: {},
    cliName: "test-cli",
    cliVersion: "1.0.0",
    context: {
      workdir,
      workspace: createMemoryWorkdirStore(),
      config: {},
      stdout: () => {},
    } as any,
    commands: [echoCommand],
    skills: [],
    wraps: IDENTITY_WRAPS,
    ...overrides,
  };
}

describe("createMastraHelpers", () => {
  it("returns an object with getTools, createWorkspace, createMemory, wrapAgent", () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    expect(typeof helpers.getTools).toBe("function");
    expect(typeof helpers.createWorkspace).toBe("function");
    expect(typeof helpers.createMemory).toBe("function");
    expect(typeof helpers.wrapAgent).toBe("function");
  });

  it("getTools converts commands to Mastra tools", async () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    const tools = await helpers.getTools();
    expect(Object.keys(tools)).toEqual(["echo"]);
    expect(tools.echo).toBeDefined();
  });

  it("getTools returns empty object when no commands", async () => {
    const helpers = createMastraHelpers(
      makeAgentSetupContext({ commands: [] }),
    );
    const tools = await helpers.getTools();
    expect(tools).toEqual({});
  });

  it("createWorkspace returns a Mastra Workspace", async () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    const workspace = await helpers.createWorkspace();
    expect(workspace).toBeDefined();
  });

  describe("createWorkspace configuration", () => {
    let skillsWorkdir: string;

    afterEach(async () => {
      if (skillsWorkdir) {
        try {
          await rm(skillsWorkdir, { recursive: true });
        } catch {}
      }
    });

    function makeContextWithSkills(): AgentSetupContext {
      skillsWorkdir = join(
        tmpdir(),
        `ph-clint-ws-test-${randomBytes(4).toString("hex")}`,
      );
      // Create the store directory so installSkills has somewhere to put things
      const store = createWorkdirStore(skillsWorkdir, "test-cli");
      const skillsDir = store.getStoreFolder(".mastra/skills");
      mkdirSync(join(skillsDir, "my-skill"), { recursive: true });
      writeFileSync(
        join(skillsDir, "my-skill", "SKILL.md"),
        "---\nname: my-skill\ndescription: Test\n---\n",
      );

      const skills: SkillInfo[] = [
        {
          name: "my-skill",
          description: "Test skill",
          skillMdPath: join(skillsDir, "my-skill", "SKILL.md"),
        },
      ];
      return makeAgentSetupContext({ workdir: skillsWorkdir, skills });
    }

    it("passes skill paths derived from ctx.skills to Workspace", async () => {
      const ctx = makeContextWithSkills();
      const helpers = createMastraHelpers(ctx);
      const workspace = await helpers.createWorkspace();
      // Workspace should report skills are configured
      expect(workspace.hasSkillsConfig()).toBe(true);
    });

    it("passes allowedPaths constraining filesystem to workdir", async () => {
      const ctx = makeContextWithSkills();
      const helpers = createMastraHelpers(ctx);
      const workspace = await helpers.createWorkspace();
      const fs = (workspace as any)._fs;
      expect(fs._allowedPaths).toEqual([skillsWorkdir]);
    });

    it("configures LocalSandbox with correct workingDirectory", async () => {
      const ctx = makeContextWithSkills();
      const helpers = createMastraHelpers(ctx);
      const workspace = await helpers.createWorkspace();
      const sandbox = (workspace as any)._sandbox;
      expect(sandbox).toBeDefined();
      expect(sandbox.workingDirectory).toBe(skillsWorkdir);
    });

    it("with skills: [], only runtime glob is passed (no crash)", async () => {
      const helpers = createMastraHelpers(makeAgentSetupContext());
      const workspace = await helpers.createWorkspace();
      // Should still work — just has the runtime glob, no pre-packaged skills
      expect(workspace).toBeDefined();
      expect(workspace.hasSkillsConfig()).toBe(true);
    });
  });

  describe("getAgentInstructions", () => {
    let artifactDir: string;

    afterEach(async () => {
      if (artifactDir) {
        try {
          await rm(artifactDir, { recursive: true });
        } catch {}
      }
    });

    function setupArtifacts(
      profileName: string,
      content: string,
    ): PromptsConfig {
      artifactDir = join(
        tmpdir(),
        `ph-clint-instr-test-${randomBytes(4).toString("hex")}`,
      );
      const skillsDir = join(artifactDir, "gen", "skills");
      const profilesDir = join(artifactDir, "gen", "agent-profiles");
      mkdirSync(skillsDir, { recursive: true });
      mkdirSync(profilesDir, { recursive: true });
      writeFileSync(join(profilesDir, `${profileName}.md`), content);
      return {
        artifacts: [skillsDir],
        agents: {
          "test-agent": { name: profileName, sections: [], skills: [] },
        },
      };
    }

    it("returns profile content when file exists", () => {
      const prompts = setupArtifacts(
        "TestAgent",
        "# Test Agent Instructions\nDo things well.",
      );
      const helpers = createMastraHelpers(makeAgentSetupContext({ prompts }));
      const instructions = helpers.getAgentInstructions("test-agent");
      expect(instructions).toBe("# Test Agent Instructions\nDo things well.");
    });

    it("uses first artifact directory that has the file", () => {
      artifactDir = join(
        tmpdir(),
        `ph-clint-instr-test-${randomBytes(4).toString("hex")}`,
      );
      const missing = join(artifactDir, "missing", "skills");
      const found = join(artifactDir, "found", "skills");
      const profilesDir = join(artifactDir, "found", "agent-profiles");
      mkdirSync(missing, { recursive: true });
      mkdirSync(found, { recursive: true });
      mkdirSync(profilesDir, { recursive: true });
      writeFileSync(join(profilesDir, "MyAgent.md"), "Found it");

      const prompts: PromptsConfig = {
        artifacts: [missing, found],
        agents: { "my-agent": { name: "MyAgent", sections: [], skills: [] } },
      };
      const helpers = createMastraHelpers(makeAgentSetupContext({ prompts }));
      expect(helpers.getAgentInstructions("my-agent")).toBe("Found it");
    });

    it("throws when agent ID not in prompts.agents", () => {
      const prompts = setupArtifacts("TestAgent", "content");
      const helpers = createMastraHelpers(makeAgentSetupContext({ prompts }));
      expect(() => helpers.getAgentInstructions("nonexistent")).toThrow(
        /not found in prompts\.agents/,
      );
    });

    it("throws when prompts is undefined on context", () => {
      const helpers = createMastraHelpers(
        makeAgentSetupContext({ prompts: undefined }),
      );
      expect(() => helpers.getAgentInstructions("any-id")).toThrow(
        /no prompts config/,
      );
    });

    it("throws when profile file does not exist on disk", () => {
      artifactDir = join(
        tmpdir(),
        `ph-clint-instr-test-${randomBytes(4).toString("hex")}`,
      );
      const skillsDir = join(artifactDir, "gen", "skills");
      mkdirSync(skillsDir, { recursive: true });
      // Create agent-profiles dir but no file
      mkdirSync(join(artifactDir, "gen", "agent-profiles"), {
        recursive: true,
      });

      const prompts: PromptsConfig = {
        artifacts: [skillsDir],
        agents: { ghost: { name: "GhostAgent", sections: [], skills: [] } },
      };
      const helpers = createMastraHelpers(makeAgentSetupContext({ prompts }));
      expect(() => helpers.getAgentInstructions("ghost")).toThrow(
        /not found in agent-profiles/,
      );
    });
  });

  it("createMemory creates LibSQL-backed memory and db directory", async () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    const memory = await helpers.createMemory();
    expect(memory).toBeDefined();
    // Verify the database directory was created
    expect(
      existsSync(join(testWorkspace, ".ph", "test-cli", ".mastra", "db")),
    ).toBe(true);
  });

  it("wrapAgent wraps a mock agent as AgentProvider", () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    const mockAgent = { id: "mock-agent" };
    const provider = helpers.wrapAgent(mockAgent);
    expect(provider.id).toBe("mock-agent");
    expect(typeof provider.stream).toBe("function");
  });

  it('wrapAgent defaults id to "default" when agent has no id', () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    const provider = helpers.wrapAgent({});
    expect(provider.id).toBe("default");
  });

  function createCapturingAgent() {
    const calls: any[] = [];
    return {
      calls,
      agent: {
        id: "capture-agent",
        async stream(_prompt: string, opts?: unknown) {
          calls.push(opts);
          return {
            fullStream: (async function* () {
              /* empty */
            })(),
          };
        },
      },
    };
  }

  it("wrapAgent forwards untilIdle to agent.stream when set", async () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    const { calls, agent } = createCapturingAgent();
    const provider = helpers.wrapAgent(agent, {
      untilIdle: { maxIdleMs: 1000 },
    });
    for await (const _ of provider.stream("hi", { threadId: "t1" })) {
      /* drain */
    }
    expect(calls[0].untilIdle).toEqual({ maxIdleMs: 1000 });
    expect(calls[0].maxSteps).toBe(30);
  });

  it("wrapAgent omits untilIdle from stream opts by default", async () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    const { calls, agent } = createCapturingAgent();
    const provider = helpers.wrapAgent(agent);
    for await (const _ of provider.stream("hi")) {
      /* drain */
    }
    expect("untilIdle" in calls[0]).toBe(false);
  });

  describe("wrapAgent with logging", () => {
    let logDir: string;

    afterEach(async () => {
      if (logDir) {
        try {
          await rm(logDir, { recursive: true });
        } catch {}
      }
    });

    function createStreamingAgent(
      chunks: Array<{ type: string; [key: string]: unknown }>,
      opts?: { instructions?: string; getInstructions?: () => Promise<string> },
    ) {
      return {
        id: "log-agent",
        name: "Log Agent",
        instructions: opts?.instructions,
        getInstructions: opts?.getInstructions,
        async stream(_prompt: string, _opts?: unknown) {
          return {
            fullStream: (async function* () {
              for (const chunk of chunks) yield chunk;
            })(),
          };
        },
      };
    }

    it("logs session with instructions from agent.instructions", async () => {
      logDir = join(
        tmpdir(),
        `ph-clint-log-test-${randomBytes(4).toString("hex")}`,
      );
      const helpers = createMastraHelpers(makeAgentSetupContext());
      const agent = createStreamingAgent(
        [{ type: "text-delta", textDelta: "hello" }],
        { instructions: "You are a helpful assistant" },
      );
      const provider = helpers.wrapAgent(agent, {
        enableLogging: true,
        logDirectory: logDir,
      });

      const chunks: any[] = [];
      for await (const chunk of provider.stream("test prompt", {
        threadId: "log-thread",
      })) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe("text-delta");

      // Log file should have been created
      const files = await readdir(logDir);
      expect(files.length).toBeGreaterThan(0);
    });

    it("logs session with getInstructions() function", async () => {
      logDir = join(
        tmpdir(),
        `ph-clint-log-test-${randomBytes(4).toString("hex")}`,
      );
      const helpers = createMastraHelpers(makeAgentSetupContext());
      const agent = createStreamingAgent(
        [{ type: "text-delta", textDelta: "response" }],
        { getInstructions: async () => "dynamic instructions" },
      );
      const provider = helpers.wrapAgent(agent, {
        enableLogging: true,
        logDirectory: logDir,
      });

      const chunks: any[] = [];
      for await (const chunk of provider.stream("hello")) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
    });

    it("handles getInstructions() throwing gracefully", async () => {
      logDir = join(
        tmpdir(),
        `ph-clint-log-test-${randomBytes(4).toString("hex")}`,
      );
      const helpers = createMastraHelpers(makeAgentSetupContext());
      const agent = createStreamingAgent(
        [{ type: "text-delta", textDelta: "ok" }],
        {
          getInstructions: async () => {
            throw new Error("no instructions");
          },
        },
      );
      const provider = helpers.wrapAgent(agent, {
        enableLogging: true,
        logDirectory: logDir,
      });

      const chunks: any[] = [];
      for await (const chunk of provider.stream("hello")) {
        chunks.push(chunk);
      }
      expect(chunks).toHaveLength(1);
    });

    it("logs error when stream throws", async () => {
      logDir = join(
        tmpdir(),
        `ph-clint-log-test-${randomBytes(4).toString("hex")}`,
      );
      const helpers = createMastraHelpers(makeAgentSetupContext());
      const errorAgent = {
        id: "err-agent",
        name: "Error Agent",
        async stream() {
          return {
            fullStream: (async function* () {
              yield { type: "text-delta", textDelta: "partial" };
              throw new Error("stream exploded");
            })(),
          };
        },
      };
      const provider = helpers.wrapAgent(errorAgent, {
        enableLogging: true,
        logDirectory: logDir,
      });

      const chunks: any[] = [];
      await expect(async () => {
        for await (const chunk of provider.stream("hello")) {
          chunks.push(chunk);
        }
      }).rejects.toThrow("stream exploded");

      // Should have collected the partial chunk before the error
      expect(chunks).toHaveLength(1);
    });
  });
});

describe("mapMastraStream", () => {
  it("maps error chunks", async () => {
    async function* fakeStream() {
      yield { type: "error", error: "API rate limit" };
    }
    const chunks: any[] = [];
    for await (const chunk of mapMastraStream(fakeStream())) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].error).toContain("API rate limit");
  });

  it("maps error chunk with payload format", async () => {
    async function* fakeStream() {
      yield { type: "error", payload: { error: "wrapped error" } };
    }
    const chunks: any[] = [];
    for await (const chunk of mapMastraStream(fakeStream())) {
      chunks.push(chunk);
    }
    expect(chunks[0].error).toContain("wrapped error");
  });

  it("falls back to stringifying chunk when error field is missing", async () => {
    async function* fakeStream() {
      yield { type: "error" };
    }
    const chunks: any[] = [];
    for await (const chunk of mapMastraStream(fakeStream())) {
      chunks.push(chunk);
    }
    expect(chunks[0].type).toBe("error");
    expect(chunks[0].error).toContain("object");
  });
});

describe("getTools with MCP discovery", () => {
  function makeMockServiceManager(
    instances: ServiceInstanceStatus[],
  ): ServiceManager {
    return {
      start: async () => "",
      stop: async () => {},
      list: () => instances,
      getDefinition: () => undefined,
      logs: () => "",
      watchLogs: () => () => {},
      scanProjects: () => [],
      purgeStoppedInstances: () => {},
    };
  }

  it("getTools({ includeMcp: false }) returns only CLI tools", async () => {
    const ctx = makeAgentSetupContext();
    // Add a mock service manager with an api-mcp endpoint
    ctx.context.services = makeMockServiceManager([
      {
        serviceId: "test",
        instanceId: "test",
        name: "Test",
        status: "ready",
        endpoints: { "mcp-server": "http://localhost:4567/mcp" },
        endpointTypes: { "mcp-server": "api-mcp" },
      },
    ]);

    const helpers = createMastraHelpers(ctx);
    const tools = await helpers.getTools({ includeMcp: false });
    // Should only have CLI tools, not MCP tools
    expect(Object.keys(tools)).toEqual(["echo"]);
  });

  it("getTools() returns CLI tools when no services manager", async () => {
    const helpers = createMastraHelpers(makeAgentSetupContext());
    const tools = await helpers.getTools();
    expect(Object.keys(tools)).toEqual(["echo"]);
  });

  it("getTools() returns CLI tools when services have no api-mcp endpoints", async () => {
    const ctx = makeAgentSetupContext();
    ctx.context.services = makeMockServiceManager([
      {
        serviceId: "test",
        instanceId: "test",
        name: "Test",
        status: "ready",
        endpoints: { web: "http://localhost:3000" },
        endpointTypes: { web: "website" },
      },
    ]);

    const helpers = createMastraHelpers(ctx);
    const tools = await helpers.getTools();
    expect(Object.keys(tools)).toEqual(["echo"]);
  });

  it("getTools() throws when api-mcp service is ready but no MCPClient provided", async () => {
    const ctx = makeAgentSetupContext();
    ctx.context.services = makeMockServiceManager([
      {
        serviceId: "test",
        instanceId: "test",
        name: "Test",
        status: "ready",
        endpoints: { "mcp-server": "http://localhost:4567/mcp" },
        endpointTypes: { "mcp-server": "api-mcp" },
      },
    ]);

    const helpers = createMastraHelpers(ctx);
    await expect(helpers.getTools()).rejects.toThrow(/MCPClient/);
  });

  it("getTools({ includeMcp: false }) skips error even with api-mcp services", async () => {
    const ctx = makeAgentSetupContext();
    ctx.context.services = makeMockServiceManager([
      {
        serviceId: "test",
        instanceId: "test",
        name: "Test",
        status: "ready",
        endpoints: { "mcp-server": "http://localhost:4567/mcp" },
        endpointTypes: { "mcp-server": "api-mcp" },
      },
    ]);

    const helpers = createMastraHelpers(ctx);
    const tools = await helpers.getTools({ includeMcp: false });
    expect(Object.keys(tools)).toEqual(["echo"]);
  });

  it("getTools() returns CLI tools when services are not ready", async () => {
    const ctx = makeAgentSetupContext();
    ctx.context.services = makeMockServiceManager([
      {
        serviceId: "test",
        instanceId: "test",
        name: "Test",
        status: "starting",
        endpoints: { "mcp-server": "http://localhost:4567/mcp" },
        endpointTypes: { "mcp-server": "api-mcp" },
      },
    ]);

    const helpers = createMastraHelpers(ctx);
    const tools = await helpers.getTools();
    expect(Object.keys(tools)).toEqual(["echo"]);
  });
});

describe("commandsToMastraTools", () => {
  it("converts ph-clint commands to Mastra tools", async () => {
    const tools = await commandsToMastraTools([echoCommand], {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
    });
    expect(Object.keys(tools)).toEqual(["echo"]);
    expect(tools.echo).toBeDefined();
  });

  it("returns empty object for empty commands", async () => {
    const tools = await commandsToMastraTools([], {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
    });
    expect(tools).toEqual({});
  });

  it("tool execute calls the original command", async () => {
    const tools = await commandsToMastraTools([echoCommand], {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
    });
    const tool = tools.echo;
    const result = await tool.execute!({ text: "hello" }, {} as any);
    expect(result).toEqual({ text: "hello" });
  });

  it("routes stdout through _onToolOutput hook when set", async () => {
    const captured: { toolName: string; text: string }[] = [];
    const stdoutCmd = defineCommand({
      id: "verbose",
      description: "Writes to stdout",
      inputSchema: z.object({}),
      execute: async (_input, ctx) => {
        ctx.stdout("line 1\n");
        ctx.stdout("line 2\n");
        return { text: "done" };
      },
    });

    const context: any = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: () => {},
      _onToolOutput: (toolName: string, text: string) => {
        captured.push({ toolName, text });
      },
    };

    const tools = await commandsToMastraTools([stdoutCmd], context);
    await tools.verbose.execute!({}, {} as any);

    expect(captured).toEqual([
      { toolName: "verbose", text: "line 1\n" },
      { toolName: "verbose", text: "line 2\n" },
    ]);
  });

  it("falls through to original stdout when _onToolOutput is not set", async () => {
    const stdoutLines: string[] = [];
    const stdoutCmd = defineCommand({
      id: "verbose",
      description: "Writes to stdout",
      inputSchema: z.object({}),
      execute: async (_input, ctx) => {
        ctx.stdout("output\n");
        return { text: "done" };
      },
    });

    const context: any = {
      workspace: createMemoryWorkdirStore(),
      config: {},
      workdir: "",
      stdout: (text: string) => {
        stdoutLines.push(text);
      },
    };

    const tools = await commandsToMastraTools([stdoutCmd], context);
    await tools.verbose.execute!({}, {} as any);

    expect(stdoutLines).toEqual(["output\n"]);
  });
});
