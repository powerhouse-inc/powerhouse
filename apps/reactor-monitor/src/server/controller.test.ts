import {
  SpawnHostError,
  type HostExit,
  type HostIssue,
  type SpawnedHost,
  type SpawnHostOptions,
} from "@powerhousedao/host-core";
import { spawn as spawnProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ControllerError,
  createMonitorController,
  type CheckInput,
  type MonitorController,
  type MonitorControllerOptions,
} from "./controller.ts";
import { LogRing } from "./logs.ts";

interface Launch {
  options: SpawnHostOptions;
  ready(outputs?: Record<string, unknown>): void;
  fail(error: Error): void;
  exit(exit?: Partial<HostExit>): void;
  stop: ReturnType<typeof vi.fn>;
}

function fakeSpawn() {
  const launches: Launch[] = [];
  let nextPid = 4000;
  const spawn = (options: SpawnHostOptions) =>
    new Promise<SpawnedHost>((resolve, reject) => {
      mkdirSync(options.dataDir, { recursive: true });
      let exitNow: (exit: HostExit) => void = () => {};
      const exited = new Promise<HostExit>((r) => (exitNow = r));
      const done: HostExit = { code: 0, signal: null, forced: false };
      const stop = vi.fn(() => {
        exitNow(done);
        return exited;
      });
      options.signal?.addEventListener("abort", () => {
        reject(new SpawnHostError("aborted", "aborted", ""));
        void stop();
      });
      launches.push({
        options,
        stop,
        ready: (outputs) =>
          resolve({
            pid: nextPid++,
            dataDir: options.dataDir,
            outputs,
            exited,
            stop,
          } as unknown as SpawnedHost),
        fail: reject,
        exit: (exit) => exitNow({ ...done, ...exit }),
      });
    });
  return { spawn, launches };
}

const SWITCHBOARD_OUTPUTS = {
  origin: "http://127.0.0.1:4801",
  endpoints: { graphql: "http://127.0.0.1:4801/graphql" },
  drives: { vetra: { id: "vetra", url: "http://127.0.0.1:4801/d/vetra" } },
};

const until = (predicate: () => boolean) =>
  vi.waitFor(() => {
    if (!predicate()) throw new Error("not yet");
  });

function addHost(project: string, host: string): void {
  mkdirSync(path.join(project, "hosts", host), { recursive: true });
  writeFileSync(path.join(project, "hosts", host, "host.js"), "export {}\n");
}

describe("createMonitorController", () => {
  let base: string;
  let allowed: string;
  let tmp: string;
  let controller: MonitorController | undefined;

  beforeEach(() => {
    base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-monitor-test-")));
    allowed = path.join(base, "allowed");
    tmp = path.join(base, "tmp");
    mkdirSync(tmp);
    addHost(allowed, "sb");
    addHost(path.join(allowed, "child"), "a");
    mkdirSync(path.join(allowed, "plain"));
    addHost(path.join(allowed, "node_modules", "dep"), "x");
    addHost(path.join(base, "outside"), "sb");
  });

  afterEach(async () => {
    await controller?.dispose();
    controller = undefined;
    rmSync(base, { recursive: true, force: true });
  });

  const create = (overrides: Partial<MonitorControllerOptions> = {}) => {
    const fake = fakeSpawn();
    const checks: CheckInput[] = [];
    controller = createMonitorController({
      projectRoots: [allowed],
      tmpDir: tmp,
      spawn: fake.spawn,
      check: (input) => {
        checks.push(input);
        return Promise.resolve([]);
      },
      ...overrides,
    });
    return { controller, launches: fake.launches, checks };
  };

  const codeOf = async (promise: Promise<unknown>) => {
    try {
      await promise;
    } catch (error) {
      return error instanceof ControllerError ? error.code : String(error);
    }
    return "resolved";
  };

  it("lists the allowlisted roots and their children with hosts", () => {
    const { controller } = create();
    expect(controller.listProjects().map((p) => p.root)).toEqual([
      allowed,
      path.join(allowed, "child"),
    ]);
    expect(controller.hosts(allowed)).toEqual(["sb"]);
  });

  it("refuses projects outside the allowlist, by realpath", async () => {
    const { controller } = create();
    const outside = path.join(base, "outside");
    expect(() => controller.hosts(outside)).toThrow(ControllerError);
    expect(() => controller.hosts(path.join(allowed, ".."))).toThrow(
      ControllerError,
    );
    expect(() => controller.hosts(path.join(allowed, "plain"))).toThrow(
      ControllerError,
    );
    expect(
      await codeOf(controller.start({ project: outside, host: "sb" })),
    ).toBe("unknown_project");

    const link = path.join(base, "link");
    symlinkSync(allowed, link, "dir");
    expect(controller.hosts(link)).toEqual(["sb"]);
  });

  it("refuses hosts its hosts/ folder does not list", async () => {
    const { controller } = create();
    for (const host of ["nope", "../outside", "sb/../sb"]) {
      expect(await codeOf(controller.start({ project: allowed, host }))).toBe(
        "unknown_host",
      );
    }
  });

  it("refuses denied env keys", async () => {
    const { controller, launches } = create();
    for (const key of [
      "PATH",
      "HOME",
      "PH_USER_DATA_DIR",
      "NODE_OPTIONS",
      "LD_PRELOAD",
      "DYLD_INSERT_LIBRARIES",
      "BASH_ENV",
      "NPM_CONFIG_SCRIPT_SHELL",
      "lower",
    ]) {
      expect(
        await codeOf(
          controller.check({
            project: allowed,
            host: "sb",
            env: { [key]: "x" },
          }),
        ),
      ).toBe("env_denied");
    }
    expect(launches).toHaveLength(0);
  });

  it("checks against the env the child will see", async () => {
    const { controller, launches, checks } = create();
    const started = await controller.start({
      project: allowed,
      host: "sb",
      env: { AUTH_ENABLED: "true" },
    });
    const dataDir = path.join(controller.tempRoot, started.id);
    expect(checks[0]).toMatchObject({
      projectRoot: allowed,
      host: "sb",
      env: {
        AUTH_ENABLED: "true",
        PH_USER_DATA_DIR: dataDir,
        PH_NO_DOTENV: "1",
        FEATURE_UNIFORM_RUNNERS_ENABLED: "1",
      },
    });
    expect(checks[0].env.PATH).toBe(process.env.PATH);
    expect(launches[0].options).toMatchObject({
      projectRoot: allowed,
      host: "sb",
      dataDir,
      env: { AUTH_ENABLED: "true" },
    });
    expect(launches[0].options).not.toHaveProperty("cli");
    expect(launches[0].options).not.toHaveProperty("verb");
  });

  it("refuses to start a host with check issues", async () => {
    const issue: HostIssue = {
      stage: "resolve",
      file: "hosts/sb/host.js",
      path: "runner.port",
      message: "unset",
    };
    const { controller, launches } = create({
      check: () => Promise.resolve([issue]),
    });
    const error = await controller
      .start({ project: allowed, host: "sb" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ControllerError);
    expect(error).toMatchObject({ code: "check_failed", issues: [issue] });
    expect(launches).toHaveLength(0);
    expect(controller.list()).toEqual([]);
  });

  it("runs starting → running → stopped, removing the data dir", async () => {
    const { controller, launches } = create();
    const started = await controller.start({ project: allowed, host: "sb" });
    expect(started.status).toBe("starting");
    const dataDir = path.join(controller.tempRoot, started.id);
    expect(existsSync(dataDir)).toBe(true);

    launches[0].ready(SWITCHBOARD_OUTPUTS);
    await until(() => controller.get(started.id).status === "running");
    expect(controller.get(started.id)).toMatchObject({
      pid: 4000,
      outputs: {
        origin: SWITCHBOARD_OUTPUTS.origin,
        graphql: SWITCHBOARD_OUTPUTS.endpoints.graphql,
        drives: SWITCHBOARD_OUTPUTS.drives,
      },
    });

    const stopped = await controller.stop(started.id);
    expect(stopped).toMatchObject({
      status: "exited",
      exit: { code: 0, forced: false },
    });
    expect(launches[0].stop).toHaveBeenCalled();
    expect(existsSync(dataDir)).toBe(false);
    expect(controller.list()).toEqual([]);
    expect(await codeOf(controller.stop(started.id))).toBe("not_found");
  });

  it("aborts a start that is stopped before it is ready", async () => {
    const { controller, launches } = create();
    const started = await controller.start({ project: allowed, host: "sb" });
    const stopped = await controller.stop(started.id);
    expect(launches[0].options.signal?.aborted).toBe(true);
    expect(stopped.status).toBe("exited");
    expect(controller.list()).toEqual([]);
    expect(existsSync(path.join(controller.tempRoot, started.id))).toBe(false);
  });

  it("marks an unexpected exit and removes the data dir", async () => {
    const { controller, launches } = create();
    const started = await controller.start({ project: allowed, host: "sb" });
    launches[0].ready(SWITCHBOARD_OUTPUTS);
    await until(() => controller.get(started.id).status === "running");
    launches[0].exit({ code: 1 });
    await until(() => controller.get(started.id).status === "exited");
    expect(controller.get(started.id).exit?.code).toBe(1);
    await until(() => !existsSync(path.join(controller.tempRoot, started.id)));
    await controller.stop(started.id);
    expect(controller.list()).toEqual([]);
  });

  it("reports a SpawnHostError as failed, with its tail, until dismissed", async () => {
    const { controller, launches } = create();
    const started = await controller.start({ project: allowed, host: "sb" });
    launches[0].options.onOutput?.("stderr", "boom\n");
    launches[0].fail(
      new SpawnHostError("spawnHost: ph run sb exited", "exited", "boom\n", {
        code: 1,
        signal: null,
        forced: false,
      }),
    );
    await until(() => controller.get(started.id).status === "failed");
    expect(controller.get(started.id)).toMatchObject({
      error: {
        message: "spawnHost: ph run sb exited",
        phase: "exited",
        tail: "boom\n",
      },
      exit: { code: 1 },
    });
    expect(existsSync(path.join(controller.tempRoot, started.id))).toBe(false);
    expect(controller.logs(started.id, 0).lines).toEqual([
      { seq: 0, stream: "stderr", text: "boom" },
    ]);
    expect((await controller.stop(started.id)).status).toBe("failed");
    expect(controller.list()).toEqual([]);
  });

  it("caps live instances, counting starts still being checked", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { controller } = create({
      maxInstances: 1,
      check: async () => {
        await gate;
        return [];
      },
    });
    const first = controller.start({ project: allowed, host: "sb" });
    expect(
      await codeOf(controller.start({ project: allowed, host: "sb" })),
    ).toBe("instance_limit");
    release();
    const started = await first;
    expect(
      await codeOf(controller.start({ project: allowed, host: "sb" })),
    ).toBe("instance_limit");
    await controller.stop(started.id);
    await controller.start({ project: allowed, host: "sb" });
  });

  it("serves new log lines since a cursor", async () => {
    const { controller, launches } = create();
    const started = await controller.start({ project: allowed, host: "sb" });
    const out = launches[0].options.onOutput;
    out?.("stdout", "one\ntw");
    out?.("stdout", "o\n");
    out?.("stderr", "err\n");
    const first = controller.logs(started.id, 0);
    expect(first.lines.map((l) => l.text)).toEqual(["one", "two", "err"]);
    out?.("stdout", "three\n");
    expect(controller.logs(started.id, first.next).lines).toEqual([
      { seq: 3, stream: "stdout", text: "three" },
    ]);
  });

  it("stopAll stops every instance", async () => {
    const { controller, launches } = create();
    await controller.start({ project: allowed, host: "sb" });
    await controller.start({ project: path.join(allowed, "child"), host: "a" });
    launches[0].ready(SWITCHBOARD_OUTPUTS);
    const stopped = await controller.stopAll();
    expect(stopped.map((i) => i.status)).toEqual(["exited", "exited"]);
    expect(controller.list()).toEqual([]);
    expect(readdirSync(controller.tempRoot)).toEqual([]);
  });

  it("sweeps temp roots whose owner is dead, SIGTERMing their hosts", async () => {
    const deadOwner = spawnProcess(process.execPath, ["-e", ""]);
    await new Promise((r) => deadOwner.once("exit", r));
    const orphan = spawnProcess(process.execPath, [
      "-e",
      "setInterval(() => {}, 1000)",
    ]);
    const orphanExit = new Promise((r) => orphan.once("exit", r));
    const record = {
      version: 2,
      host: "sb",
      projectName: "p",
      kind: "reactor",
      verb: "run",
      pid: orphan.pid,
      startedAt: new Date().toISOString(),
    };
    const stale = path.join(tmp, `ph-monitor-${deadOwner.pid}-abc`);
    mkdirSync(path.join(stale, "i1", ".ph", "run"), { recursive: true });
    writeFileSync(
      path.join(stale, "i1", ".ph", "run", "sb.json"),
      JSON.stringify(record),
    );
    const live = path.join(tmp, `ph-monitor-${process.ppid}-def`);
    mkdirSync(live);

    try {
      const { controller } = create();
      expect(existsSync(stale)).toBe(false);
      expect(existsSync(live)).toBe(true);
      expect(existsSync(controller.tempRoot)).toBe(true);
      expect(path.basename(controller.tempRoot)).toMatch(
        new RegExp(`^ph-monitor-${process.pid}-`),
      );
      await orphanExit;
      expect(orphan.signalCode).toBe("SIGTERM");
    } finally {
      orphan.kill("SIGKILL");
    }
  });

  it("dispose removes the temp root", async () => {
    const { controller } = create();
    await controller.start({ project: allowed, host: "sb" });
    await controller.dispose();
    expect(existsSync(controller.tempRoot)).toBe(false);
  });
});

describe("LogRing", () => {
  it("keeps the last lines only", () => {
    const ring = new LogRing(3);
    ring.push("stdout", "a\nb\nc\nd\ne");
    expect(ring.since(0).lines.map((l) => l.text)).toEqual(["b", "c", "d"]);
    ring.flush();
    expect(ring.since(0)).toMatchObject({
      next: 5,
      lines: [{ text: "c" }, { text: "d" }, { text: "e" }],
    });
  });
});
