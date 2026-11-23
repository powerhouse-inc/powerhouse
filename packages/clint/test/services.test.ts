// @ts-nocheck — NOTE(port): the ph-clint repo never typechecked its test suite
// (jest ran transpile-only); this file carries pre-existing type drift. Runtime
// assertions are unchanged. Tighten opportunistically when touching the file.
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import os from "node:os";
import { pathToFileURL } from "node:url";
import {
  defineService,
  createServiceManager,
  sanitizeLogText,
} from "../src/core/services.js";
import { killTree } from "../src/core/process-platform.js";
import { createEventBus } from "../src/core/events.js";
import { readRunRecord } from "@powerhousedao/host-core";
import {
  startSupervisor,
  type Supervisor,
} from "@powerhousedao/host-core/supervisor";
import type {
  EventBus,
  HostServiceDefinition,
  ServiceDefinition,
} from "../src/core/types.js";
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

/** Kill a live process and its tree by PID (a tree kill spawns taskkill on
 * Windows, so dead pids are skipped). */
function safeKill(pid: number): void {
  if (isAlive(pid)) killTree(pid, "SIGKILL");
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Wait until every pid is gone; false when one is still alive at the end. */
async function waitDead(pids: number[], timeout = 5_000): Promise<boolean> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (pids.every((pid) => !isAlive(pid))) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return pids.every((pid) => !isAlive(pid));
}

const OWNER = path.resolve(import.meta.dirname, "fixtures/service-owner.ts");
const TSX_ESM = pathToFileURL(
  createRequire(import.meta.url).resolve("tsx/esm"),
).href;

/** Run the owner fixture (a process owning one service); `pids` resolves
 * with its service's shell and node pids once the service is ready. */
function startOwner(servicesDir: string, ending: string) {
  const owner = spawn(
    process.execPath,
    ["--import", TSX_ESM, OWNER, servicesDir, ending],
    { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
  );
  let out = "";
  let err = "";
  owner.stdout.on("data", (d) => (out += String(d)));
  owner.stderr.on("data", (d) => (err += String(d)));
  const closed = new Promise<{
    code: number | null;
    signal: NodeJS.Signals | null;
  }>((resolve) =>
    owner.on("close", (code, signal) => resolve({ code, signal })),
  );
  const pids = new Promise<number[]>((resolve, reject) => {
    const found = () => /pids (\d+) (\d+)/.exec(out);
    owner.stdout.on("data", () => {
      const m = found();
      if (m) resolve([Number(m[1]), Number(m[2])]);
    });
    void closed.then(() => {
      const m = found();
      if (m) resolve([Number(m[1]), Number(m[2])]);
      else
        reject(
          new Error(
            `owner ended before its service was ready:\n${out}\n${err}`,
          ),
        );
    });
  });
  return { owner, pids, closed, stderr: () => err };
}

/** A pid that is not running (pids are multiples of 4 on Windows, and
 * this is above Linux's default pid_max). */
const DEAD_PID = 2 ** 22 - 1;

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
    const pids = new Set([...trackedPids, ...collectPids(servicesDir)]);
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

    it("a second start is the running instance, and starts nothing", async () => {
      const mgr = createManager([readyDef]);
      const first = await mgr.start("test-svc");

      const statuses = mgr.list();
      trackedPids.push(statuses[0]!.pid!);

      await expect(mgr.start("test-svc")).resolves.toBe(first);
      const after = mgr.list();
      expect(after).toHaveLength(1);
      expect(after[0]).toMatchObject({
        status: "ready",
        pid: statuses[0]!.pid,
      });
    });

    it("throws for unknown service", async () => {
      const mgr = createManager([readyDef]);
      await expect(mgr.start("nonexistent")).rejects.toThrow(/Unknown service/);
    });

    it("a second start of an instance that is starting is that instance", async () => {
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

      await expect(mgr.start("slow-svc")).resolves.toBe("slow-svc");
      expect(mgr.list()[0]!.pid).toBe(state.pid);
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

    it("does not adopt an instance another manager started", async () => {
      const mgr1 = createManager([readyDef]);
      await mgr1.start("test-svc");
      const pid = mgr1.list()[0]!.pid!;
      trackedPids.push(pid);

      // A second manager on the same services dir (a second CLI process)
      const mgr2 = createManager([readyDef]);
      const [seen] = mgr2.list();
      expect(seen!.status).toBe("failed");
      expect(seen!.error).toMatch(
        /belongs to process \d+, which is still running; this process does not manage it/,
      );
      await expect(mgr2.start("test-svc")).rejects.toThrow(
        /belongs to process/,
      );
      await expect(mgr2.stop("test-svc")).rejects.toThrow(/does not manage it/);
      await mgr2.stopAll();
      expect(isAlive(pid)).toBe(true);

      // Only its owner stops it.
      await mgr1.stopAll();
      expect(isAlive(pid)).toBe(false);
      expect(mgr1.list()[0]!.status).toBe("stopped");
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
      killTree(pid, "SIGKILL");
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

  describe("stopAll()", () => {
    it("stops every instance this manager started", async () => {
      const multiDef: ServiceDefinition = {
        ...readyDef,
        id: "multi-all",
        name: "Multi All",
        maxInstances: 2,
      };
      const mgr = createManager([readyDef, multiDef]);
      await mgr.start("test-svc");
      await mgr.start("multi-all", { name: "a" });
      await mgr.start("multi-all", { name: "b" });
      const pids = mgr.list().map((s) => s.pid!);
      trackedPids.push(...pids);
      expect(pids).toHaveLength(3);

      await mgr.stopAll();

      expect(pids.filter(isAlive)).toEqual([]);
      expect(mgr.list().map((s) => s.status)).toEqual([
        "stopped",
        "stopped",
        "stopped",
      ]);
    });

    it(
      "cancels a pending restart",
      async () => {
        const crashDef: ServiceDefinition = {
          ...readyDef,
          id: "restart-cancel",
          name: "Restart Cancel",
          env: () => ({
            TEST_SERVICE_MODE: "crash",
            CRASH_DELAY: String(SERVICE_CRASH_DELAY),
            TEST_SERVICE_PORT: "4567",
          }),
          restart: { enabled: true, maxRetries: 2, delay: 300 },
        };
        const mgr = createManager([crashDef]);
        await mgr.start("restart-cancel");
        await new Promise((r) => setTimeout(r, SERVICE_CRASH_WAIT));
        // list() sees the crash and schedules the restart
        expect(mgr.list()[0]!.status).toBe("starting");

        await mgr.stopAll();
        // Well past the 300 ms restart delay: a restart would have spawned
        // (and opened its run log) by now.
        await new Promise((r) => setTimeout(r, 800));

        expect(mgr.list()[0]!.status).toBe("stopped");
        const runs = fs
          .readdirSync(path.join(servicesDir, "restart-cancel"))
          .filter((f) => f.endsWith(".log"));
        expect(runs).toHaveLength(1);
      },
      SERVICE_TEST_TIMEOUT,
    );
  });

  describe("state left by another process", () => {
    const statePath = () => path.join(servicesDir, "test-svc", "test-svc.json");
    const readState = () => JSON.parse(fs.readFileSync(statePath(), "utf-8"));
    function writeState(state: Record<string, unknown>): void {
      fs.mkdirSync(path.dirname(statePath()), { recursive: true });
      fs.writeFileSync(
        statePath(),
        JSON.stringify({
          serviceId: "test-svc",
          instanceId: "test-svc",
          name: "Test Service",
          status: "ready",
          startedAt: new Date().toISOString(),
          command: "node old-service.js",
          ...state,
        }),
      );
    }

    /** A live process this manager did not spawn (a fixture, so the suite
     * sweep in global-teardown.ts also catches it). */
    function liveStranger(): number {
      const child = spawn(process.execPath, [TEST_SERVICE], {
        stdio: "ignore",
        windowsHide: true,
        env: { ...process.env, TEST_SERVICE_MODE: "no-ready" },
      });
      trackedPids.push(child.pid!);
      return child.pid!;
    }

    it("settles stale state from a dead owner as stopped and starts afresh", async () => {
      writeState({ pid: DEAD_PID, owner: { pid: DEAD_PID, token: "gone" } });
      const mgr = createManager([readyDef]);

      expect(mgr.list()[0]!.status).toBe("stopped");
      expect(readState()).toMatchObject({ status: "stopped", pid: 0 });

      await mgr.start("test-svc");
      const [status] = mgr.list();
      trackedPids.push(status!.pid!);
      expect(status!.status).toBe("ready");
      expect(status!.pid).not.toBe(DEAD_PID);
    });

    it("reports a live leftover without adopting, stopping or killing it", async () => {
      const pid = liveStranger();
      writeState({ pid, owner: { pid: DEAD_PID, token: "gone" } });
      const mgr = createManager([readyDef]);

      const [status] = mgr.list();
      expect(status!.status).toBe("failed");
      expect(status!.pid).toBe(pid);
      expect(status!.error).toMatch(
        new RegExp(
          `pid ${pid}\\) is a leftover from process ${DEAD_PID}, which has exited; this process does not manage it`,
        ),
      );
      await expect(mgr.start("test-svc")).rejects.toThrow(/is a leftover/);
      await expect(mgr.stop("test-svc")).rejects.toThrow(/does not manage it/);
      await expect(mgr.stop("test-svc", "test-svc")).rejects.toThrow(
        /does not manage it/,
      );
      await mgr.stopAll();

      expect(isAlive(pid)).toBe(true);
      expect(readState()).toMatchObject({ status: "ready", pid });
    });

    it("treats state written before ownership was recorded as a leftover", async () => {
      const pid = liveStranger();
      writeState({ pid }); // the detached era: no owner
      const mgr = createManager([readyDef]);

      const [status] = mgr.list();
      expect(status!.status).toBe("failed");
      expect(status!.error).toMatch(/is a leftover from an earlier run/);
      await expect(mgr.start("test-svc")).rejects.toThrow(/is a leftover/);
      await mgr.stopAll();
      expect(isAlive(pid)).toBe(true);
    });
  });

  describe("children end with the process that started them", () => {
    for (const ending of ["return", "exit", "throw"] as const) {
      it(
        `the service does not outlive its owner (${ending})`,
        async () => {
          const run = startOwner(servicesDir, ending);
          trackedPids.push(run.owner.pid!);
          const pids = await run.pids;
          trackedPids.push(...pids);
          expect(pids.every((pid) => pid > 0)).toBe(true);

          const { code } = await run.closed;
          expect(code).toBe(ending === "throw" ? 1 : 0);
          if (ending === "throw")
            expect(run.stderr()).toContain("owner crashed");
          expect(await waitDead(pids)).toBe(true);
        },
        SERVICE_TEST_TIMEOUT,
      );
    }

    // Windows delivers no signal another process could send to a node
    // process (process.kill terminates it outright, running no code).
    it.skipIf(process.platform === "win32")(
      "a signal nobody handles ends the owner and its service",
      async () => {
        const run = startOwner(servicesDir, "wait");
        trackedPids.push(run.owner.pid!);
        const pids = await run.pids;
        trackedPids.push(...pids);

        run.owner.kill("SIGTERM");
        const { code } = await run.closed;
        expect(code).toBe(128 + os.constants.signals.SIGTERM);
        expect(await waitDead(pids)).toBe(true);
      },
      SERVICE_TEST_TIMEOUT,
    );
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

// ── Host services: `ph run <host>` through spawnHost ──────────────

const REPO = path.resolve(import.meta.dirname, "../../..");
const PH_RUN_ROOT = path.join(REPO, "clis", "ph-run");
const HOST_CORE_ROOT = path.join(REPO, "packages", "host-core");

function link(target: string, at: string) {
  fs.mkdirSync(path.dirname(at), { recursive: true });
  fs.symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
}

function writeHostFile(root: string, folder: string, host: object) {
  fs.mkdirSync(path.join(root, "hosts", folder), { recursive: true });
  fs.writeFileSync(
    path.join(root, "hosts", folder, "host.js"),
    `export default ${JSON.stringify(host, null, 2)};\n`,
  );
}

/** A project with a `web` host on the service-host fixture runner and a
 * compound `stack` of it; ph-run, host-core and zod linked the way pnpm
 * would. */
function makeHostProject(root: string, config: Record<string, unknown>) {
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "svc-host-lab", private: true, type: "module" }),
  );
  fs.writeFileSync(path.join(root, "powerhouse.config.json"), "{}");
  const modules = path.join(root, "node_modules");
  link(PH_RUN_ROOT, path.join(modules, "@powerhousedao", "ph-run"));
  link(HOST_CORE_ROOT, path.join(modules, "@powerhousedao", "host-core"));
  link(
    fs.realpathSync(
      path.join(import.meta.dirname, "..", "node_modules", "zod"),
    ),
    path.join(modules, "zod"),
  );
  const runner = path.join(modules, "@fixture", "svc-host");
  fs.mkdirSync(runner, { recursive: true });
  fs.copyFileSync(
    path.join(import.meta.dirname, "fixtures", "service-host-runner.mjs"),
    path.join(runner, "runner.mjs"),
  );
  fs.writeFileSync(
    path.join(runner, "package.json"),
    JSON.stringify({
      name: "@fixture/svc-host",
      type: "module",
      exports: { "./runner": "./runner.mjs" },
    }),
  );
  writeHostFile(root, "web", {
    name: "web",
    runner: { module: "@fixture/svc-host/runner" },
    config,
  });
  writeHostFile(root, "stack", {
    name: "stack",
    runner: { module: "@powerhousedao/host-core/runners/compound" },
    children: { site: { host: "web" } },
  });
}

describe("host services", () => {
  let tmpDir: string;
  let project: string;
  let servicesDir: string;
  let marker: string;
  let pidFile: string;
  let eventBus: EventBus;
  /** Every pid a run reported: what afterEach checks, and kills if alive. */
  let started: number[];

  beforeEach(() => {
    tmpDir = makeTmpDir();
    project = path.join(tmpDir, "project");
    fs.mkdirSync(project);
    servicesDir = path.join(tmpDir, "services");
    marker = path.join(tmpDir, "stopped.txt");
    pidFile = path.join(tmpDir, "pid.txt");
    eventBus = createEventBus();
    started = [];
  });

  afterEach(async () => {
    if (fs.existsSync(pidFile)) started.push(runPid());
    const left = [...new Set(started)].filter((pid) => isAlive(pid));
    for (const pid of left) safeKill(pid);
    fs.rmSync(tmpDir, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
    expect(left).toEqual([]);
  });

  const webDef = (
    over: Partial<HostServiceDefinition> = {},
  ): HostServiceDefinition => ({
    id: "web",
    run: { host: "web", verb: "dev" },
    endpoints: (record) => ({
      site: { url: String(record.outputs?.origin), type: "website" },
    }),
    readiness: { timeout: 60_000 },
    ...over,
  });

  /** The pid of the ph run the fixture runner runs in. */
  const runPid = () => Number(fs.readFileSync(pidFile, "utf8"));

  function managerFor(def: ServiceDefinition) {
    return createServiceManager([def], { config: {}, servicesDir, eventBus });
  }

  it("is ready once the run record is live, with the endpoints mapped from it, and stops through its stdin", async () => {
    makeHostProject(project, { marker, pidFile, delayMs: 1_500 });
    const mgr = managerFor(webDef());
    const ready: unknown[] = [];
    eventBus.on("service:ready", (data) => ready.push(data));

    const starting = mgr.start("web", { cwd: project });
    // While it waits for the record it has none and reads as starting.
    await new Promise((r) => setTimeout(r, 300));
    expect(mgr.list("web")[0]).toMatchObject({ status: "starting" });
    expect(readRunRecord(project, "web")).toBeUndefined();

    const instanceId = await starting;
    const [instance] = mgr.list("web");
    started.push(instance.pid!);
    expect(instance.pid).toBe(runPid());
    const record = readRunRecord(project, "web");
    expect(record?.pid).toBe(instance.pid);
    expect(instance).toMatchObject({
      instanceId,
      status: "ready",
      endpoints: { site: record?.outputs?.origin },
      endpointTypes: { site: "website" },
    });
    expect(ready).toHaveLength(1);
    const answer = await fetch(`${String(record?.outputs?.origin)}/hello`);
    expect(await answer.text()).toBe("web saw /hello");
    expect(mgr.logs("web")).toContain("— Web");

    const before = Date.now();
    await mgr.stop("web");
    // The runner's own stop ran: the request reached it through stdin.
    expect(fs.readFileSync(marker, "utf8")).toBe("stopped through its stop");
    expect(Date.now() - before).toBeLessThan(30_000);
    expect(isAlive(instance.pid!)).toBe(false);
    expect(readRunRecord(project, "web")).toBeUndefined();
    expect(mgr.list("web")[0]).toMatchObject({ status: "stopped" });
  }, 120_000);

  it("kills its tree only once a stop has outlived shutdown.timeout", async () => {
    makeHostProject(project, { marker, pidFile, hang: true });
    const mgr = managerFor(webDef({ shutdown: { timeout: 1_500 } }));
    await mgr.start("web", { cwd: project });
    const [instance] = mgr.list("web");
    started.push(instance.pid!);

    const before = Date.now();
    await mgr.stop("web");
    expect(Date.now() - before).toBeGreaterThanOrEqual(1_400);
    expect(fs.existsSync(marker)).toBe(false);
    expect(isAlive(instance.pid!)).toBe(false);
    expect(mgr.list("web")[0]).toMatchObject({ status: "stopped" });
  }, 120_000);

  it("fails the start and stops the run when the record lacks an endpoint", async () => {
    makeHostProject(project, { marker, pidFile });
    const failed: unknown[] = [];
    eventBus.on("service:failed", (data) => failed.push(data));
    const pids: number[] = [];
    const mgr = managerFor(
      webDef({
        endpoints: (record) => {
          pids.push(record.pid);
          throw new Error('no member "vetra-switchboard"');
        },
      }),
    );

    await expect(mgr.start("web", { cwd: project })).rejects.toThrow(
      /Reading its endpoints from the run record failed: no member "vetra-switchboard"/,
    );
    started.push(...pids);
    expect(pids).toHaveLength(1);
    expect(isAlive(pids[0]!)).toBe(false);
    expect(failed).toHaveLength(1);
    expect(mgr.list("web")[0]).toMatchObject({ status: "failed" });
  }, 120_000);

  it("aborts a start a stop arrives during, leaving nothing running", async () => {
    makeHostProject(project, { marker, pidFile, delayMs: 5_000 });
    const mgr = managerFor(webDef());
    const starting = mgr.start("web", { cwd: project });
    const outcome = starting.then(
      () => "ready",
      (error: Error) => error.message,
    );
    await new Promise((r) => setTimeout(r, 500));

    await mgr.stop("web");
    expect(await outcome).toBe("Service web was stopped before it was ready");
    expect(mgr.list("web")[0]).toMatchObject({ status: "stopped" });
    // The ph run it spawned is gone, and its record with it.
    expect(isAlive(runPid())).toBe(false);
    expect(readRunRecord(project, "web")).toBeUndefined();
  }, 120_000);

  it("runs a compound, with endpoints from its members, and stops every member", async () => {
    makeHostProject(project, { marker, pidFile });
    const mgr = managerFor(
      webDef({
        id: "stack",
        run: { host: "stack", verb: "dev" },
        endpoints: (record) => ({
          site: {
            url: String(record.members?.site?.outputs.origin),
            type: "website",
          },
        }),
      }),
    );

    await mgr.start("stack", { cwd: project });
    const [instance] = mgr.list("stack");
    started.push(instance.pid!, runPid());
    const record = readRunRecord(project, "stack");
    expect(record?.pid).toBe(instance.pid);
    const origin = record?.members?.site?.outputs.origin;
    expect(instance.endpoints).toEqual({ site: origin });
    expect(await (await fetch(String(origin))).text()).toBe("web saw /");

    await mgr.stop("stack");
    expect(fs.readFileSync(marker, "utf8")).toBe("stopped through its stop");
    expect(isAlive(instance.pid!)).toBe(false);
    expect(isAlive(runPid())).toBe(false);
    expect(readRunRecord(project, "stack")).toBeUndefined();
  }, 120_000);

  it("refuses a definition with both a command and a run", async () => {
    const mgr = managerFor({
      ...webDef(),
      command: "node -e 0",
    } as unknown as ServiceDefinition);
    await expect(mgr.start("web", { cwd: project })).rejects.toThrow(
      "Service web: give it a command or a host run (run), not both.",
    );
  });

  describe("beside the user's supervisor", () => {
    let home: string;
    let supervisor: Supervisor | undefined;
    let homeBefore: string | undefined;

    beforeEach(() => {
      home = path.join(tmpDir, "supervisor-home");
      homeBefore = process.env.PH_SUPERVISOR_HOME;
      process.env.PH_SUPERVISOR_HOME = home;
    });

    afterEach(async () => {
      await supervisor?.stop();
      supervisor = undefined;
      if (homeBefore === undefined) delete process.env.PH_SUPERVISOR_HOME;
      else process.env.PH_SUPERVISOR_HOME = homeBefore;
    });

    async function supervise(): Promise<Supervisor> {
      const result = await startSupervisor({
        env: { PH_SUPERVISOR_HOME: home },
        version: "0.0.0-test",
        mode: "standalone",
        log: () => {},
      });
      supervisor = result.supervisor;
      return result.supervisor!;
    }

    const stateFile = () =>
      path.join(
        servicesDir,
        "web",
        fs
          .readdirSync(path.join(servicesDir, "web"))
          .find((f) => f.endsWith(".json"))!,
      );

    /** Rewrites the state as left by a manager whose process has ended. */
    function orphan(): void {
      const state = JSON.parse(fs.readFileSync(stateFile(), "utf8"));
      const dead = spawnSync(process.execPath, ["-e", "0"], {
        windowsHide: true,
      }).pid;
      state.owner = { pid: dead, token: "an-ended-manager" };
      fs.writeFileSync(stateFile(), JSON.stringify(state));
    }

    it("starts a host service there, to live with the caller, and stops it with the manager", async () => {
      makeHostProject(project, { marker, pidFile });
      const held = await supervise();
      const mgr = managerFor(webDef());
      expect(await mgr.supervisor()).toEqual({ pid: process.pid });

      await mgr.start("web", { cwd: project });
      const [instance] = mgr.list("web");
      started.push(instance.pid!);
      expect(instance).toMatchObject({
        status: "ready",
        pid: runPid(),
        supervisor: { pid: process.pid, handle: "1", lifetime: "caller" },
      });
      expect(held.instances()).toMatchObject([
        { handle: "1", host: "web", pid: runPid(), lifetime: "caller" },
      ]);
      const record = readRunRecord(project, "web");
      expect(instance.endpoints).toEqual({ site: record?.outputs?.origin });
      expect(mgr.logs("web")).toContain("— Web");

      await mgr.stopAll();
      expect(fs.readFileSync(marker, "utf8")).toBe("stopped through its stop");
      expect(isAlive(instance.pid!)).toBe(false);
      expect(readRunRecord(project, "web")).toBeUndefined();
      expect(mgr.list("web")[0]).toMatchObject({ status: "stopped" });
    }, 120_000);

    it("leaves one that lives with the supervisor running, and a later manager lists and stops it there", async () => {
      makeHostProject(project, { marker, pidFile });
      const held = await supervise();
      const first = managerFor(webDef());
      const instanceId = await first.start("web", {
        cwd: project,
        lifetime: "supervisor",
      });
      const pid = runPid();
      started.push(pid);

      await first.stopAll();
      expect(isAlive(pid)).toBe(true);
      expect(held.instances()).toMatchObject([
        { pid, status: "running", lifetime: "supervisor" },
      ]);
      orphan();

      const later = managerFor(webDef());
      expect(later.list("web")).toMatchObject([
        {
          instanceId,
          status: "ready",
          pid,
          supervisor: { handle: "1", lifetime: "supervisor" },
        },
      ]);
      // The instance that runs: a second start starts nothing.
      expect(
        await later.start("web", { cwd: project, lifetime: "supervisor" }),
      ).toBe(instanceId);
      expect(runPid()).toBe(pid);
      expect(held.instances()).toHaveLength(1);

      await later.stop("web");
      expect(fs.readFileSync(marker, "utf8")).toBe("stopped through its stop");
      expect(isAlive(pid)).toBe(false);
      expect(later.list("web")[0]).toMatchObject({ status: "stopped" });
    }, 120_000);

    it("starts nothing to outlive it without a supervisor", async () => {
      makeHostProject(project, { marker, pidFile });
      const mgr = managerFor(webDef());
      expect(await mgr.supervisor()).toBeUndefined();
      await expect(
        mgr.start("web", { cwd: project, lifetime: "supervisor" }),
      ).rejects.toThrow("no supervisor runs for this user");
      expect(fs.existsSync(pidFile)).toBe(false);
    });

    it("says that a recorded supervisor does not answer, and starts nothing", async () => {
      makeHostProject(project, { marker, pidFile });
      fs.mkdirSync(home, { recursive: true });
      fs.writeFileSync(
        path.join(home, "supervisor.json"),
        JSON.stringify({
          version: 1,
          pid: process.pid,
          startedAt: new Date().toISOString(),
          supervisorVersion: "0.0.0-test",
          mode: "standalone",
          user: "test",
          control: {
            protocol: 2,
            address:
              process.platform === "win32"
                ? `\\\\.\\pipe\\ph-no-supervisor-${process.pid}`
                : path.join(tmpDir, "no-supervisor.sock"),
            token: "none",
          },
        }),
      );
      const mgr = managerFor(webDef());
      await expect(mgr.supervisor()).rejects.toThrow("does not answer");
      await expect(mgr.start("web", { cwd: project })).rejects.toThrow(
        /A supervisor is recorded for this user \(pid \d+, .*\) and does not answer/,
      );
      expect(fs.existsSync(pidFile)).toBe(false);
      expect(readRunRecord(project, "web")).toBeUndefined();
    }, 60_000);
  });
});
