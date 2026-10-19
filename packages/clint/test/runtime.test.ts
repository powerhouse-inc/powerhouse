// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, vi } from "vitest";
import { createCliRuntime } from "../src/core/runtime.js";
import type { CliRuntimeDeps } from "../src/core/runtime.js";
import type {
  AgentProvider,
  CommandContext,
  Logger,
  Routine,
  WorkdirStore,
} from "../src/core/types.js";
import type { ReactorContext } from "../src/integrations/powerhouse/types.js";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import { defineCommand } from "../src/core/command.js";
import { z } from "zod";

const noopCommand = defineCommand({
  id: "noop",
  description: "Does nothing",
  inputSchema: z.object({}),
  execute: async () => undefined,
});

function createMinimalDeps(
  overrides?: Partial<CliRuntimeDeps>,
): CliRuntimeDeps {
  const log: Logger = {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
  };
  const context: CommandContext = {
    workspace: createMemoryWorkdirStore(),
    config: {},
    workdir: "/tmp/test",
    stdout: () => {},
    runProcess: () => Promise.resolve({ success: true, output: "" }),
  };
  return {
    cliName: "test-rt",
    cliVersion: "0.0.1",
    workdir: "/tmp/test",
    workspace: createMemoryWorkdirStore(),
    config: {},
    context,
    log,
    commandMap: new Map([["noop", noopCommand]]),
    skillIds: new Set<string>(),
    resolvedSkills: [],
    ...overrides,
  };
}

function createMockReactor(
  overrides?: Partial<ReactorContext>,
): ReactorContext {
  return {
    client: { fake: true } as any,
    driveId: "test-drive",
    shutdown: async () => {},
    ...overrides,
  };
}

function createMockRoutine(overrides?: Partial<Routine>): Routine {
  let status: "idle" | "running" | "stopping" = "idle";
  return {
    get status() {
      return status;
    },
    triggerIds: [],
    queueLength: 0,
    start() {
      status = "running";
    },
    async stop() {
      status = "idle";
    },
    setContext() {},
    setCapabilities() {},
    ...overrides,
  };
}

describe("createCliRuntime()", () => {
  describe("getReactor()", () => {
    it("returns undefined when no reactorConfig", async () => {
      const runtime = createCliRuntime(createMinimalDeps());
      expect(await runtime.getReactor()).toBeUndefined();
    });

    it("calls create factory and returns reactor", async () => {
      const reactor = createMockReactor();
      const createFn = vi
        .fn<() => Promise<ReactorContext>>()
        .mockResolvedValue(reactor);
      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: { create: createFn },
        }),
      );

      const result = await runtime.getReactor();
      expect(result).toBe(reactor);
      expect(createFn).toHaveBeenCalledTimes(1);
    });

    it("caches reactor on subsequent calls", async () => {
      const createFn = vi
        .fn<() => Promise<ReactorContext>>()
        .mockResolvedValue(createMockReactor());
      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: { create: createFn },
        }),
      );

      await runtime.getReactor();
      await runtime.getReactor();
      expect(createFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("getAgent()", () => {
    it("returns undefined when no agentLoader", async () => {
      const runtime = createCliRuntime(createMinimalDeps());
      expect(await runtime.getAgent()).toBeUndefined();
    });

    it("calls agentLoader and returns provider", async () => {
      const provider: AgentProvider = {
        id: "test-agent",
        async *stream() {
          yield { type: "text-delta" as const, text: "hi" };
        },
      };
      const agentLoader = vi
        .fn<() => Promise<AgentProvider>>()
        .mockResolvedValue(provider);
      const runtime = createCliRuntime(createMinimalDeps({ agentLoader }));

      const result = await runtime.getAgent();
      expect(result).toBe(provider);
      expect(agentLoader).toHaveBeenCalledTimes(1);
    });

    it("initializes reactor before loading agent", async () => {
      const callOrder: string[] = [];
      const reactor = createMockReactor();
      const createFn = vi
        .fn<() => Promise<ReactorContext>>()
        .mockImplementation(async () => {
          callOrder.push("reactor");
          return reactor;
        });
      const agentLoader = vi
        .fn<() => Promise<AgentProvider>>()
        .mockImplementation(async () => {
          callOrder.push("agent");
          return { id: "test", async *stream() {} };
        });

      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: { create: createFn },
          agentLoader,
        }),
      );

      await runtime.getAgent();
      expect(callOrder).toEqual(["reactor", "agent"]);
    });

    it("caches agent on subsequent calls", async () => {
      const agentLoader = vi
        .fn<() => Promise<AgentProvider>>()
        .mockResolvedValue({
          id: "test",
          async *stream() {},
        });
      const runtime = createCliRuntime(createMinimalDeps({ agentLoader }));

      await runtime.getAgent();
      await runtime.getAgent();
      expect(agentLoader).toHaveBeenCalledTimes(1);
    });

    it("passes correct context to agentLoader", async () => {
      const agentLoader = vi
        .fn<() => Promise<AgentProvider>>()
        .mockResolvedValue({
          id: "test",
          async *stream() {},
        });
      const deps = createMinimalDeps({ agentLoader });
      const runtime = createCliRuntime(deps);

      await runtime.getAgent();
      const ctx = agentLoader.mock.calls[0][0];
      expect(ctx.cliName).toBe("test-rt");
      expect(ctx.cliVersion).toBe("0.0.1");
      expect(ctx.workdir).toBe("/tmp/test");
      expect(ctx.commands).toEqual([noopCommand]);
      expect(ctx.skills).toEqual([]);
    });

    it("filters skill commands from agent context", async () => {
      const skillCmd = defineCommand({
        id: "my-skill",
        description: "A skill",
        inputSchema: z.object({}),
        execute: async () => undefined,
      });
      const agentLoader = vi
        .fn<() => Promise<AgentProvider>>()
        .mockResolvedValue({
          id: "test",
          async *stream() {},
        });
      const deps = createMinimalDeps({
        agentLoader,
        skillIds: new Set(["my-skill"]),
      });
      deps.commandMap.set("my-skill", skillCmd);

      const runtime = createCliRuntime(deps);
      await runtime.getAgent();

      const ctx = agentLoader.mock.calls[0][0];
      expect(ctx.commands.map((c: any) => c.id)).not.toContain("my-skill");
      expect(ctx.commands.map((c: any) => c.id)).toContain("noop");
    });
  });

  describe("startupSequence()", () => {
    it('outputs "Reactor ready" when reactorConfig is provided', async () => {
      const reactor = createMockReactor();
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: { create: async () => reactor },
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(lines).toContain("Reactor ready (drive: test-drive)");
    });

    it('outputs "Proxy listening" when proxyInstance is provided', async () => {
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          proxyInstance: {
            port: 8080,
            host: "localhost",
            url: "http://localhost:8080",
            addRoute: () => {},
            removeRoutesBySource: () => {},
            getRoutes: () => [],
            stop: async () => {},
          },
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(lines).toContain("Proxy listening on http://localhost:8080");
    });

    it('starts routine and outputs "Routine running"', async () => {
      const routine = createMockRoutine();
      const lines: string[] = [];
      const runtime = createCliRuntime(createMinimalDeps({ routine }));

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(lines).toContain("Routine running");
      expect(routine.status).toBe("running");
    });

    it("does not start routine when skipRoutineStart is true", async () => {
      const routine = createMockRoutine();
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          routine,
          skipRoutineStart: true,
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(lines).not.toContain("Routine running");
      expect(routine.status).toBe("idle");
    });

    it("calls teardown and rethrows on startup error", async () => {
      const shutdownFn = vi
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined);
      const reactor = createMockReactor({ shutdown: shutdownFn });
      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: {
            create: async () => {
              throw new Error("reactor init failed");
            },
          },
        }),
      );

      await expect(runtime.startupSequence(() => {})).rejects.toThrow(
        "reactor init failed",
      );
    });

    it("does not output connect section when enableConnect is false", async () => {
      const reactor = createMockReactor();
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: {
            create: async () => reactor,
            connect: { enabled: true, name: "studio", port: 3000 },
          },
          enableConnect: false,
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(lines.join("\n")).not.toContain("Connect");
    });
  });

  describe("teardown()", () => {
    it("shuts down reactor when initialized", async () => {
      const shutdownFn = vi
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined);
      const reactor = createMockReactor({ shutdown: shutdownFn });
      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: { create: async () => reactor },
        }),
      );

      // Initialize reactor first
      await runtime.getReactor();
      await runtime.teardown();
      expect(shutdownFn).toHaveBeenCalledTimes(1);
    });

    it("does not call shutdown when reactor was never initialized", async () => {
      const shutdownFn = vi
        .fn<() => Promise<void>>()
        .mockResolvedValue(undefined);
      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: {
            create: async () => createMockReactor({ shutdown: shutdownFn }),
          },
        }),
      );

      // Don't initialize — just teardown
      await runtime.teardown();
      expect(shutdownFn).not.toHaveBeenCalled();
    });

    it("stops proxy when provided", async () => {
      const stopFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const runtime = createCliRuntime(
        createMinimalDeps({
          proxyInstance: {
            port: 8080,
            host: "localhost",
            url: "http://localhost:8080",
            addRoute: () => {},
            removeRoutesBySource: () => {},
            getRoutes: () => [],
            stop: stopFn,
          },
        }),
      );

      await runtime.teardown();
      expect(stopFn).toHaveBeenCalledTimes(1);
    });

    it("stops routine when running", async () => {
      const routine = createMockRoutine();
      const runtime = createCliRuntime(createMinimalDeps({ routine }));

      // Start the routine
      await runtime.startupSequence(() => {});
      expect(routine.status).toBe("running");

      await runtime.teardown();
      expect(routine.status).toBe("idle");
    });

    it("does not stop routine when idle", async () => {
      const stopFn = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
      const routine = createMockRoutine({ stop: stopFn });
      const runtime = createCliRuntime(
        createMinimalDeps({
          routine,
          skipRoutineStart: true,
        }),
      );

      await runtime.startupSequence(() => {});
      await runtime.teardown();
      // stop should not be called since routine was never started
      expect(stopFn).not.toHaveBeenCalled();
    });
  });

  describe("reportActiveServices()", () => {
    it("does nothing when context.services is undefined", () => {
      const lines: string[] = [];
      const runtime = createCliRuntime(createMinimalDeps());
      runtime.reportActiveServices((msg) => lines.push(msg));
      expect(lines).toHaveLength(0);
    });

    it("reports active services", () => {
      const lines: string[] = [];
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services: {
          start: async () => "inst-1",
          stop: async () => {},
          list: () => [
            {
              serviceId: "my-svc",
              instanceId: "inst-1",
              name: "My Service",
              status: "ready" as const,
              workdir: "/foo/bar",
              pid: 1234,
              startedAt: new Date().toISOString(),
            },
          ],
          getDefinition: () => undefined,
          logs: () => "",
          watchLogs: () => () => {},
          watchChunks: () => () => {},
          scanProjects: () => [],
          purgeStoppedInstances: () => {},
        },
      };
      const runtime = createCliRuntime(createMinimalDeps({ context }));
      runtime.reportActiveServices((msg) => lines.push(msg));
      expect(lines.length).toBeGreaterThan(0);
      expect(lines[0]).toContain("My Service still active");
      expect(lines[0]).toContain("/foo/bar");
      expect(lines[0]).toContain("my-svc-stop");
    });

    it("reports service without workdir", () => {
      const lines: string[] = [];
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services: {
          start: async () => "inst-1",
          stop: async () => {},
          list: () => [
            {
              serviceId: "bg",
              instanceId: "i-2",
              name: "Background",
              status: "starting" as const,
              pid: 5678,
              startedAt: new Date().toISOString(),
            },
          ],
          getDefinition: () => undefined,
          logs: () => "",
          watchLogs: () => () => {},
          watchChunks: () => () => {},
          scanProjects: () => [],
          purgeStoppedInstances: () => {},
        },
      };
      const runtime = createCliRuntime(createMinimalDeps({ context }));
      runtime.reportActiveServices((msg) => lines.push(msg));
      expect(lines[0]).toContain("Background still active");
      expect(lines[0]).not.toContain("`/");
    });

    it("does not report stopped services", () => {
      const lines: string[] = [];
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services: {
          start: async () => "inst-1",
          stop: async () => {},
          list: () => [
            {
              serviceId: "dead",
              instanceId: "i-3",
              name: "Dead Service",
              status: "stopped" as const,
              pid: 0,
              startedAt: new Date().toISOString(),
            },
          ],
          getDefinition: () => undefined,
          logs: () => "",
          watchLogs: () => () => {},
          watchChunks: () => () => {},
          scanProjects: () => [],
          purgeStoppedInstances: () => {},
        },
      };
      const runtime = createCliRuntime(createMinimalDeps({ context }));
      runtime.reportActiveServices((msg) => lines.push(msg));
      expect(lines).toHaveLength(0);
    });
  });

  describe("startupSequence() — connect section", () => {
    function createServicesStub(instances: any[] = []) {
      return {
        start: vi.fn<() => Promise<string>>().mockResolvedValue("inst-new"),
        stop: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
        list: vi.fn<() => any[]>().mockReturnValue(instances),
        getDefinition: () => undefined,
        logs: () => "",
        watchLogs: () => () => {},
        watchChunks: () => () => {},
        scanProjects: () => [],
        purgeStoppedInstances: () => {},
      };
    }

    it("starts connect when no running instance exists", async () => {
      const services = createServicesStub([]);
      const reactor = createMockReactor();
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services,
      };
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          context,
          reactorConfig: {
            create: async () => reactor,
            connect: { enabled: true, name: "my-studio", port: 4000 },
          },
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(services.start).toHaveBeenCalledWith(
        "my-studio",
        expect.objectContaining({
          workdir: "/tmp/test",
        }),
      );
      expect(lines.join("\n")).toContain("Connect 'my-studio' ready at");
    });

    it("reports already-running connect when workdir matches", async () => {
      const services = createServicesStub([
        {
          serviceId: "my-studio",
          instanceId: "inst-existing",
          name: "my-studio",
          status: "ready",
          workdir: "/tmp/test",
          endpoints: { "connect-studio": "http://localhost:4000" },
          pid: 123,
          startedAt: new Date().toISOString(),
        },
      ]);
      const reactor = createMockReactor();
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services,
      };
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          context,
          reactorConfig: {
            create: async () => reactor,
            connect: { enabled: true, name: "my-studio", port: 4000 },
          },
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(services.start).not.toHaveBeenCalled();
      expect(lines.join("\n")).toContain(
        "already running at http://localhost:4000",
      );
    });

    it("stops connect running in wrong workdir before starting", async () => {
      const services = createServicesStub([
        {
          serviceId: "my-studio",
          instanceId: "inst-old",
          name: "my-studio",
          status: "ready",
          workdir: "/other/dir",
          pid: 999,
          startedAt: new Date().toISOString(),
        },
      ]);
      const reactor = createMockReactor();
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services,
      };
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          context,
          reactorConfig: {
            create: async () => reactor,
            connect: { enabled: true, name: "my-studio", port: 4000 },
          },
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(services.stop).toHaveBeenCalledWith("my-studio");
      expect(services.start).toHaveBeenCalled();
    });

    it("lists drives when reactor has drives", async () => {
      const services = createServicesStub([]);
      const reactor = createMockReactor({
        driveUrl: "http://localhost:4001/d/test-drive",
        drives: [
          { id: "drive-a", name: "Project A", role: "owner" },
          { id: "drive-b", name: "Project B", role: "viewer" },
        ],
      });
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services,
      };
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          context,
          reactorConfig: {
            create: async () => reactor,
            connect: { enabled: true, name: "my-studio", port: 4000 },
          },
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      const driveOutput = lines.join("\n");
      expect(driveOutput).toContain("Drives:");
      expect(driveOutput).toContain("Project A (owner)");
      expect(driveOutput).toContain("Project B (viewer)");
    });

    it("outputs drive id fallback when driveUrl is missing", async () => {
      const services = createServicesStub([]);
      const reactor = createMockReactor({
        drives: [{ id: "drive-x", name: "X", role: "owner" }],
      });
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services,
      };
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          context,
          reactorConfig: {
            create: async () => reactor,
            connect: { enabled: true, name: "my-studio", port: 4000 },
          },
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      expect(lines.join("\n")).toContain("(drive: drive-x)");
    });

    it("passes driveUrl to connect params", async () => {
      const services = createServicesStub([]);
      const reactor = createMockReactor({
        driveUrl: "http://localhost:5000/d/test-drive",
      });
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
        services,
      };
      const runtime = createCliRuntime(
        createMinimalDeps({
          context,
          reactorConfig: {
            create: async () => reactor,
            connect: { enabled: true, name: "my-studio", port: 4000 },
          },
        }),
      );

      await runtime.startupSequence(() => {});
      expect(services.start).toHaveBeenCalledWith(
        "my-studio",
        expect.objectContaining({
          params: expect.objectContaining({
            driveUrl: "http://localhost:5000/d/test-drive",
            port: 4000,
          }),
        }),
      );
    });
  });

  describe("startupSequence() — folder operations", () => {
    it("injects folder commands when personalDriveId exists", async () => {
      const reactor = createMockReactor({ personalDriveId: "personal-1" });
      const commandMap = new Map([["noop", noopCommand]]);
      const lines: string[] = [];
      const runtime = createCliRuntime(
        createMinimalDeps({
          reactorConfig: { create: async () => reactor },
          commandMap,
        }),
      );

      await runtime.startupSequence((msg) => lines.push(msg));
      // Folder commands should have been injected into commandMap
      expect(commandMap.has("folders-add-document")).toBe(true);
    });

    it("sets context.folders when personalDriveId exists", async () => {
      const reactor = createMockReactor({ personalDriveId: "personal-1" });
      const context: CommandContext = {
        workspace: createMemoryWorkdirStore(),
        config: {},
        workdir: "/tmp/test",
        stdout: () => {},
        runProcess: () => Promise.resolve({ success: true, output: "" }),
      };
      const runtime = createCliRuntime(
        createMinimalDeps({
          context,
          reactorConfig: { create: async () => reactor },
        }),
      );

      await runtime.startupSequence(() => {});
      expect(context.folders).toBeDefined();
    });
  });

  describe("routine wiring", () => {
    it("calls setCapabilities on routine at construction time", () => {
      let capsReceived: any;
      const routine = createMockRoutine({
        setCapabilities(caps: any) {
          capsReceived = caps;
        },
      });

      createCliRuntime(createMinimalDeps({ routine }));
      expect(capsReceived).toBeDefined();
      expect(typeof capsReceived.getReactor).toBe("function");
      expect(typeof capsReceived.getAgent).toBe("function");
    });

    it("setContext is called during startupSequence", async () => {
      let contextReceived: any;
      const routine = createMockRoutine({
        setContext(ctx: any) {
          contextReceived = ctx;
        },
      });

      const deps = createMinimalDeps({ routine });
      const runtime = createCliRuntime(deps);
      await runtime.startupSequence(() => {});
      expect(contextReceived).toBe(deps.context);
    });
  });
});
