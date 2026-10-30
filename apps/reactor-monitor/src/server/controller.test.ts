import type { HostExport } from "@powerhousedao/host-core/schema";
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
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ControllerError,
  createMonitorController,
  type CheckInput,
  type MonitorController,
  type MonitorControllerOptions,
  portFree,
  splitPackages,
} from "./controller.ts";
import { LogRing } from "./logs.ts";
import {
  BROWSER_ENV_ALLOWLIST,
  baseDigest,
  CODE_LOADING_ENV,
  isBrowserEnvKey,
  type DraftRequest,
} from "../controller/api.ts";

interface Launch {
  options: SpawnHostOptions;
  ready(
    outputs?: Record<string, unknown>,
    members?: SpawnedHost["members"],
  ): void;
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
        ready: (outputs, members) =>
          resolve({
            pid: nextPid++,
            dataDir: options.dataDir,
            outputs,
            members,
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

const SWITCHBOARD = "@powerhousedao/ph-cli/runners/switchboard";

function switchboardHost(name: string, port: number, dir: string) {
  return {
    name,
    runner: { module: SWITCHBOARD, port },
    reactor: {
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: `./.ph/${dir}` },
          readModel: { url: `./.ph/read-${dir}` },
        },
      },
    },
  };
}

/** A compound of two switchboards, as `ph host export` gives it. */
function duoExport(root: string): HostExport {
  return {
    format: "ph-host-export",
    version: 1,
    project: { name: "p", root },
    name: "duo",
    host: {
      name: "duo",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: { a: { host: "sb-a" }, b: { host: "sb-b" } },
    },
    members: {
      "sb-a": switchboardHost("sb-a", 4801, "a"),
      "sb-b": switchboardHost("sb-b", 4802, "b"),
    },
  } as HostExport;
}

/** A compound of a switchboard and a Connect member. */
function stackExport(root: string): HostExport {
  return {
    format: "ph-host-export",
    version: 1,
    project: { name: "p", root },
    name: "stack",
    host: {
      name: "stack",
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: { sb: { host: "sb" }, ui: { host: "ui" } },
    },
    members: {
      sb: switchboardHost("sb", 4801, "sb"),
      ui: {
        name: "ui",
        runner: {
          module: "@powerhousedao/ph-cli/runners/connect",
          port: 3001,
        },
        config: { app: { offline: false } },
        reactor: { backends: { main: { kind: "worker" } } },
      },
    },
  } as HostExport;
}

function hostFileOf(project: string, folder: string): unknown {
  const source = readFileSync(
    path.join(project, "hosts", folder, "host.js"),
    "utf8",
  );
  return JSON.parse(source.replace(/^export default /, "").replace(/;\n$/, ""));
}

function memberOutputs(port: number) {
  return {
    origin: `http://127.0.0.1:${port}`,
    endpoints: { graphql: `http://127.0.0.1:${port}/graphql` },
  };
}

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
    const exports: CheckInput[] = [];
    controller = createMonitorController({
      projectRoots: [allowed],
      tmpDir: tmp,
      spawn: fake.spawn,
      check: (input) => {
        checks.push(input);
        return Promise.resolve([]);
      },
      exportHost: (input) => {
        exports.push(input);
        return Promise.resolve(duoExport(input.projectRoot));
      },
      ...overrides,
    });
    return { controller, launches: fake.launches, checks, exports };
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

  it("accepts only allowlisted env keys, naming the rest", async () => {
    const { controller, launches, checks } = create();
    const refused = [
      // code from a registry or a package list
      "PH_PACKAGES",
      "PH_REGISTRY_URL",
      "PH_REGISTRY_PACKAGES",
      "DYNAMIC_MODEL_LOADING",
      // Node and loader/preload hooks
      "NODE_OPTIONS",
      "NODE_PATH",
      "LD_PRELOAD",
      "LD_LIBRARY_PATH",
      "DYLD_INSERT_LIBRARIES",
      // search paths, shells, npm
      "PATH",
      "PATHEXT",
      "BASH_ENV",
      "ENV",
      "NPM_CONFIG_SCRIPT_SHELL",
      // the controller's own keys
      "PH_USER_DATA_DIR",
      "PH_NO_DOTENV",
      "PH_NO_TELEMETRY",
      "FEATURE_UNIFORM_RUNNERS_ENABLED",
      // base keys, any case
      "HOME",
      "TMPDIR",
      "COMSPEC",
      "SYSTEMROOT",
      "USERPROFILE",
      // allowed prefix, code-loading name
      "REACTOR_PLUGIN_PATH",
      "REACTOR_MODULE",
      "INSPECTION_LOADER",
      // unknown
      "SOME_SETTING",
      "lower",
    ];
    for (const key of refused) {
      const error = await controller
        .check({ project: allowed, host: "sb", env: { [key]: "x" } })
        .catch((e: unknown) => e);
      expect(error, key).toMatchObject({ code: "env_denied" });
      expect((error as Error).message).toContain(key);
    }
    expect(checks).toHaveLength(0);

    await controller.check({
      project: allowed,
      host: "sb",
      env: {
        AUTH_ENABLED: "true",
        ADMINS: "0xabc",
        INSPECTION_ADMIN_ENABLED: "true",
        REACTOR_WORKERS: "2",
        CREATE_SIGNATURE_POLICY: "require",
        LOG_LEVEL: "debug",
      },
    });
    expect(checks).toHaveLength(1);
    expect(launches).toHaveLength(0);
  });

  it("allowlist entries are themselves never code-loading", () => {
    for (const key of BROWSER_ENV_ALLOWLIST.keys) {
      expect(isBrowserEnvKey(key), key).toBe(true);
      expect(CODE_LOADING_ENV.test(key), key).toBe(false);
    }
    for (const prefix of BROWSER_ENV_ALLOWLIST.prefixes) {
      expect(isBrowserEnvKey(`${prefix}X`)).toBe(true);
      expect(isBrowserEnvKey(`${prefix}X_PATH`)).toBe(false);
    }
  });

  it("takes code-loading env from the server config only", async () => {
    const { controller, launches, checks } = create({
      serverEnv: { PH_REGISTRY_URL: "http://registry.local" },
    });
    const started = await controller.start({
      project: allowed,
      host: "sb",
      env: { LOG_LEVEL: "debug" },
    });
    expect(checks[0].env).toMatchObject({
      PH_REGISTRY_URL: "http://registry.local",
      LOG_LEVEL: "debug",
    });
    expect(launches[0].options.env).toEqual({
      PH_REGISTRY_URL: "http://registry.local",
      LOG_LEVEL: "debug",
    });
    await controller.stop(started.id);
    for (const key of ["PH_NO_DOTENV", "ph_user_data_dir", "bad-key"]) {
      expect(() => create({ serverEnv: { [key]: "x" } }), key).toThrow(
        /Server env may not set/,
      );
    }
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

  it("reports a standalone Connect's app URL, not as switchboard outputs", async () => {
    const { controller, launches } = create();
    const started = await controller.start({ project: allowed, host: "sb" });
    launches[0].ready({
      origin: "http://localhost:6491",
      endpoints: { connect: "http://localhost:6491/" },
    });
    await until(() => controller.get(started.id).status === "running");
    expect(controller.get(started.id).app).toBe("http://localhost:6491/");
    expect(controller.get(started.id).outputs).toBeUndefined();
    await controller.stop(started.id);
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
        message: "Stopped while starting: boom.",
        phase: "exited",
        tail: "boom\n",
        context: "ph run sb exited",
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

  it.each([
    ["an instance", "."],
    ["a draft copy", "data"],
  ])(
    "sweeps temp roots whose owner is dead, SIGTERMing %s's hosts",
    async (_, sub) => {
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
      mkdirSync(path.join(stale, "i1", sub, ".ph", "run"), { recursive: true });
      writeFileSync(
        path.join(stale, "i1", sub, ".ph", "run", "sb.json"),
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
    },
  );

  it("never signals pid <= 1 or itself, and skips symlinked roots", async () => {
    const deadOwner = spawnProcess(process.execPath, ["-e", ""]);
    await new Promise((r) => deadOwner.once("exit", r));
    const writeRecord = (dir: string, host: string, pid: number) => {
      mkdirSync(path.join(dir, ".ph", "run"), { recursive: true });
      writeFileSync(
        path.join(dir, ".ph", "run", `${host}.json`),
        JSON.stringify({
          version: 2,
          host,
          projectName: "p",
          kind: "reactor",
          verb: "run",
          pid,
          startedAt: new Date().toISOString(),
        }),
      );
    };
    const stale = path.join(tmp, `ph-monitor-${deadOwner.pid}-bad`);
    writeRecord(path.join(stale, "i1"), "a", -1);
    writeRecord(path.join(stale, "i2"), "b", 0);
    writeRecord(path.join(stale, "i3"), "c", 1);
    writeRecord(path.join(stale, "i4"), "d", process.pid);
    const target = path.join(base, "elsewhere");
    writeRecord(path.join(target, "i1"), "e", 424242);
    const link = path.join(tmp, `ph-monitor-${deadOwner.pid}-link`);
    symlinkSync(target, link, "dir");

    const original = process.kill.bind(process);
    const signalled: number[] = [];
    const kill = vi
      .spyOn(process, "kill")
      .mockImplementation((pid: number, signal?: string | number) => {
        if (signal === "SIGTERM") {
          signalled.push(pid);
          return true;
        }
        return original(pid, signal);
      });
    try {
      create();
    } finally {
      kill.mockRestore();
    }
    expect(signalled).toEqual([]);
    expect(existsSync(stale)).toBe(false);
    expect(existsSync(link)).toBe(true);
    expect(existsSync(path.join(target, "i1", ".ph", "run", "e.json"))).toBe(
      true,
    );
  });

  it("does not list a symlinked child that leaves the root", () => {
    const outside = path.join(base, "outside");
    symlinkSync(outside, path.join(allowed, "link"), "dir");
    const { controller } = create();
    expect(controller.listProjects().map((p) => p.root)).not.toContain(outside);
    expect(() => controller.hosts(path.join(allowed, "link"))).toThrow(
      ControllerError,
    );
  });

  it("stopAll waits for starts still in their check; dispose refuses new ones", async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const { controller, launches } = create({
      check: async () => {
        await gate;
        return [];
      },
    });
    const starting = controller.start({ project: allowed, host: "sb" });
    const stopping = controller.stopAll();
    release();
    await starting;
    const stopped = await stopping;
    expect(stopped.map((i) => i.status)).toEqual(["exited"]);
    expect(launches[0].options.signal?.aborted).toBe(true);
    expect(controller.list()).toEqual([]);

    await controller.dispose();
    expect(
      await codeOf(controller.start({ project: allowed, host: "sb" })),
    ).toBe("shutting_down");
  });

  describe("drafts", () => {
    beforeEach(() => addHost(allowed, "duo"));

    const draft = async (
      overrides: Partial<DraftRequest> = {},
    ): Promise<DraftRequest> => ({
      project: allowed,
      host: "duo",
      baseDigest: await baseDigest(duoExport(allowed)),
      setters: [],
      ...overrides,
    });

    const errorOf = async (promise: Promise<unknown>) => {
      try {
        await promise;
      } catch (error) {
        if (error instanceof ControllerError) return error;
        throw error;
      }
      throw new Error("resolved");
    };

    it("exports a project host with its digest", async () => {
      const { controller, exports } = create();
      const reply = await controller.exportHost(allowed, "duo");
      expect(reply.export).toEqual(duoExport(allowed));
      expect(reply.baseDigest).toBe(await baseDigest(duoExport(allowed)));
      expect(exports[0]).toMatchObject({ projectRoot: allowed, host: "duo" });
      expect(() =>
        controller.exportHost(path.join(base, "outside"), "sb"),
      ).toThrow(ControllerError);
    });

    it("starts a throwaway copy with free ports, inside its instance folder", async () => {
      const { controller, launches, checks } = create();
      const before = readdirSync(allowed, { recursive: true }).sort();
      const started = await controller.startDraft(
        await draft({
          setters: [
            {
              path: "members.sb-b.reactor.protocol.createSignaturePolicy",
              value: "v2-required",
            },
          ],
        }),
      );
      const instanceDir = path.join(controller.tempRoot, started.id);
      const project = path.join(instanceDir, "project");
      expect(started).toMatchObject({
        project,
        host: "duo",
        status: "starting",
        source: {
          project: allowed,
          host: "duo",
          baseDigest: await baseDigest(duoExport(allowed)),
          setters: [
            {
              path: "members.sb-b.reactor.protocol.createSignaturePolicy",
              value: "v2-required",
            },
          ],
        },
      });
      expect(readdirSync(allowed, { recursive: true }).sort()).toEqual(before);
      expect(readdirSync(controller.tempRoot)).toEqual([started.id]);
      expect(checks[0]).toMatchObject({ projectRoot: project, host: "duo" });
      expect(launches[0].options).toMatchObject({
        projectRoot: project,
        host: "duo",
        dataDir: path.join(instanceDir, "data"),
      });
      const sbB = readFileSync(
        path.join(project, "hosts", "sb-b", "host.js"),
        "utf8",
      );
      expect(sbB).toContain('"port": 0');
      expect(sbB).toContain('"createSignaturePolicy": "v2-required"');
    });

    it("reports each member's outputs and removes the instance folder on stop", async () => {
      const { controller, launches } = create();
      const { id } = await controller.startDraft(await draft());
      launches[0].ready(undefined, {
        a: {
          host: "sb-a",
          runnerModule: SWITCHBOARD,
          kind: "reactor",
          verb: "run",
          outputs: memberOutputs(5001),
        },
        b: {
          host: "sb-b",
          runnerModule: SWITCHBOARD,
          kind: "reactor",
          verb: "run",
          outputs: memberOutputs(5002),
        },
        ui: {
          host: "ui",
          runnerModule: "@powerhousedao/ph-cli/runners/connect",
          kind: "reactor",
          verb: "run",
          outputs: {
            origin: "http://localhost:6491",
            endpoints: { connect: "http://localhost:6491/" },
          },
        },
      } as SpawnedHost["members"]);
      await until(() => controller.get(id).status === "running");
      expect(controller.get(id).outputs).toBeUndefined();
      expect(controller.get(id).app).toBeUndefined();
      expect(controller.get(id).members).toEqual({
        a: {
          host: "sb-a",
          outputs: {
            origin: "http://127.0.0.1:5001",
            graphql: "http://127.0.0.1:5001/graphql",
            drives: {},
          },
        },
        b: {
          host: "sb-b",
          outputs: {
            origin: "http://127.0.0.1:5002",
            graphql: "http://127.0.0.1:5002/graphql",
            drives: {},
          },
        },
        ui: { host: "ui", app: "http://localhost:6491/" },
      });
      await controller.stop(id);
      expect(existsSync(path.join(controller.tempRoot, id))).toBe(false);
    });

    it("refuses a draft whose base changed, starting nothing", async () => {
      const { controller, launches, checks } = create();
      const error = await errorOf(
        controller.startDraft(await draft({ baseDigest: "0".repeat(64) })),
      );
      expect(error.code).toBe("base_changed");
      expect(checks).toEqual([]);
      expect(launches).toEqual([]);
      expect(readdirSync(controller.tempRoot)).toEqual([]);
    });

    it("names every refused setter", async () => {
      const { controller, launches } = create();
      const error = await errorOf(
        controller.startDraft(
          await draft({
            setters: [
              { path: "host.runner.module", value: "evil" },
              {
                path: "members.sb-a.reactor.protocol.createSignaturePolicy",
                value: "v2-required",
              },
              { path: "members.sb-a.name", value: "../../escape" },
              {
                path: "members.sb-b.reactor.backends.main.storage.dataDir",
                value: "/etc",
              },
            ],
          }),
        ),
      );
      expect(error.code).toBe("setter_denied");
      expect(error.setters?.map((s) => s.path)).toEqual([
        "host.runner.module",
        "members.sb-a.name",
        "members.sb-b.reactor.backends.main.storage.dataDir",
      ]);
      expect(error.setters?.every((s) => s.reason.length > 0)).toBe(true);
      expect(launches).toEqual([]);
      expect(readdirSync(controller.tempRoot)).toEqual([]);
    });

    it("refuses a draft the host rules find problems in", async () => {
      const { controller, launches, checks } = create();
      const error = await errorOf(
        controller.startDraft(
          await draft({
            setters: [
              {
                path: "members.sb-b.reactor.backends.main.storage.dataDir",
                value: "./.ph/a",
              },
            ],
          }),
        ),
      );
      expect(error.code).toBe("check_failed");
      expect(error.ruleIssues?.map((i) => i.rule)).toContain("storage");
      expect(checks).toEqual([]);
      expect(launches).toEqual([]);
      expect(readdirSync(controller.tempRoot)).toEqual([]);
    });

    it("refuses denied env and unknown projects before exporting", async () => {
      const { controller, exports } = create();
      expect(
        (
          await errorOf(
            controller.startDraft(
              await draft({ env: { NODE_OPTIONS: "-r x" } }),
            ),
          )
        ).code,
      ).toBe("env_denied");
      expect(
        (
          await errorOf(
            controller.startDraft(
              await draft({ project: path.join(base, "outside") }),
            ),
          )
        ).code,
      ).toBe("unknown_project");
      expect(exports).toEqual([]);
    });

    it("gives the server's PH_PACKAGES to the switchboards, not the whole copy", async () => {
      const { controller, checks, launches } = create({
        serverEnv: { PH_PACKAGES: "@acme/models, @acme/more" },
      });
      const { id } = await controller.startDraft(
        await draft({ env: { LOG_LEVEL: "debug" } }),
      );
      for (const env of [checks[0].env, launches[0].options.env ?? {}]) {
        expect(env.LOG_LEVEL).toBe("debug");
        expect(env).not.toHaveProperty("PH_PACKAGES");
      }
      const project = path.join(controller.tempRoot, id, "project");
      for (const folder of ["sb-a", "sb-b"]) {
        expect(hostFileOf(project, folder)).toMatchObject({
          config: {
            switchboard: {
              packages: {
                list: ["@acme/models", "@acme/more", allowed],
                disableLocal: true,
              },
            },
          },
        });
      }
    });

    it("serves Connect the project's own files from a copy, keeping its configured packages", async () => {
      const files: Record<string, string> = {
        "package.json": '{"name":"p","type":"module"}',
        "powerhouse.config.json": JSON.stringify({
          packages: [{ packageName: "@acme/models", provider: "registry" }],
        }),
        "index.html": "<script type=module src=/main.tsx></script>",
        "main.tsx": 'import "./index.js";',
        "index.ts": 'export * from "./document-models/index.js";',
        "style.css": "@import 'tailwindcss';",
        "document-models/index.ts": "export const models = [];",
        "editors/index.ts": "export const editors = [];",
        "subgraphs/index.ts": "export const subgraphs = [];",
        "processors/index.ts": "export const processors = [];",
        "public/icon.svg": "<svg/>",
        "hosts/stack/routes/index.tsx": "export {};",
        "hosts/stack/host.js": "export default {};",
        ".env": "PH_PACKAGES=@evil/code",
        "dist/document-models/index.js": "export const built = true;",
      };
      for (const [file, content] of Object.entries(files)) {
        mkdirSync(path.dirname(path.join(allowed, file)), { recursive: true });
        writeFileSync(path.join(allowed, file), content);
      }
      const snapshot = () =>
        readdirSync(allowed, { recursive: true, encoding: "utf8" })
          .filter((f) => !f.startsWith("node_modules"))
          .sort()
          .map((f) => {
            const at = path.join(allowed, f);
            return lstatSync(at).isFile()
              ? `${f}=${readFileSync(at, "utf8")}`
              : f;
          });
      const before = snapshot();

      const { controller, checks, launches } = create({
        exportHost: () => Promise.resolve(stackExport(allowed)),
      });
      const request = await draft({
        host: "stack",
        baseDigest: await baseDigest(stackExport(allowed)),
      });
      expect(await controller.checkDraft(request)).toEqual({
        ruleIssues: [],
        issues: [],
      });
      const { id } = await controller.startDraft(request);
      const project = path.join(controller.tempRoot, id, "project");
      expect(launches[0].options.projectRoot).toBe(project);
      for (const env of [
        ...checks.map((c) => c.env),
        launches[0].options.env ?? {},
      ]) {
        expect(env).not.toHaveProperty("PH_PACKAGES");
      }

      // The project's own files are real copies in the copy.
      for (const [file, content] of Object.entries(files)) {
        const at = path.join(project, file);
        if (
          file === ".env" ||
          file.startsWith("dist/") ||
          file === "hosts/stack/host.js"
        ) {
          continue;
        }
        expect(lstatSync(at).isSymbolicLink()).toBe(false);
        expect(readFileSync(at, "utf8")).toBe(content);
      }
      expect(existsSync(path.join(project, ".env"))).toBe(false);
      expect(existsSync(path.join(project, "dist"))).toBe(false);

      // Connect keeps what its host and the project configure, on its copy port.
      const ui = stackExport(allowed).members.ui as Record<string, unknown>;
      expect(hostFileOf(project, "ui")).toEqual({
        ...ui,
        runner: { ...(ui.runner as object), port: 13001, strictPort: true },
      });
      // Switchboards load the source's own package from the source root.
      expect(hostFileOf(project, "sb")).toMatchObject({
        config: {
          switchboard: { packages: { list: [allowed], disableLocal: true } },
        },
      });

      // Writes land in the copy, never in the source.
      writeFileSync(path.join(project, "editors", "index.ts"), "changed");
      mkdirSync(path.join(project, "node_modules", ".vite"));
      await controller.stop(id);
      expect(snapshot()).toEqual(before);
    });

    it("refuses a draft whose Connect copy port is taken, starting nothing", async () => {
      mkdirSync(path.join(allowed, "hosts", "stack"), { recursive: true });
      writeFileSync(
        path.join(allowed, "hosts", "stack", "host.js"),
        "export default {};",
      );
      const asked: number[] = [];
      const { controller, launches } = create({
        exportHost: () => Promise.resolve(stackExport(allowed)),
        portFree: (port) => {
          asked.push(port);
          return Promise.resolve(false);
        },
      });
      const request = await draft({
        host: "stack",
        baseDigest: await baseDigest(stackExport(allowed)),
      });
      let error: unknown;
      try {
        await controller.startDraft(request);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ControllerError);
      expect((error as ControllerError).code).toBe("port_taken");
      expect((error as ControllerError).message).toBe(
        "The copy's Connect (ui) needs port 13001, and something else is using it, perhaps another running copy. Stop that, then start again.",
      );
      expect(asked).toEqual([13001]);
      expect(launches).toEqual([]);
      expect(readdirSync(controller.tempRoot)).toEqual([]);
    });

    it("refuses a draft whose members would share a port in the copy, naming the declared ports, before anything starts", async () => {
      mkdirSync(path.join(allowed, "hosts", "stack"), { recursive: true });
      writeFileSync(
        path.join(allowed, "hosts", "stack", "host.js"),
        "export default {};",
      );
      // Distinct as declared (3001 and 13001); Connect moves to 13001 in a copy.
      const envelope = stackExport(allowed);
      (envelope.members as Record<string, unknown>).agent = {
        name: "agent",
        runner: { module: "@powerhousedao/clint/mastra-runner", port: 13001 },
      };
      (
        (envelope.host as unknown as Record<string, unknown>)
          .children as Record<string, unknown>
      ).agent = { host: "agent" };
      const asked: number[] = [];
      const { controller, launches } = create({
        exportHost: () => Promise.resolve(envelope),
        portFree: (port) => {
          asked.push(port);
          return Promise.resolve(true);
        },
      });
      const request = await draft({
        host: "stack",
        baseDigest: await baseDigest(envelope),
      });
      let error: unknown;
      try {
        await controller.startDraft(request);
      } catch (caught) {
        error = caught;
      }
      expect(error).toBeInstanceOf(ControllerError);
      expect((error as ControllerError).code).toBe("check_failed");
      expect((error as ControllerError).ruleIssues).toEqual([
        expect.objectContaining({
          rule: "port",
          path: "host.children.ui.runner.port",
          message:
            "ui (port 3001) and agent (port 13001) would both use 13001 when the monitor starts its copy, which adds 10000 to Connect's port. Give ui another port.",
        }),
      ]);
      expect(asked).toEqual([]);
      expect(launches).toEqual([]);
      expect(readdirSync(controller.tempRoot)).toEqual([]);
    });

    it("sees a port another process listens on as taken", async () => {
      const server = net.createServer();
      await new Promise<void>((resolve) => server.listen(0, resolve));
      const { port } = server.address() as net.AddressInfo;
      expect(await portFree(port)).toBe(false);
      await new Promise((resolve) => server.close(resolve));
      expect(await portFree(port)).toBe(true);
    });

    it("splits PH_PACKAGES out of a draft's env", () => {
      expect(
        splitPackages({
          PH_PACKAGES: " /src , @acme/x ,,",
          LOG_LEVEL: "debug",
        }),
      ).toEqual({ env: { LOG_LEVEL: "debug" }, packages: ["/src", "@acme/x"] });
      expect(splitPackages({})).toEqual({ env: {}, packages: [] });
    });

    it("removes the copy when checkHost refuses it", async () => {
      const issue: HostIssue = {
        stage: "boot",
        file: "hosts/duo/host.js",
        path: "",
        message: "no",
      };
      const { controller, launches } = create({
        check: () => Promise.resolve([issue]),
      });
      const error = await errorOf(controller.startDraft(await draft()));
      expect(error.code).toBe("check_failed");
      expect(error.issues).toEqual([issue]);
      expect(launches).toEqual([]);
      expect(readdirSync(controller.tempRoot)).toEqual([]);
    });

    it("checks a draft: rule issues alone, else checkHost on a removed copy", async () => {
      const { controller, checks } = create();
      const bad = await controller.checkDraft(
        await draft({
          setters: [
            {
              path: "members.sb-b.reactor.backends.main.storage.dataDir",
              value: "./.ph/a",
            },
          ],
        }),
      );
      expect(bad.ruleIssues.length).toBeGreaterThan(0);
      expect(bad.issues).toEqual([]);
      expect(checks).toEqual([]);

      const good = await controller.checkDraft(await draft());
      expect(good).toEqual({ ruleIssues: [], issues: [] });
      const checked = checks[0].projectRoot;
      expect(path.basename(checked)).toBe("project");
      expect(path.basename(path.dirname(checked))).toMatch(
        /^check-[0-9a-f-]+$/,
      );
      expect(path.dirname(path.dirname(checked))).toBe(controller.tempRoot);
      expect(readdirSync(controller.tempRoot)).toEqual([]);
    });

    it("counts drafts against the instance limit", async () => {
      const { controller } = create({ maxInstances: 1 });
      await controller.startDraft(await draft());
      expect((await errorOf(controller.startDraft(await draft()))).code).toBe(
        "instance_limit",
      );
    });

    it("dispose removes copies and its exit hook", async () => {
      const listeners = process.listenerCount("exit");
      const { controller } = create();
      expect(process.listenerCount("exit")).toBe(listeners + 1);
      await controller.startDraft(await draft());
      await controller.dispose();
      expect(existsSync(controller.tempRoot)).toBe(false);
      expect(process.listenerCount("exit")).toBe(listeners);
    });
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
