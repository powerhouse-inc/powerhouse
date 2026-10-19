// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import {
  defineService,
  createServiceManager,
  sanitizeLogText,
} from "../src/core/services.js";
import { createEventBus } from "../src/core/events.js";
import type { ServiceDefinition, EventBus } from "../src/core/types.js";
import {
  PROCESS_CLEANUP_WAIT,
  PROCESS_TEST_TIMEOUT,
  SERVICE_CRASH_DELAY,
  SERVICE_CRASH_WAIT,
  SERVICE_RESTART_WAIT,
  SERVICE_TEST_TIMEOUT,
  FORCE_KILL_SHUTDOWN_TIMEOUT,
  LOG_WATCH_WAIT,
} from "./fixtures/timing.js";

const TEST_SERVICE = path.resolve(
  import.meta.dirname,
  "fixtures/test-service.js",
);

function makeTmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "ph-svc-test-"));
}

/** Kill a process by PID, ignoring errors. */
function safeKill(pid: number): void {
  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    /* ignore */
  }
  try {
    process.kill(pid, "SIGKILL");
  } catch {
    /* ignore */
  }
}

/** Collect all PIDs from state files in a services dir (multi-instance layout). */
function collectPids(servicesDir: string): number[] {
  const pids: number[] = [];
  try {
    for (const dir of fs.readdirSync(servicesDir)) {
      const subDir = path.join(servicesDir, dir);
      try {
        const stat = fs.statSync(subDir);
        if (!stat.isDirectory()) continue;
        for (const f of fs.readdirSync(subDir)) {
          if (f.endsWith(".json")) {
            try {
              const state = JSON.parse(
                fs.readFileSync(path.join(subDir, f), "utf-8"),
              );
              if (state.pid) pids.push(state.pid);
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* ignore */
      }
    }
  } catch {
    /* ignore */
  }
  return pids;
}

describe("defineService", () => {
  it("returns the definition unchanged", () => {
    const def = defineService({
      id: "test",
      name: "Test",
      command: "echo hello",
    });
    expect(def.id).toBe("test");
    expect(def.name).toBe("Test");
    expect(def.command).toBe("echo hello");
  });

  it("preserves readiness config", () => {
    const def = defineService({
      id: "test",
      name: "Test",
      command: "node server.js",
      readiness: {
        pattern: /listening on port (\d+)/,
        timeout: 5000,
        captures: { port: 1 },
      },
    });
    expect(def.readiness?.pattern).toBeInstanceOf(RegExp);
    expect(def.readiness?.captures).toEqual({ port: 1 });
  });
});

describe("createServiceManager", () => {
  let tmpDir: string;
  let servicesDir: string;
  let eventBus: EventBus;
  let trackedPids: number[];

  beforeEach(() => {
    tmpDir = makeTmpDir();
    servicesDir = path.join(tmpDir, "services");
    eventBus = createEventBus();
    trackedPids = [];
  });

  afterEach(() => {
    // Clean up any spawned processes
    const pids = [...trackedPids, ...collectPids(servicesDir)];
    for (const pid of pids) {
      safeKill(pid);
    }
    // Clean up temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function createManager(
    defs: ServiceDefinition<any>[],
    config: Record<string, unknown> = {},
  ) {
    return createServiceManager(defs, { config, servicesDir, eventBus });
  }

  const readyDef: ServiceDefinition = {
    id: "test-svc",
    name: "Test Service",
    command: `node ${TEST_SERVICE}`,
    env: () => ({ TEST_SERVICE_MODE: "ready", TEST_SERVICE_PORT: "4567" }),
    readiness: {
      pattern: /Server listening on http:\/\/localhost:(\d+)/,
      timeout: 5000,
      captures: { port: 1 },
    },
    shutdown: { signal: "SIGTERM", timeout: 3000 },
  };

  describe("start()", () => {
    it("starts a service and detects readiness, returns instanceId", async () => {
      const mgr = createManager([readyDef]);
      const instanceId = await mgr.start("test-svc");

      expect(instanceId).toBe("test-svc");

      const statuses = mgr.list();
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.status).toBe("ready");
      expect(statuses[0]!.endpoints?.port).toBe("4567");
      expect(statuses[0]!.pid).toBeGreaterThan(0);
      trackedPids.push(statuses[0]!.pid!);
    });

    it("creates state file and per-run log file in service subdir", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");

      const statePath = path.join(servicesDir, "test-svc", "test-svc.json");

      expect(fs.existsSync(statePath)).toBe(true);

      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      expect(state.status).toBe("ready");
      expect(state.pid).toBeGreaterThan(0);
      trackedPids.push(state.pid);

      // State records the active per-run log file name.
      expect(state.logFile).toMatch(/^test-svc\.\d+\.log$/);
      const logPath = path.join(servicesDir, "test-svc", state.logFile);
      expect(fs.existsSync(logPath)).toBe(true);

      const logContent = fs.readFileSync(logPath, "utf-8");
      expect(logContent).toContain("listening");
    });

    it("throws when starting an already-running service", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");

      const statuses = mgr.list();
      trackedPids.push(statuses[0]!.pid!);

      await expect(mgr.start("test-svc")).rejects.toThrow(/already running/);
    });

    it("throws for unknown service", async () => {
      const mgr = createManager([readyDef]);
      await expect(mgr.start("nonexistent")).rejects.toThrow(/Unknown service/);
    });

    it('throws "already running" when status is starting', async () => {
      const slowDef: ServiceDefinition = {
        id: "slow-svc",
        name: "Slow Service",
        command: `node ${TEST_SERVICE}`,
        env: () => ({ TEST_SERVICE_MODE: "slow", READY_DELAY: "10000" }),
        readiness: {
          pattern: /Server listening/,
          timeout: 15000,
          wait: false,
        },
      };
      const mgr = createManager([slowDef]);
      await mgr.start("slow-svc");

      const statuses = mgr.list();
      trackedPids.push(statuses[0]!.pid!);

      // Manually write state as 'starting' to simulate an in-progress service
      const statePath = path.join(servicesDir, "slow-svc", "slow-svc.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      state.status = "starting";
      fs.writeFileSync(statePath, JSON.stringify(state));

      await expect(mgr.start("slow-svc")).rejects.toThrow(/already running/);
    });

    it("marks ready immediately when readiness.wait is false", async () => {
      const noWaitDef: ServiceDefinition = {
        id: "no-wait",
        name: "No Wait",
        command: `node ${TEST_SERVICE}`,
        env: () => ({ TEST_SERVICE_MODE: "slow", READY_DELAY: "5000" }),
        readiness: {
          pattern: /Server listening/,
          timeout: 10000,
          wait: false,
        },
      };
      const mgr = createManager([noWaitDef]);
      await mgr.start("no-wait");

      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("ready");
      trackedPids.push(statuses[0]!.pid!);
    });

    it("marks ready immediately when no readiness config", async () => {
      const noReadinessDef: ServiceDefinition = {
        id: "no-check",
        name: "No Check",
        command: `node ${TEST_SERVICE}`,
        env: () => ({ TEST_SERVICE_MODE: "no-ready" }),
      };
      const mgr = createManager([noReadinessDef]);
      await mgr.start("no-check");

      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("ready");
      trackedPids.push(statuses[0]!.pid!);
    });

    it(
      "fails on readiness timeout",
      async () => {
        const timeoutDef: ServiceDefinition = {
          id: "timeout",
          name: "Timeout",
          command: `node ${TEST_SERVICE}`,
          env: () => ({ TEST_SERVICE_MODE: "no-ready" }),
          readiness: {
            pattern: /will never match/,
            timeout: 500,
          },
        };
        const mgr = createManager([timeoutDef]);
        await expect(mgr.start("timeout")).rejects.toThrow(/timeout/i);

        const statuses = mgr.list();
        expect(statuses[0]!.status).toBe("failed");
      },
      PROCESS_TEST_TIMEOUT,
    );

    it("emits service:ready event with instanceId", async () => {
      const events: any[] = [];
      eventBus.on("service:ready", (data) => events.push(data));

      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe("test-svc");
      expect(events[0].instanceId).toBe("test-svc");
      expect(events[0].name).toBe("Test Service");
      expect(events[0].endpoints?.port).toBe("4567");
    });

    it(
      "emits service:failed on timeout",
      async () => {
        const events: any[] = [];
        eventBus.on("service:failed", (data) => events.push(data));

        const timeoutDef: ServiceDefinition = {
          id: "fail-svc",
          name: "Fail",
          command: `node ${TEST_SERVICE}`,
          env: () => ({ TEST_SERVICE_MODE: "no-ready" }),
          readiness: { pattern: /nope/, timeout: 500 },
        };
        const mgr = createManager([timeoutDef]);
        await mgr.start("fail-svc").catch(() => {});

        expect(events).toHaveLength(1);
        expect(events[0].error).toContain("timeout");
      },
      PROCESS_TEST_TIMEOUT,
    );

    it("enforces maxInstances limit", async () => {
      const singleDef: ServiceDefinition = {
        ...readyDef,
        maxInstances: 1,
      };
      const mgr = createManager([singleDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      // Second start with different name should fail
      await expect(mgr.start("test-svc", { name: "second" })).rejects.toThrow(
        /max instances/i,
      );
    });

    it("passes params to env function", async () => {
      const paramsDef: ServiceDefinition<{ apiPort: number }> = defineService({
        id: "params-svc",
        name: "Params Service",
        command: `node ${TEST_SERVICE}`,
        env: ({ params }) => ({
          TEST_SERVICE_MODE: "ready",
          TEST_SERVICE_PORT: String(params?.port ?? 4567),
        }),
        readiness: {
          pattern: /Server listening on http:\/\/localhost:(\d+)/,
          timeout: 5000,
          captures: { port: 1 },
        },
      });
      const mgr = createManager([paramsDef as any]);
      const instanceId = await mgr.start("params-svc", {
        params: { port: 9876 },
      });

      const statuses = mgr.list();
      expect(statuses[0]!.endpoints?.port).toBe("9876");
      expect(statuses[0]!.params).toEqual({ port: 9876 });
      trackedPids.push(statuses[0]!.pid!);
    });

    it("supports dynamic command function", async () => {
      const dynDef: ServiceDefinition = {
        id: "dyn-svc",
        name: "Dynamic Service",
        command: () => `node ${TEST_SERVICE}`,
        env: () => ({ TEST_SERVICE_MODE: "ready", TEST_SERVICE_PORT: "4567" }),
        readiness: {
          pattern: /Server listening on http:\/\/localhost:(\d+)/,
          timeout: 5000,
          captures: { port: 1 },
        },
      };
      const mgr = createManager([dynDef]);
      await mgr.start("dyn-svc", { params: { port: 3000 } });
      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("ready");
      trackedPids.push(statuses[0]!.pid!);
    });
  });

  describe("stop()", () => {
    it("stops a running service", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");

      const pid = mgr.list()[0]!.pid!;
      trackedPids.push(pid);

      await mgr.stop("test-svc");

      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("stopped");

      // PID should be dead
      let alive = false;
      try {
        process.kill(pid, 0);
        alive = true;
      } catch {
        /* expected */
      }
      expect(alive).toBe(false);
    });

    it("emits service:stopped event", async () => {
      const events: any[] = [];
      eventBus.on("service:stopped", (data) => events.push(data));

      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      await mgr.stop("test-svc");

      expect(events).toHaveLength(1);
      expect(events[0].id).toBe("test-svc");
    });

    it("persists stopped state file after stop", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      await mgr.stop("test-svc");

      const statePath = path.join(servicesDir, "test-svc", "test-svc.json");
      expect(fs.existsSync(statePath)).toBe(true);
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      expect(state.status).toBe("stopped");
      expect(state.pid).toBe(0);
      expect(state.stoppedAt).toBeDefined();
    });

    it("throws for service with no instances", async () => {
      const mgr = createManager([readyDef]);
      await expect(mgr.stop("test-svc")).rejects.toThrow(/not running/);
    });

    it("throws for unknown service", async () => {
      const mgr = createManager([readyDef]);
      await expect(mgr.stop("nonexistent")).rejects.toThrow(/Unknown service/);
    });

    it("can stop a specific instance by instanceId", async () => {
      const mgr = createManager([readyDef]);
      const instanceId = await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      await mgr.stop("test-svc", instanceId);

      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("stopped");
    });
  });

  describe("list()", () => {
    it("returns idle for services with no state file", () => {
      const mgr = createManager([readyDef]);
      const statuses = mgr.list();
      expect(statuses).toHaveLength(1);
      expect(statuses[0]!.status).toBe("idle");
      expect(statuses[0]!.serviceId).toBe("test-svc");
    });

    it("reconnects to a running service via PID", async () => {
      const mgr1 = createManager([readyDef]);
      await mgr1.start("test-svc");
      const pid = mgr1.list()[0]!.pid!;
      trackedPids.push(pid);

      // Create a second manager instance (simulates CLI restart)
      const mgr2 = createManager([readyDef]);
      const statuses = mgr2.list();
      expect(statuses[0]!.status).toBe("ready");
      expect(statuses[0]!.pid).toBe(pid);
    });

    it(
      "detects dead process and marks as stopped",
      async () => {
        const mgr = createManager([
          {
            ...readyDef,
            id: "crash-svc",
            name: "Crash Service",
            env: () => ({
              TEST_SERVICE_MODE: "crash",
              CRASH_DELAY: String(SERVICE_CRASH_DELAY),
              TEST_SERVICE_PORT: "4567",
            }),
          },
        ]);

        await mgr.start("crash-svc");
        // Wait for crash
        await new Promise((r) => setTimeout(r, SERVICE_CRASH_WAIT));

        const statuses = mgr.list();
        expect(statuses[0]!.status).toBe("stopped");
      },
      PROCESS_TEST_TIMEOUT,
    );

    it("can filter by serviceId", async () => {
      const secondDef: ServiceDefinition = {
        id: "other-svc",
        name: "Other Service",
        command: `node ${TEST_SERVICE}`,
        env: () => ({ TEST_SERVICE_MODE: "ready", TEST_SERVICE_PORT: "4568" }),
        readiness: {
          pattern: /Server listening on http:\/\/localhost:(\d+)/,
          timeout: 5000,
          captures: { port: 1 },
        },
      };
      const mgr = createManager([readyDef, secondDef]);
      const filtered = mgr.list("test-svc");
      expect(filtered).toHaveLength(1);
      expect(filtered[0]!.serviceId).toBe("test-svc");
    });
  });

  describe("logs()", () => {
    it("returns log file content", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      const logContent = mgr.logs("test-svc");
      expect(logContent).toContain("listening");
    });

    it("returns empty string when no log file", () => {
      const mgr = createManager([readyDef]);
      const logContent = mgr.logs("test-svc");
      expect(logContent).toBe("");
    });

    it("falls back to most recent log file when no state files exist", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc", { workdir: tmpDir });
      trackedPids.push(mgr.list()[0]!.pid!);

      // Verify logs work while running
      const beforeStop = mgr.logs("test-svc");
      expect(beforeStop).toContain("listening");

      // Stop removes .json state files but preserves .log files
      await mgr.stop("test-svc");

      // logs() should still find the log via .log file mtime fallback
      const afterStop = mgr.logs("test-svc");
      expect(afterStop).toContain("listening");
    });

    it("throws for unknown service", () => {
      const mgr = createManager([readyDef]);
      expect(() => mgr.logs("nonexistent")).toThrow(/Unknown service/);
    });
  });

  describe("per-run log files", () => {
    function runLogs(): string[] {
      const dir = path.join(servicesDir, "test-svc");
      try {
        return fs
          .readdirSync(dir)
          .filter((f) => /^test-svc\.\d+\.log$/.test(f));
      } catch {
        return [];
      }
    }

    it(
      "writes a fresh log file on each start and preserves the previous run",
      async () => {
        const mgr = createManager([readyDef]);
        await mgr.start("test-svc");
        trackedPids.push(mgr.list()[0]!.pid!);
        const firstRun = JSON.parse(
          fs.readFileSync(
            path.join(servicesDir, "test-svc", "test-svc.json"),
            "utf-8",
          ),
        ).logFile as string;

        await mgr.stop("test-svc");
        await mgr.start("test-svc");
        trackedPids.push(mgr.list()[0]!.pid!);
        const secondRun = JSON.parse(
          fs.readFileSync(
            path.join(servicesDir, "test-svc", "test-svc.json"),
            "utf-8",
          ),
        ).logFile as string;

        expect(secondRun).not.toBe(firstRun);
        const all = runLogs();
        expect(all).toContain(firstRun);
        expect(all).toContain(secondRun);
      },
      SERVICE_TEST_TIMEOUT,
    );

    it(
      "logs() returns the current run output after restart",
      async () => {
        const mgr = createManager([readyDef]);
        await mgr.start("test-svc");
        trackedPids.push(mgr.list()[0]!.pid!);
        await mgr.stop("test-svc");

        // Poison the previous run's log so a stale read would be detectable.
        const firstRun = runLogs()[0]!;
        fs.writeFileSync(
          path.join(servicesDir, "test-svc", firstRun),
          "STALE_RUN_MARKER\n",
        );

        await mgr.start("test-svc");
        trackedPids.push(mgr.list()[0]!.pid!);

        const out = mgr.logs("test-svc");
        expect(out).toContain("listening");
        expect(out).not.toContain("STALE_RUN_MARKER");
      },
      SERVICE_TEST_TIMEOUT,
    );

    it(
      "prunes to the 5 most recent runs per instance",
      async () => {
        const mgr = createManager([readyDef]);
        const dir = path.join(servicesDir, "test-svc");
        fs.mkdirSync(dir, { recursive: true });
        // Seed 6 old run logs with ascending runIds.
        for (let i = 1; i <= 6; i++) {
          fs.writeFileSync(path.join(dir, `test-svc.${i}.log`), `old ${i}\n`);
        }

        await mgr.start("test-svc");
        trackedPids.push(mgr.list()[0]!.pid!);

        const remaining = runLogs();
        expect(remaining.length).toBe(5);
        // Oldest seeded runs are pruned; the newest start is kept.
        expect(remaining).not.toContain("test-svc.1.log");
        expect(remaining).not.toContain("test-svc.2.log");
      },
      SERVICE_TEST_TIMEOUT,
    );
  });

  describe("watchLogs()", () => {
    it("calls onLine when new log data appears", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      const lines: string[] = [];
      const statePath = path.join(servicesDir, "test-svc", "test-svc.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      const logPath = path.join(servicesDir, "test-svc", state.logFile);
      const cleanup = mgr.watchLogs("test-svc", "test-svc", (line) =>
        lines.push(line),
      );

      // fs.watch (FSEvents on macOS) isn't armed synchronously when watch()
      // returns — let it register before writing, or the append lands in the
      // gap and the change event is missed.
      await new Promise((r) => setTimeout(r, LOG_WATCH_WAIT));

      // Append to log file to trigger watcher
      fs.appendFileSync(logPath, "new log line\n");
      await new Promise((r) => setTimeout(r, LOG_WATCH_WAIT));

      cleanup();
      expect(lines.some((l) => l.includes("new log line"))).toBe(true);
    });

    it("does not drop or mangle lines after multi-byte content", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      const lines: string[] = [];
      const statePath = path.join(servicesDir, "test-svc", "test-svc.json");
      const state = JSON.parse(fs.readFileSync(statePath, "utf-8"));
      const logPath = path.join(servicesDir, "test-svc", state.logFile);

      // Seed multi-byte content so the file's byte size exceeds its char
      // length before watching — a char-indexed slice would then misalign.
      fs.appendFileSync(logPath, "café ☕ progress…\n");

      const cleanup = mgr.watchLogs("test-svc", "test-svc", (line) =>
        lines.push(line),
      );
      await new Promise((r) => setTimeout(r, LOG_WATCH_WAIT)); // let watcher arm

      fs.appendFileSync(logPath, "new log line\n");
      await new Promise((r) => setTimeout(r, LOG_WATCH_WAIT));

      cleanup();
      // The line must arrive intact, not shifted by the multi-byte byte/char gap.
      expect(lines).toContain("new log line");
    });

    it("throws for unknown service", () => {
      const mgr = createManager([readyDef]);
      expect(() =>
        mgr.watchLogs("nonexistent", "nonexistent", () => {}),
      ).toThrow(/Unknown service/);
    });
  });

  describe("watchChunks()", () => {
    it("returns a no-op unsubscribe for process-based services", () => {
      const mgr = createManager([readyDef]);
      const unsubscribe = mgr.watchChunks("test-svc", "test-svc", () => {});
      expect(typeof unsubscribe).toBe("function");
      // Calling unsubscribe should not throw
      unsubscribe();
    });

    it("throws for unknown service", () => {
      const mgr = createManager([readyDef]);
      expect(() => mgr.watchChunks("nonexistent", "inst", () => {})).toThrow(
        /Unknown service/,
      );
    });
  });

  describe("restart on crash", () => {
    it(
      "triggers restart when dead PID is found in list()",
      async () => {
        const events: any[] = [];
        eventBus.on("service:restarting", (data) => events.push(data));

        const crashDef: ServiceDefinition = {
          ...readyDef,
          id: "restart-svc",
          name: "Restart Service",
          env: () => ({
            TEST_SERVICE_MODE: "crash",
            CRASH_DELAY: String(SERVICE_CRASH_DELAY),
            TEST_SERVICE_PORT: "4567",
          }),
          restart: { enabled: true, maxRetries: 2, delay: SERVICE_CRASH_DELAY },
        };

        const mgr = createManager([crashDef]);
        await mgr.start("restart-svc");

        // Wait for crash
        await new Promise((r) => setTimeout(r, SERVICE_CRASH_WAIT));

        // list() should detect dead PID and trigger restart
        const statuses = mgr.list();
        expect(statuses[0]!.status).toBe("starting");
        expect(statuses[0]!.restartAttempt).toBe(1);

        expect(events).toHaveLength(1);
        expect(events[0].attempt).toBe(1);
        expect(events[0].maxRetries).toBe(2);

        // Wait for restart to complete
        await new Promise((r) => setTimeout(r, SERVICE_RESTART_WAIT));
        // Clean up whatever is running
        const finalStatuses = mgr.list();
        if (finalStatuses[0]?.pid) trackedPids.push(finalStatuses[0].pid);
      },
      SERVICE_TEST_TIMEOUT,
    );
  });

  describe("multiple readiness patterns", () => {
    const vetraDef: ServiceDefinition = {
      id: "vetra",
      name: "Vetra Server",
      command: `node ${TEST_SERVICE}`,
      env: () => ({ TEST_SERVICE_MODE: "vetra", TEST_SERVICE_PORT: "4567" }),
      readiness: {
        patterns: [
          {
            name: "connect-port",
            pattern: /Local:\s*http:\/\/localhost:(\d+)/,
            captures: { "connect-studio": 1 },
          },
          {
            name: "drive-url",
            pattern: /Drive URL:\s*(https?:\/\/[^\s]+)/,
            captures: { "drive-url": 1 },
          },
          {
            name: "mcp-server",
            pattern: /MCP server available at (https?:\/\/[^\s]+)/,
            captures: { "mcp-server": 1 },
          },
        ],
        timeout: 5000,
      },
      shutdown: { signal: "SIGTERM", timeout: 3000 },
    };

    it("becomes ready only when all patterns match", async () => {
      const mgr = createManager([vetraDef]);
      await mgr.start("vetra");

      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("ready");
      expect(statuses[0]!.endpoints?.["connect-studio"]).toBe("4567");
      expect(statuses[0]!.endpoints?.["drive-url"]).toBe(
        "http://localhost:4567/drives/main",
      );
      expect(statuses[0]!.endpoints?.["mcp-server"]).toBe(
        "http://localhost:4567/mcp",
      );
      trackedPids.push(statuses[0]!.pid!);
    });

    it("emits service:pattern-matched for each pattern", async () => {
      const events: any[] = [];
      eventBus.on("service:pattern-matched", (data) => events.push(data));

      const mgr = createManager([vetraDef]);
      await mgr.start("vetra");
      trackedPids.push(mgr.list()[0]!.pid!);

      expect(events.length).toBe(3);
      const patternNames = events.map((e) => e.patternName).sort();
      expect(patternNames).toEqual(["connect-port", "drive-url", "mcp-server"]);
      // Last event should have remaining === 0
      expect(events[events.length - 1].remaining).toBe(0);
    });

    it(
      "times out when not all patterns match",
      async () => {
        const partialDef: ServiceDefinition = {
          ...vetraDef,
          id: "partial",
          name: "Partial",
          env: () => ({
            TEST_SERVICE_MODE: "multi-partial",
            TEST_SERVICE_PORT: "4567",
          }),
          readiness: {
            ...vetraDef.readiness!,
            timeout: 800,
          },
        };

        const mgr = createManager([partialDef]);

        let error: Error | undefined;
        try {
          await mgr.start("partial");
        } catch (e) {
          error = e as Error;
        }

        expect(error).toBeDefined();
        expect(error!.message).toMatch(/timeout/i);
        expect(error!.message).toContain("mcp-server");
      },
      PROCESS_TEST_TIMEOUT,
    );

    it("collects endpoints from all matched patterns", async () => {
      const mgr = createManager([vetraDef]);
      await mgr.start("vetra");

      const statuses = mgr.list();
      const endpoints = statuses[0]!.endpoints!;
      expect(Object.keys(endpoints)).toHaveLength(3);
      trackedPids.push(statuses[0]!.pid!);
    });
  });

  describe("process exits before readiness", () => {
    it(
      "marks service as failed when process dies before pattern matches",
      async () => {
        const failedEvents: any[] = [];
        eventBus.on("service:failed", (data) => failedEvents.push(data));

        const exitFastDef: ServiceDefinition = {
          id: "exit-fast",
          name: "Exit Fast",
          command: `node ${TEST_SERVICE}`,
          env: () => ({ TEST_SERVICE_MODE: "exit-fast" }),
          readiness: {
            pattern: /Server listening/,
            timeout: 5000,
          },
        };
        const mgr = createManager([exitFastDef]);

        await expect(mgr.start("exit-fast")).rejects.toThrow(
          /exited before becoming ready/,
        );

        const statuses = mgr.list();
        expect(statuses[0]!.status).toBe("failed");

        expect(failedEvents).toHaveLength(1);
        expect(failedEvents[0].error).toContain("exited before becoming ready");
      },
      PROCESS_TEST_TIMEOUT,
    );
  });

  describe("stop() edge cases", () => {
    it("persists stopped state when process is already dead", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");

      const pid = mgr.list()[0]!.pid!;
      trackedPids.push(pid);

      // Kill the process externally
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        /* ignore */
      }
      try {
        process.kill(pid, "SIGKILL");
      } catch {
        /* ignore */
      }
      // Wait for it to die
      await new Promise((r) => setTimeout(r, PROCESS_CLEANUP_WAIT));

      // stop() should detect dead PID and persist stopped state
      await mgr.stop("test-svc");

      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("stopped");
    });

    it(
      "force-kills a service that ignores SIGTERM",
      async () => {
        const stubbornDef: ServiceDefinition = {
          id: "stubborn",
          name: "Stubborn Service",
          command: `node ${TEST_SERVICE}`,
          env: () => ({
            TEST_SERVICE_MODE: "ignore-sigterm",
            TEST_SERVICE_PORT: "4567",
          }),
          readiness: {
            pattern: /Server listening on http:\/\/localhost:(\d+)/,
            timeout: 5000,
            captures: { port: 1 },
          },
          shutdown: { signal: "SIGTERM", timeout: FORCE_KILL_SHUTDOWN_TIMEOUT },
        };

        const mgr = createManager([stubbornDef]);
        await mgr.start("stubborn");
        const pid = mgr.list()[0]!.pid!;
        trackedPids.push(pid);

        // stop() sends SIGTERM → process ignores it → timeout → SIGKILL
        await mgr.stop("stubborn");

        // Verify process is dead
        let alive = false;
        try {
          process.kill(pid, 0);
          alive = true;
        } catch {
          /* expected */
        }
        expect(alive).toBe(false);

        const statuses = mgr.list();
        expect(statuses[0]!.status).toBe("stopped");
      },
      SERVICE_TEST_TIMEOUT,
    );
  });

  describe("watchLogs() edge cases", () => {
    it("returns fallback message when log file does not exist", () => {
      const mgr = createManager([readyDef]);
      const lines: string[] = [];
      const cleanup = mgr.watchLogs("test-svc", "test-svc", (line) =>
        lines.push(line),
      );
      cleanup();

      expect(lines).toEqual(["Log file not found"]);
    });
  });

  describe("max restart retries exceeded", () => {
    it(
      "emits service:failed when max retries are exceeded",
      async () => {
        const failedEvents: any[] = [];
        eventBus.on("service:failed", (data) => failedEvents.push(data));

        const crashDef: ServiceDefinition = {
          id: "max-retry",
          name: "Max Retry Service",
          command: `node ${TEST_SERVICE}`,
          env: () => ({
            TEST_SERVICE_MODE: "crash",
            CRASH_DELAY: String(SERVICE_CRASH_DELAY),
          }),
          // No readiness → marked ready immediately
          restart: { enabled: true, maxRetries: 0, delay: SERVICE_CRASH_DELAY },
        };

        const mgr = createManager([crashDef]);
        await mgr.start("max-retry");

        // Wait for crash
        await new Promise((r) => setTimeout(r, SERVICE_CRASH_WAIT));

        // list() sees dead PID, restartAttempt (0) >= maxRetries (0) → failed
        const statuses = mgr.list();
        expect(statuses[0]!.status).toBe("failed");
        expect(statuses[0]!.restartAttempt).toBe(0);

        const maxRetryFailed = failedEvents.find((e) =>
          e.error?.includes("Max restart"),
        );
        expect(maxRetryFailed).toBeDefined();
      },
      SERVICE_TEST_TIMEOUT,
    );
  });

  describe("typed captures (CaptureDefinition)", () => {
    const typedCaptureDef: ServiceDefinition = {
      id: "typed-svc",
      name: "Typed Service",
      command: `node ${TEST_SERVICE}`,
      env: () => ({ TEST_SERVICE_MODE: "vetra", TEST_SERVICE_PORT: "4567" }),
      readiness: {
        patterns: [
          {
            name: "connect-port",
            pattern: /Local:\s*http:\/\/localhost:(\d+)/,
            captures: { "connect-studio": 1 }, // plain number — backward compat
          },
          {
            name: "drive-url",
            pattern: /Drive URL:\s*(https?:\/\/[^\s]+)/,
            captures: { "drive-url": { group: 1, type: "api-rest" } },
          },
          {
            name: "mcp-server",
            pattern: /MCP server available at (https?:\/\/[^\s]+)/,
            captures: { "mcp-server": { group: 1, type: "api-mcp" } },
          },
        ],
        timeout: 5000,
      },
      shutdown: { signal: "SIGTERM", timeout: 3000 },
    };

    it("stores endpointTypes for CaptureDefinition captures", async () => {
      const mgr = createManager([typedCaptureDef]);
      await mgr.start("typed-svc");

      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("ready");
      expect(statuses[0]!.endpointTypes?.["mcp-server"]).toBe("api-mcp");
      expect(statuses[0]!.endpointTypes?.["drive-url"]).toBe("api-rest");
      // Plain number capture should not have a type entry
      expect(statuses[0]!.endpointTypes?.["connect-studio"]).toBeUndefined();
      trackedPids.push(statuses[0]!.pid!);
    });

    it("extracts endpoint values correctly for both number and CaptureDefinition", async () => {
      const mgr = createManager([typedCaptureDef]);
      await mgr.start("typed-svc");

      const statuses = mgr.list();
      expect(statuses[0]!.endpoints?.["connect-studio"]).toBe("4567");
      expect(statuses[0]!.endpoints?.["drive-url"]).toBe(
        "http://localhost:4567/drives/main",
      );
      expect(statuses[0]!.endpoints?.["mcp-server"]).toBe(
        "http://localhost:4567/mcp",
      );
      trackedPids.push(statuses[0]!.pid!);
    });

    it("includes endpointTypes in service:ready event", async () => {
      const events: any[] = [];
      eventBus.on("service:ready", (data) => events.push(data));

      const mgr = createManager([typedCaptureDef]);
      await mgr.start("typed-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      expect(events).toHaveLength(1);
      expect(events[0].endpointTypes?.["mcp-server"]).toBe("api-mcp");
      expect(events[0].endpointTypes?.["drive-url"]).toBe("api-rest");
    });

    it("includes endpointTypes in service:pattern-matched events", async () => {
      const events: any[] = [];
      eventBus.on("service:pattern-matched", (data) => events.push(data));

      const mgr = createManager([typedCaptureDef]);
      await mgr.start("typed-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      // The last pattern-matched event should have accumulated endpointTypes
      const lastEvent = events[events.length - 1];
      expect(lastEvent.endpointTypes).toBeDefined();
    });

    it("backward compat: plain number captures still work without endpointTypes", async () => {
      const plainDef: ServiceDefinition = {
        id: "plain-cap",
        name: "Plain Captures",
        command: `node ${TEST_SERVICE}`,
        env: () => ({ TEST_SERVICE_MODE: "ready", TEST_SERVICE_PORT: "4567" }),
        readiness: {
          pattern: /Server listening on http:\/\/localhost:(\d+)/,
          timeout: 5000,
          captures: { port: 1 },
        },
      };
      const mgr = createManager([plainDef]);
      await mgr.start("plain-cap");

      const statuses = mgr.list();
      expect(statuses[0]!.endpoints?.port).toBe("4567");
      // endpointTypes should be empty (no typed captures)
      expect(statuses[0]!.endpointTypes).toEqual({});
      trackedPids.push(statuses[0]!.pid!);
    });
  });

  describe("env config", () => {
    it("passes config to env function", async () => {
      const envDef: ServiceDefinition<{ apiPort: number }> = defineService({
        id: "env-svc",
        name: "Env Service",
        command: `node ${TEST_SERVICE}`,
        env: ({ config }) => ({
          TEST_SERVICE_MODE: "ready",
          TEST_SERVICE_PORT: String(config.apiPort),
        }),
        readiness: {
          pattern: /Server listening on http:\/\/localhost:(\d+)/,
          timeout: 5000,
          captures: { port: 1 },
        },
      });

      const mgr = createManager([envDef as any], { apiPort: 9999 });
      await mgr.start("env-svc");

      const statuses = mgr.list();
      expect(statuses[0]!.endpoints?.port).toBe("9999");
      trackedPids.push(statuses[0]!.pid!);
    });
  });

  describe("stopped instance persistence", () => {
    it("can restart a stopped instance", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      await mgr.stop("test-svc");
      expect(mgr.list()[0]!.status).toBe("stopped");

      // Restart from stopped
      await mgr.start("test-svc");
      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("ready");
      trackedPids.push(statuses[0]!.pid!);
    });

    it("purgeStoppedInstances removes stopped state and log files", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      await mgr.stop("test-svc");
      expect(mgr.list()[0]!.status).toBe("stopped");

      mgr.purgeStoppedInstances("test-svc");

      const statuses = mgr.list();
      expect(statuses[0]!.status).toBe("idle");
    });

    it("stop on already-stopped instance is a no-op", async () => {
      const mgr = createManager([readyDef]);
      await mgr.start("test-svc");
      trackedPids.push(mgr.list()[0]!.pid!);

      await mgr.stop("test-svc");
      // Calling stop again should not throw
      await mgr.stop("test-svc");
      expect(mgr.list()[0]!.status).toBe("stopped");
    });

    it("stopped instances do not count toward maxInstances", async () => {
      const multiDef: ServiceDefinition = {
        ...readyDef,
        id: "multi-stop",
        name: "Multi Stop",
        maxInstances: 2,
      };
      const mgr = createManager([multiDef]);

      // Start two instances
      const id1 = await mgr.start("multi-stop", { name: "a" });
      trackedPids.push(mgr.list().find((s) => s.instanceId === id1)!.pid!);
      const id2 = await mgr.start("multi-stop", { name: "b" });
      trackedPids.push(mgr.list().find((s) => s.instanceId === id2)!.pid!);

      // Stop one
      await mgr.stop("multi-stop", id1);

      // Should be able to start a new one (stopped doesn't count)
      const id3 = await mgr.start("multi-stop", { name: "c" });
      trackedPids.push(mgr.list().find((s) => s.instanceId === id3)!.pid!);
    });
  });

  describe("scanProjects", () => {
    it("returns empty when no projectScanner defined", () => {
      const mgr = createManager([readyDef]);
      expect(mgr.scanProjects("test-svc", tmpDir)).toEqual([]);
    });

    it("scans using projectScanner when defined", () => {
      const scanDir = path.join(tmpDir, "scan-root");
      fs.mkdirSync(path.join(scanDir, "proj"), { recursive: true });
      fs.writeFileSync(path.join(scanDir, "proj", "match.txt"), "");

      const scanDef: ServiceDefinition = {
        ...readyDef,
        id: "scan-svc",
        name: "Scan Service",
        projectScanner: {
          isProjectFolder: (p) => fs.existsSync(path.join(p, "match.txt")),
        },
      };
      const mgr = createManager([scanDef]);
      const results = mgr.scanProjects("scan-svc", scanDir);
      expect(results).toHaveLength(1);
      expect(results[0]!.name).toBe("proj");
    });

    it("throws for unknown service", () => {
      const mgr = createManager([readyDef]);
      expect(() => mgr.scanProjects("nonexistent", "/tmp")).toThrow(
        /Unknown service/,
      );
    });
  });

  describe("sanitizeLogText", () => {
    it("strips a NUL run while preserving surrounding text", () => {
      const input = "before\n" + "\0".repeat(13_300) + "\nafter";
      const out = sanitizeLogText(input);
      expect(out).not.toContain("\0");
      expect(out).toContain("before");
      expect(out).toContain("after");
      expect(out.length).toBeLessThan(100);
    });

    it("strips other control chars but keeps \\n and \\t", () => {
      const out = sanitizeLogText("a\tb\nc\x07\x1b\x7fd");
      expect(out).toBe("a\tb\ncd");
    });

    it("caps an overlong single line with a marker", () => {
      const out = sanitizeLogText("x".repeat(5_000));
      expect(out.length).toBeLessThan(5_000);
      expect(out).toMatch(/…\[truncated 3000 chars\]$/);
    });

    it("caps total length keeping the tail", () => {
      const lines = Array.from({ length: 5_000 }, (_, i) => `line-${i}`);
      const out = sanitizeLogText(lines.join("\n"));
      expect(out.length).toBeLessThanOrEqual(16_000 + 64);
      expect(out.startsWith("…[truncated")).toBe(true);
      expect(out.endsWith("line-4999")).toBe(true);
      expect(out).not.toContain("line-0\n");
    });

    it("passes plain short input through unchanged", () => {
      const input = "hello\nworld\n\ttabbed";
      expect(sanitizeLogText(input)).toBe(input);
    });
  });
});
