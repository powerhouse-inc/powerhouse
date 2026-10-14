// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, afterEach } from "vitest";
import { createRoutine } from "../src/core/routine.js";
import {
  createRoutineServiceAdapter,
  createCompositeServiceManager,
} from "../src/core/routine-service.js";
import { defineTrigger } from "../src/core/trigger.js";
import { createEventBus } from "../src/core/events.js";
import type {
  Routine,
  RoutineConfig,
  ServiceManager,
} from "../src/core/types.js";
import {
  TEST_TICK_INTERVAL,
  TEST_IDLE_INTERVAL,
  ROUTINE_ONE_TICK_WAIT,
} from "./fixtures/timing.js";

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

function makeConfig(overrides: Partial<RoutineConfig> = {}): RoutineConfig {
  return {
    id: "watcher",
    name: "File Watcher",
    tickInterval: TEST_TICK_INTERVAL,
    idleInterval: TEST_IDLE_INTERVAL,
    ...overrides,
  };
}

describe("createRoutineServiceAdapter", () => {
  describe("list", () => {
    it("returns idle status when routine is not started", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      const statuses = adapter.list("watcher");
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.status).toBe("idle");
      expect(statuses[0]!.serviceId).toBe("watcher");
      expect(statuses[0]!.name).toBe("File Watcher");
    });

    it("returns ready status when routine is running", async () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await adapter.start("watcher");
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      const statuses = adapter.list("watcher");
      expect(statuses[0]!.status).toBe("ready");
    });

    it("returns empty array for unknown service ID", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(adapter.list("unknown")).toEqual([]);
    });

    it("returns all when no serviceId filter", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(adapter.list()).toHaveLength(1);
    });
  });

  describe("start", () => {
    it("starts the routine and returns instance ID", async () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      const instanceId = await adapter.start("watcher");
      expect(instanceId).toBe("watcher");
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      expect(routine.status).toBe("running");
    });

    it("throws when already running", async () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await adapter.start("watcher");
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      await expect(adapter.start("watcher")).rejects.toThrow("already running");
    });

    it("throws for unknown service ID", async () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await expect(adapter.start("unknown")).rejects.toThrow("Unknown service");
    });

    it("stores workdir when provided", async () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await adapter.start("watcher", { workdir: "/tmp/proj" });
      const statuses = adapter.list("watcher");
      expect(statuses[0]!.workdir).toBe("/tmp/proj");
    });

    it("emits service:ready event", async () => {
      const bus = createEventBus();
      let readyEvent: unknown;
      bus.on("service:ready", (data) => {
        readyEvent = data;
      });

      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig(), bus);
      await adapter.start("watcher");
      expect(readyEvent).toEqual({
        id: "watcher",
        instanceId: "watcher",
        name: "File Watcher",
      });
    });
  });

  describe("stop", () => {
    it("stops a running routine", async () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await adapter.start("watcher");
      await new Promise((r) => setTimeout(r, TEST_IDLE_INTERVAL));
      await adapter.stop("watcher");
      expect(routine.status).toBe("ready");
    });

    it("throws when not running", async () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await expect(adapter.stop("watcher")).rejects.toThrow("not running");
    });

    it("throws for unknown service ID", async () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await expect(adapter.stop("unknown")).rejects.toThrow("Unknown service");
    });

    it("emits service:stopped event", async () => {
      const bus = createEventBus();
      let stoppedEvent: unknown;
      bus.on("service:stopped", (data) => {
        stoppedEvent = data;
      });

      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig(), bus);
      await adapter.start("watcher");
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await adapter.stop("watcher");
      expect(stoppedEvent).toEqual({
        id: "watcher",
        instanceId: "watcher",
        name: "File Watcher",
      });
    });
  });

  describe("logs", () => {
    it("returns empty string when no output", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(adapter.logs("watcher")).toBe("");
    });

    it("captures onOutput into log buffer", async () => {
      const trigger = defineTrigger({
        id: "log-trigger",
        type: "condition",
        poll: async () => {
          return {
            type: "function" as const,
            params: { fn: async () => "log-line" },
          };
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await adapter.start("watcher");
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await adapter.stop("watcher");

      const logOutput = adapter.logs("watcher");
      expect(logOutput).toContain("log-line");
    });

    it("throws for unknown service", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(() => adapter.logs("unknown")).toThrow("Unknown service");
    });
  });

  describe("getDefinition", () => {
    it("returns synthetic definition for matching ID", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      const def = adapter.getDefinition("watcher");
      expect(def).toBeDefined();
      expect(def!.id).toBe("watcher");
      expect(def!.name).toBe("File Watcher");
      expect(def!.maxInstances).toBe(1);
    });

    it("returns undefined for non-matching ID", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(adapter.getDefinition("other")).toBeUndefined();
    });

    it("includes projectScanner when configured", () => {
      routine = makeRoutine();
      const scanner = { isProjectFolder: () => true };
      const adapter = createRoutineServiceAdapter(
        routine,
        makeConfig({ projectScanner: scanner }),
      );
      const def = adapter.getDefinition("watcher");
      expect(def!.projectScanner).toBe(scanner);
    });
  });

  describe("watchLogs", () => {
    it("streams new output to listener", async () => {
      let once = true;
      const trigger = defineTrigger({
        id: "watch-trigger",
        type: "condition",
        poll: async () => {
          if (once) {
            once = false;
            return {
              type: "function" as const,
              params: { fn: async () => "watched" },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      const adapter = createRoutineServiceAdapter(routine, makeConfig());

      const lines: string[] = [];
      const cleanup = adapter.watchLogs("watcher", "watcher", (line) =>
        lines.push(line),
      );

      await adapter.start("watcher");
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await adapter.stop("watcher");
      cleanup();

      expect(lines).toContain("watched");
    });

    it("throws for unknown service", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(() => adapter.watchLogs("unknown", "x", () => {})).toThrow(
        "Unknown service",
      );
    });
  });

  describe("scanProjects", () => {
    it("returns empty when no projectScanner", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(adapter.scanProjects("watcher", "/tmp")).toEqual([]);
    });

    it("throws for unknown service", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(() => adapter.scanProjects("unknown", "/tmp")).toThrow(
        "Unknown service",
      );
    });
  });

  describe("purgeStoppedInstances", () => {
    it("clears log buffer", async () => {
      let once = true;
      const trigger = defineTrigger({
        id: "purge-trigger",
        type: "condition",
        poll: async () => {
          if (once) {
            once = false;
            return {
              type: "function" as const,
              params: { fn: async () => "data" },
            };
          }
          return null;
        },
      });

      routine = makeRoutine({ triggers: [trigger] });
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      await adapter.start("watcher");
      await new Promise((r) => setTimeout(r, ROUTINE_ONE_TICK_WAIT));
      await adapter.stop("watcher");

      expect(adapter.logs("watcher")).toContain("data");
      adapter.purgeStoppedInstances("watcher");
      expect(adapter.logs("watcher")).toBe("");
    });

    it("throws for unknown service", () => {
      routine = makeRoutine();
      const adapter = createRoutineServiceAdapter(routine, makeConfig());
      expect(() => adapter.purgeStoppedInstances("unknown")).toThrow(
        "Unknown service",
      );
    });
  });
});

describe("createCompositeServiceManager", () => {
  function makeMockManager(serviceId: string): ServiceManager {
    const started = new Map<string, boolean>();
    return {
      async start(id) {
        if (id !== serviceId) throw new Error(`Unknown service: ${id}`);
        started.set(id, true);
        return id;
      },
      async stop(id) {
        if (id !== serviceId) throw new Error(`Unknown service: ${id}`);
        started.set(id, false);
      },
      list(sid) {
        if (sid && sid !== serviceId) return [];
        return [
          {
            serviceId,
            instanceId: serviceId,
            name: serviceId,
            status: started.get(serviceId)
              ? ("ready" as const)
              : ("idle" as const),
          },
        ];
      },
      getDefinition(id) {
        if (id !== serviceId) return undefined;
        return {
          id: serviceId,
          name: serviceId,
          command: "echo",
          maxInstances: 1,
        };
      },
      logs(id) {
        if (id !== serviceId) throw new Error(`Unknown service: ${id}`);
        return "mock-logs";
      },
      watchLogs(id, _iid, _cb) {
        if (id !== serviceId) throw new Error(`Unknown service: ${id}`);
        return () => {};
      },
      watchChunks(id, _iid, _cb) {
        if (id !== serviceId) throw new Error(`Unknown service: ${id}`);
        return () => {};
      },
      scanProjects(id) {
        if (id !== serviceId) throw new Error(`Unknown service: ${id}`);
        return [];
      },
      purgeStoppedInstances(id) {
        if (id !== serviceId) throw new Error(`Unknown service: ${id}`);
      },
    };
  }

  it("routes start to correct manager", async () => {
    const m1 = makeMockManager("svc-a");
    const m2 = makeMockManager("svc-b");
    const routeMap = new Map<string, ServiceManager>([
      ["svc-a", m1],
      ["svc-b", m2],
    ]);
    const composite = createCompositeServiceManager([m1, m2], routeMap);

    const id = await composite.start("svc-b");
    expect(id).toBe("svc-b");
  });

  it("routes stop to correct manager", async () => {
    const m1 = makeMockManager("svc-a");
    const routeMap = new Map<string, ServiceManager>([["svc-a", m1]]);
    const composite = createCompositeServiceManager([m1], routeMap);

    await composite.start("svc-a");
    await composite.stop("svc-a");
    const statuses = composite.list("svc-a");
    expect(statuses[0]!.status).toBe("idle");
  });

  it("aggregates list from all managers when no filter", async () => {
    const m1 = makeMockManager("svc-a");
    const m2 = makeMockManager("svc-b");
    const routeMap = new Map<string, ServiceManager>([
      ["svc-a", m1],
      ["svc-b", m2],
    ]);
    const composite = createCompositeServiceManager([m1, m2], routeMap);

    const all = composite.list();
    expect(all).toHaveLength(2);
    expect(all.map((s) => s.serviceId)).toEqual(["svc-a", "svc-b"]);
  });

  it("filters list by serviceId", () => {
    const m1 = makeMockManager("svc-a");
    const m2 = makeMockManager("svc-b");
    const routeMap = new Map<string, ServiceManager>([
      ["svc-a", m1],
      ["svc-b", m2],
    ]);
    const composite = createCompositeServiceManager([m1, m2], routeMap);

    const filtered = composite.list("svc-a");
    expect(filtered).toHaveLength(1);
    expect(filtered[0]!.serviceId).toBe("svc-a");
  });

  it("routes getDefinition to correct manager", () => {
    const m1 = makeMockManager("svc-a");
    const routeMap = new Map<string, ServiceManager>([["svc-a", m1]]);
    const composite = createCompositeServiceManager([m1], routeMap);

    expect(composite.getDefinition("svc-a")?.id).toBe("svc-a");
    expect(composite.getDefinition("unknown")).toBeUndefined();
  });

  it("routes logs to correct manager", () => {
    const m1 = makeMockManager("svc-a");
    const routeMap = new Map<string, ServiceManager>([["svc-a", m1]]);
    const composite = createCompositeServiceManager([m1], routeMap);

    expect(composite.logs("svc-a")).toBe("mock-logs");
  });

  it("routes watchLogs to correct manager", () => {
    const m1 = makeMockManager("svc-a");
    const routeMap = new Map<string, ServiceManager>([["svc-a", m1]]);
    const composite = createCompositeServiceManager([m1], routeMap);

    const cleanup = composite.watchLogs("svc-a", "svc-a", () => {});
    expect(typeof cleanup).toBe("function");
    cleanup();
  });

  it("routes scanProjects to correct manager", () => {
    const m1 = makeMockManager("svc-a");
    const routeMap = new Map<string, ServiceManager>([["svc-a", m1]]);
    const composite = createCompositeServiceManager([m1], routeMap);

    expect(composite.scanProjects("svc-a", "/tmp")).toEqual([]);
  });

  it("routes purgeStoppedInstances to correct manager", () => {
    const m1 = makeMockManager("svc-a");
    const routeMap = new Map<string, ServiceManager>([["svc-a", m1]]);
    const composite = createCompositeServiceManager([m1], routeMap);

    // Should not throw
    composite.purgeStoppedInstances("svc-a");
  });

  it("throws for unknown service on start", async () => {
    const composite = createCompositeServiceManager([], new Map());
    await expect(composite.start("unknown")).rejects.toThrow("Unknown service");
  });
});
