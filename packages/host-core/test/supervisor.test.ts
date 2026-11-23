import { spawn } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { callControl, CONTROL_PROTOCOL } from "../src/control-channel.js";
import { killTree } from "../src/kill-tree.js";
import { fileAccessList } from "../src/owner-only.js";
import { isPidAlive } from "../src/run-record.js";
import {
  findSupervisor,
  holdSupervisorLease,
  listSupervised,
  shutdownSupervisor,
  silentSupervisorMessage,
  startSupervised,
  startSupervisedHost,
  startSupervisor,
  stopSupervised,
  restartSupervised,
  supervisedLogs,
  supervisorLockPath,
  supervisorRecordPath,
  SUPERVISOR_HOME_ENV,
  type Supervisor,
  type SupervisorRecord,
  type SupervisorStartParams,
} from "../src/supervisor.js";

// argv: node cli.mjs run <host> [verb]. Knobs come from the child's env.
const FAKE_CLI = `import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const host = process.argv[3];
const grandchild = process.env.FAKE_GRANDCHILD
  ? spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore", windowsHide: true }).pid
  : undefined;
const runDir = path.join(process.env.PH_USER_DATA_DIR ?? process.cwd(), ".ph", "run");
const file = path.join(runDir, host + ".json");
const shape = process.env.FAKE_RECORD ?? "v2";
if (process.env.FAKE_GRANDCHILD_FILE) writeFileSync(process.env.FAKE_GRANDCHILD_FILE, String(grandchild));
process.on("exit", () => {
  try {
    if (JSON.parse(readFileSync(file, "utf8")).pid === process.pid) rmSync(file);
  } catch {}
});
if (process.env.PH_STOP_ON_STDIN === "1" && !process.env.FAKE_DEAF) {
  process.stdin.on("end", () => {
    console.log("fake: stdin ended");
    process.exit(0);
  });
  process.stdin.resume();
}
if (process.env.FAKE_STOP_CHANNEL) {
  // As a host of 6.3: its own stop request, and no stop on stdin.
  const asked = () => {
    console.log("fake: asked to stop");
    process.exit(0);
  };
  process.on("SIGTERM", asked);
  if (process.platform === "win32") {
    const net = await import("node:net");
    net.createServer((socket) => { socket.end(); asked(); })
      .listen("\\\\\\\\.\\\\pipe\\\\ph-stop-" + process.pid);
  }
}
console.log("fake ph run", process.argv.slice(2).join(" "));
if (process.env.FAKE_EXIT_EARLY) {
  console.error("fake: boom");
  process.exit(3);
}
if (existsSync(file)) {
  const other = JSON.parse(readFileSync(file, "utf8")).pid;
  try {
    process.kill(other, 0);
    console.error(host + " is already running for this project (pid " + other + ")");
    process.exit(1);
  } catch {}
}
if (shape !== "none") {
  mkdirSync(runDir, { recursive: true });
  const base = { host, pid: process.pid, startedAt: new Date().toISOString() };
  writeFileSync(file, JSON.stringify(shape === "v1"
    ? { ...base, version: 1, url: "http://127.0.0.1:1" }
    : {
        ...base,
        version: 2,
        projectName: "supervised-lab",
        kind: "reactor",
        verb: process.argv[4] ?? "run",
        outputs: { origin: "http://127.0.0.1:4321", env: process.env, argv: process.argv.slice(2), grandchild },
        ...(process.env.FAKE_CONTROL_PROTOCOL
          ? { extra: { control: { protocol: Number(process.env.FAKE_CONTROL_PROTOCOL), address: "nowhere", token: "t" } } }
          : {}),
      }));
}
setInterval(() => {}, 1000);
`;

// A caller of its own: takes a lease, starts one host with it, and waits.
// argv: address token projectDir host envJson
const CALLER = `import net from "node:net";
const [address, token, projectDir, host, env] = process.argv.slice(2);
const send = (id, method, params) =>
  new Promise((resolve, reject) => {
    const socket = net.connect(address);
    let text = "";
    socket.on("error", reject);
    socket.on("data", (chunk) => {
      text += chunk;
      for (;;) {
        const at = text.indexOf("\\n");
        if (at < 0) break;
        const frame = JSON.parse(text.slice(0, at));
        text = text.slice(at + 1);
        if (frame.stream !== undefined || frame.ok !== undefined) resolve(frame);
      }
    });
    socket.once("connect", () =>
      socket.write(JSON.stringify({ protocol: ${CONTROL_PROTOCOL}, id, token, method, params }) + "\\n"));
  });
await send(1, "lease", { id: "caller-" + process.pid });
const started = await send(2, "start", {
  host, projectDir, lease: "caller-" + process.pid, env: JSON.parse(env),
});
console.log(JSON.stringify(started));
setInterval(() => {}, 1000);
`;

const temporary: string[] = [];
const supervisors: Supervisor[] = [];
const pids: number[] = [];

afterEach(async () => {
  for (const supervisor of supervisors.splice(0)) await supervisor.stop();
  for (const pid of pids.splice(0)) {
    if (pid > 0 && isPidAlive(pid)) killTree(pid, "SIGKILL");
  }
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

function makeProject(cliVersion?: string): string {
  const dir = tempDir("ph-supervised-");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "supervised-lab", type: "module" }),
  );
  const cliDir = path.join(dir, "node_modules", "@powerhousedao", "ph-cli");
  mkdirSync(path.join(cliDir, "dist"), { recursive: true });
  writeFileSync(
    path.join(cliDir, "package.json"),
    JSON.stringify({
      name: "@powerhousedao/ph-cli",
      type: "module",
      ...(cliVersion === undefined ? {} : { version: cliVersion }),
    }),
  );
  writeFileSync(path.join(cliDir, "dist", "cli.mjs"), FAKE_CLI);
  return dir;
}

function homeEnv(): Record<string, string> {
  return { [SUPERVISOR_HOME_ENV]: tempDir("ph-supervisor-home-") };
}

async function supervise(env: Record<string, string>): Promise<Supervisor> {
  const result = await startSupervisor({ env, version: "0.0.0-test" });
  if (!("supervisor" in result)) throw new Error("one runs already");
  supervisors.push(result.supervisor);
  return result.supervisor;
}

async function until(done: () => boolean, ms = 15_000): Promise<void> {
  const deadline = Date.now() + ms;
  while (!done()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

const withSupervisor = (
  projectDir: string,
  host: string,
  more: Partial<SupervisorStartParams> = {},
): SupervisorStartParams => ({
  host,
  projectDir,
  lifetime: "supervisor",
  ...more,
});

describe("the supervisor of a user", () => {
  it("records itself for the user alone and is found without a project", async () => {
    const env = homeEnv();
    expect(await findSupervisor(env)).toEqual({ status: "none" });
    const supervisor = await supervise(env);

    const file = supervisorRecordPath(env);
    const written = JSON.parse(readFileSync(file, "utf8")) as SupervisorRecord;
    expect(written).toMatchObject({
      version: 1,
      pid: process.pid,
      mode: "standalone",
      supervisorVersion: "0.0.0-test",
      control: { protocol: CONTROL_PROTOCOL },
    });
    expect(written.control.token.length).toBeGreaterThan(20);
    if (process.platform === "win32") {
      // The user, and what the system adds for itself: no other user.
      const others = fileAccessList(file).filter(
        (entry) => !/SYSTEM|Administrators/i.test(entry),
      );
      expect(others).toHaveLength(1);
    }

    const found = await findSupervisor(env);
    expect(found.status).toBe("running");
    if (found.status !== "running") return;
    expect(found.hello).toMatchObject({
      supervisor: true,
      mode: "standalone",
      pid: process.pid,
      version: "0.0.0-test",
    });
    expect(found.hello.methods).toEqual(
      expect.arrayContaining([
        "start",
        "stop",
        "restart",
        "list",
        "logs",
        "lease",
        "shutdown",
      ]),
    );
    expect(supervisor.instances()).toEqual([]);
  });

  it("refuses a caller without the token", async () => {
    const env = homeEnv();
    const supervisor = await supervise(env);
    await expect(
      callControl({ ...supervisor.record.control, token: "guess" }, "list"),
    ).rejects.toMatchObject({ code: "unauthorized" });
  });

  it("starts nothing when one runs for the user: the second start reports it", async () => {
    const env = homeEnv();
    const first = await supervise(env);
    const second = await startSupervisor({ env, version: "0.0.0-test" });
    expect("existing" in second).toBe(true);
    if (!("existing" in second)) return;
    expect(second.existing.status).toBe("running");
    if (second.existing.status !== "running") return;
    expect(second.existing.record.control.address).toBe(
      first.record.control.address,
    );
    // The first one's record stands.
    expect(
      (
        JSON.parse(
          readFileSync(supervisorRecordPath(env), "utf8"),
        ) as SupervisorRecord
      ).pid,
    ).toBe(process.pid);
  });

  it("takes over a lock and a record a dead process left", async () => {
    const env = homeEnv();
    const home = env[SUPERVISOR_HOME_ENV]!;
    const gone = spawn(process.execPath, ["-e", ""], { windowsHide: true });
    await new Promise((resolve) => gone.once("exit", resolve));
    writeFileSync(
      supervisorLockPath(env),
      JSON.stringify({ pid: gone.pid, startedAt: new Date().toISOString() }),
    );
    writeFileSync(
      path.join(home, "supervisor.json"),
      JSON.stringify({
        version: 1,
        pid: gone.pid,
        startedAt: new Date().toISOString(),
        supervisorVersion: "0",
        mode: "standalone",
        user: "",
        control: { protocol: CONTROL_PROTOCOL, address: "gone", token: "t" },
      }),
    );
    expect(await findSupervisor(env)).toEqual({ status: "none" });
    const supervisor = await supervise(env);
    expect(supervisor.record.pid).toBe(process.pid);
  });

  it("is silent when its process runs and nothing answers at its address", async () => {
    const env = homeEnv();
    const sleeper = spawn(
      process.execPath,
      ["-e", "setInterval(() => {}, 1000)"],
      { stdio: "ignore", windowsHide: true },
    );
    pids.push(sleeper.pid!);
    writeFileSync(
      supervisorRecordPath(env),
      JSON.stringify({
        version: 1,
        pid: sleeper.pid,
        startedAt: new Date().toISOString(),
        supervisorVersion: "0",
        mode: "standalone",
        user: "",
        control: {
          protocol: CONTROL_PROTOCOL,
          address:
            process.platform === "win32"
              ? "\\\\.\\pipe\\ph-no-such-supervisor"
              : path.join(env[SUPERVISOR_HOME_ENV]!, "none.sock"),
          token: "t",
        },
      }),
    );
    const found = await findSupervisor(env);
    expect(found.status).toBe("silent");
    if (found.status !== "silent") return;
    expect(found.pid).toBe(sleeper.pid);
    const message = silentSupervisorMessage(found, env);
    expect(message).toContain(`pid ${sleeper.pid}`);
    expect(message).toContain("does not answer");
    expect(message).toContain("Nothing was started");

    // And no second supervisor starts over it.
    writeFileSync(
      supervisorLockPath(env),
      JSON.stringify({ pid: sleeper.pid, startedAt: new Date().toISOString() }),
    );
    const second = await startSupervisor({ env });
    expect(second).toMatchObject({
      existing: { status: "silent", pid: sleeper.pid },
    });
  }, 40_000);

  it("is silent when it is installed and not running", async () => {
    const env = homeEnv();
    const gone = spawn(process.execPath, ["-e", ""], { windowsHide: true });
    await new Promise((resolve) => gone.once("exit", resolve));
    writeFileSync(
      supervisorRecordPath(env),
      JSON.stringify({
        version: 1,
        pid: gone.pid,
        startedAt: new Date().toISOString(),
        supervisorVersion: "0",
        mode: "installed",
        user: "",
        control: { protocol: CONTROL_PROTOCOL, address: "gone", token: "t" },
      }),
    );
    expect(await findSupervisor(env)).toMatchObject({
      status: "silent",
      reason: expect.stringContaining("installed") as unknown,
    });
  });
});

describe("instances under the supervisor", () => {
  it("starts the project's own ph run, and returns the running instance to a second start", async () => {
    const env = homeEnv();
    const supervisor = await supervise(env);
    const control = supervisor.record.control;
    const project = makeProject();

    const first = await startSupervised(
      control,
      withSupervisor(project, "lab-sb", {
        verb: "dev",
        argv: ["--port", "1"],
        env: { LAB: "yes" },
      }),
    );
    expect(first.started).toBe(true);
    pids.push(first.instance.pid);
    expect(first.instance).toMatchObject({
      handle: "1",
      host: "lab-sb",
      projectDir: project,
      dataDir: project,
      status: "running",
      mine: true,
      lifetime: "supervisor",
      ports: { "lab-sb": 4321 },
      endpoints: { origin: "http://127.0.0.1:4321" },
    });
    const outputs = first.instance.record!.outputs as {
      argv: string[];
      env: Record<string, string>;
    };
    expect(outputs.argv).toEqual(["run", "lab-sb", "dev", "--", "--port", "1"]);
    expect(outputs.env.LAB).toBe("yes");
    expect(outputs.env.PH_USER_DATA_DIR).toBe(project);
    expect(outputs.env.PH_STOP_ON_STDIN).toBe("1");
    // It is a child of the supervisor, with no channel of its own.
    expect(first.instance.missing).toEqual([
      expect.stringContaining("no control channel"),
    ]);

    const again = await startSupervised(
      control,
      withSupervisor(project, "lab-sb"),
    );
    expect(again.started).toBe(false);
    expect(again.instance.pid).toBe(first.instance.pid);
    expect(again.instance.handle).toBe("1");

    // The same host on another data folder is another instance.
    const elsewhere = tempDir("ph-supervised-data-");
    const other = await startSupervised(
      control,
      withSupervisor(project, "lab-sb", { dataDir: elsewhere }),
    );
    pids.push(other.instance.pid);
    expect(other.started).toBe(true);
    expect(other.instance.pid).not.toBe(first.instance.pid);
    expect(other.instance.dataDir).toBe(elsewhere);

    const listed = await listSupervised(control);
    expect(listed.supervisor.pid).toBe(process.pid);
    expect(listed.instances.map((i) => [i.handle, i.status, i.mine])).toEqual([
      ["1", "running", true],
      ["2", "running", true],
    ]);

    const logs = await supervisedLogs(control, "1");
    expect(logs.text).toContain("fake ph run run lab-sb dev -- --port 1");
    expect(logs.logFile.startsWith(env[SUPERVISOR_HOME_ENV]!)).toBe(true);

    // By host name while it names one instance only.
    await expect(stopSupervised(control, "lab-sb")).rejects.toThrow(
      /names 2 instances/,
    );
    const stopped = await stopSupervised(control, "2");
    expect(stopped.status).toBe("exited");
    expect(isPidAlive(other.instance.pid)).toBe(false);
    const byName = await stopSupervised(control, "lab-sb");
    expect(byName.handle).toBe("1");
    expect(isPidAlive(first.instance.pid)).toBe(false);
    expect(existsSync(path.join(project, ".ph", "run", "lab-sb.json"))).toBe(
      false,
    );
  });

  it("restarts an instance under its handle", async () => {
    const supervisor = await supervise(homeEnv());
    const control = supervisor.record.control;
    const project = makeProject();
    const first = await startSupervised(
      control,
      withSupervisor(project, "lab-sb"),
    );
    pids.push(first.instance.pid);
    const next = await restartSupervised(control, first.instance.handle);
    pids.push(next.pid);
    expect(next.handle).toBe(first.instance.handle);
    expect(next.pid).not.toBe(first.instance.pid);
    expect(next.status).toBe("running");
    expect(isPidAlive(first.instance.pid)).toBe(false);
  });

  it("returns an instance something else started, and does not stop it", async () => {
    const supervisor = await supervise(homeEnv());
    const control = supervisor.record.control;
    const project = makeProject();
    const theirs = spawn(
      process.execPath,
      [
        path.join(
          project,
          "node_modules",
          "@powerhousedao",
          "ph-cli",
          "dist",
          "cli.mjs",
        ),
        "run",
        "lab-sb",
      ],
      {
        cwd: project,
        env: { ...process.env, PH_USER_DATA_DIR: project },
        stdio: "ignore",
        windowsHide: true,
      },
    );
    pids.push(theirs.pid!);
    const file = path.join(project, ".ph", "run", "lab-sb.json");
    await until(() => existsSync(file));

    const result = await startSupervised(
      control,
      withSupervisor(project, "lab-sb"),
    );
    expect(result.started).toBe(false);
    expect(result.instance).toMatchObject({
      pid: theirs.pid,
      mine: false,
      status: "running",
    });
    expect(result.instance.missing.join(" ")).toContain(
      "not started by this supervisor",
    );
    const listed = await listSupervised(control);
    expect(listed.instances.map((i) => [i.pid, i.mine])).toEqual([
      [theirs.pid, false],
    ]);

    await supervisor.stop();
    expect(isPidAlive(theirs.pid!)).toBe(true);
  });

  it("says what failed, with the end of the output", async () => {
    const supervisor = await supervise(homeEnv());
    const project = makeProject();
    await expect(
      startSupervised(
        supervisor.record.control,
        withSupervisor(project, "lab-sb", { env: { FAKE_EXIT_EARLY: "1" } }),
      ),
    ).rejects.toThrow(
      /exited \(code 3\) before writing its run record[\s\S]*--- output tail ---[\s\S]*fake: boom/,
    );
    expect(supervisor.instances().map((i) => i.status)).toEqual(["exited"]);
  });

  it("gives the shape spawnHost gives", async () => {
    const supervisor = await supervise(homeEnv());
    const control = supervisor.record.control;
    const project = makeProject();
    const host = await startSupervisedHost(
      control,
      withSupervisor(project, "lab-sb"),
    );
    pids.push(host.pid);
    expect(host.existing).toBeUndefined();
    expect(host.record.host).toBe("lab-sb");
    expect(host.outputs?.origin).toBe("http://127.0.0.1:4321");
    expect(host.handle).toBe("1");

    const second = await startSupervisedHost(
      control,
      withSupervisor(project, "lab-sb"),
    );
    expect(second.existing).toBe(true);
    await second.stop();
    expect(isPidAlive(host.pid)).toBe(true);

    await host.stop();
    expect(isPidAlive(host.pid)).toBe(false);
    await expect(host.exited).resolves.toMatchObject({ forced: false });
  });
});

describe("lifetime", () => {
  it("refuses a start with the caller that holds no lease", async () => {
    const supervisor = await supervise(homeEnv());
    const project = makeProject();
    await expect(
      startSupervised(supervisor.record.control, {
        host: "lab-sb",
        projectDir: project,
      }),
    ).rejects.toThrow(/needs the caller's lease/);
    expect(supervisor.instances()).toEqual([]);
  });

  it("stops what lives with a caller when the lease is released, and keeps the rest", async () => {
    const supervisor = await supervise(homeEnv());
    const control = supervisor.record.control;
    const project = makeProject();
    const kept = await startSupervised(
      control,
      withSupervisor(project, "kept"),
    );
    pids.push(kept.instance.pid);

    const lease = await holdSupervisorLease(control);
    const mine = await startSupervised(control, {
      host: "with-caller",
      projectDir: project,
      lifetime: "caller",
      lease: lease.id,
    });
    pids.push(mine.instance.pid);
    expect(mine.instance.lifetime).toBe("caller");

    await lease.release();
    await until(() => !isPidAlive(mine.instance.pid));
    expect(isPidAlive(kept.instance.pid)).toBe(true);
    const listed = await listSupervised(control);
    expect(listed.instances.map((i) => [i.host, i.status])).toEqual([
      ["kept", "running"],
      ["with-caller", "exited"],
    ]);
  });

  it("stops a caller's instance, tree included, when the caller is killed", async () => {
    const supervisor = await supervise(homeEnv());
    const control = supervisor.record.control;
    const project = makeProject();
    const script = path.join(tempDir("ph-caller-"), "caller.mjs");
    writeFileSync(script, CALLER);
    const caller = spawn(
      process.execPath,
      [
        script,
        control.address,
        control.token,
        project,
        "lab-sb",
        JSON.stringify({ FAKE_GRANDCHILD: "1" }),
      ],
      { stdio: ["ignore", "pipe", "inherit"], windowsHide: true },
    );
    pids.push(caller.pid!);
    let out = "";
    caller.stdout.on("data", (chunk: Buffer) => (out += chunk.toString()));
    await until(() => out.includes("\n"), 30_000);
    const frame = JSON.parse(out) as {
      result: {
        instance: { pid: number; record: { outputs: { grandchild: number } } };
      };
    };
    const pid = frame.result.instance.pid;
    const grandchild = frame.result.instance.record.outputs.grandchild;
    pids.push(pid, grandchild);
    expect(isPidAlive(pid)).toBe(true);
    expect(isPidAlive(grandchild)).toBe(true);

    // However it ends: no goodbye is sent.
    killTree(caller.pid!, "SIGKILL");
    await until(() => !isPidAlive(pid) && !isPidAlive(grandchild), 30_000);
    expect(existsSync(path.join(project, ".ph", "run", "lab-sb.json"))).toBe(
      false,
    );
    await until(() => supervisor.instances()[0]?.status === "exited");
  }, 60_000);
});

describe("stopping the supervisor", () => {
  it("stops everything it holds with its tree, and leaves no record", async () => {
    const env = homeEnv();
    const supervisor = await supervise(env);
    const control = supervisor.record.control;
    const project = makeProject();
    const polite = await startSupervised(
      control,
      withSupervisor(project, "polite", { env: { FAKE_GRANDCHILD: "1" } }),
    );
    // One that does not stop when asked: killed with its tree.
    const deaf = await startSupervised(
      control,
      withSupervisor(project, "deaf", {
        env: { FAKE_GRANDCHILD: "1", FAKE_DEAF: "1" },
        stopTimeoutMs: 500,
      }),
    );
    const all = [polite, deaf].flatMap(({ instance }) => [
      instance.pid,
      (instance.record!.outputs as { grandchild: number }).grandchild,
    ]);
    pids.push(...all);
    expect(all.every((pid) => isPidAlive(pid))).toBe(true);

    const answer = await shutdownSupervisor(control);
    expect(answer).toEqual({ pid: process.pid, held: 2 });
    await supervisor.stopped;

    expect(all.filter((pid) => isPidAlive(pid))).toEqual([]);
    expect(existsSync(path.join(project, ".ph", "run", "polite.json"))).toBe(
      false,
    );
    expect(existsSync(path.join(project, ".ph", "run", "deaf.json"))).toBe(
      false,
    );
    expect(existsSync(supervisorRecordPath(env))).toBe(false);
    expect(existsSync(supervisorLockPath(env))).toBe(false);
    expect(await findSupervisor(env)).toEqual({ status: "none" });
    await expect(listSupervised(control)).rejects.toMatchObject({
      code: "unreachable",
    });
  }, 60_000);
});

describe("hosts of another version", () => {
  it("starts, lists and stops one that writes an older record", async () => {
    const supervisor = await supervise(homeEnv());
    const control = supervisor.record.control;
    const project = makeProject();
    const old = await startSupervised(
      control,
      withSupervisor(project, "old-host", { env: { FAKE_RECORD: "v1" } }),
    );
    pids.push(old.instance.pid);
    expect(old.instance.status).toBe("running");
    expect(old.instance.record).toBeUndefined();
    expect(old.instance.missing).toEqual([
      expect.stringContaining("a run record of another version"),
      expect.stringContaining("no control channel"),
    ]);
    const listed = await listSupervised(control);
    expect(listed.instances[0]).toMatchObject({
      handle: "1",
      host: "old-host",
      status: "running",
    });
    await stopSupervised(control, "1");
    expect(isPidAlive(old.instance.pid)).toBe(false);
  });

  it("starts, lists and stops by its tree one that writes no record and reads no stdin", async () => {
    const supervisor = await supervise(homeEnv());
    const control = supervisor.record.control;
    const project = makeProject();
    const grandchildFile = path.join(tempDir("ph-gc-"), "pid");
    await expect(
      startSupervised(
        control,
        withSupervisor(project, "mute", {
          env: { FAKE_RECORD: "none" },
          readyTimeoutMs: 500,
        }),
      ),
    ).rejects.toThrow(/wrote no run record within 500 ms/);

    const mute = await startSupervised(
      control,
      withSupervisor(project, "mute", {
        env: {
          FAKE_RECORD: "none",
          FAKE_DEAF: "1",
          FAKE_GRANDCHILD: "1",
          FAKE_GRANDCHILD_FILE: grandchildFile,
        },
        readyTimeoutMs: 500,
        stopTimeoutMs: 500,
        record: "optional",
      }),
    );
    const grandchild = Number(readFileSync(grandchildFile, "utf8"));
    pids.push(mute.instance.pid, grandchild);
    expect(mute.instance.status).toBe("running");
    expect(mute.instance.missing).toEqual([
      expect.stringContaining("no run record"),
      expect.stringContaining("no control channel"),
    ]);
    expect(isPidAlive(grandchild)).toBe(true);

    const stopped = await stopSupervised(control, mute.instance.handle);
    expect(stopped.exit?.forced).toBe(true);
    expect(isPidAlive(mute.instance.pid)).toBe(false);
    expect(isPidAlive(grandchild)).toBe(false);
  }, 60_000);

  it("asks a host of a 6.3 project over its stop channel, since it reads no stdin", async () => {
    const supervisor = await supervise(homeEnv());
    const control = supervisor.record.control;
    const project = makeProject("6.3.0-dev.10");
    const old = await startSupervised(
      control,
      withSupervisor(project, "switchboard", {
        env: { FAKE_DEAF: "1", FAKE_STOP_CHANNEL: "1" },
      }),
    );
    pids.push(old.instance.pid);
    expect(old.instance.runnerVersion).toBe("6.3.0-dev.10");
    expect(old.instance.missing).toEqual([
      expect.stringContaining("no control channel"),
      expect.stringContaining("a host of 6.3.0-dev.10"),
    ]);

    const stopped = await stopSupervised(control, old.instance.handle);
    expect(stopped.exit).toEqual({ code: 0, signal: null, forced: false });
    const { text } = await supervisedLogs(control, old.instance.handle);
    expect(text).toContain("fake: asked to stop");
    expect(text).not.toContain("fake: stdin ended");

    // A host of this release is asked through its stdin.
    const current = await startSupervised(
      control,
      withSupervisor(makeProject("6.4.0-next.3"), "switchboard"),
    );
    pids.push(current.instance.pid);
    expect(current.instance.missing).toEqual([
      expect.stringContaining("no control channel"),
    ]);
    await stopSupervised(control, current.instance.handle);
    expect(
      (await supervisedLogs(control, current.instance.handle)).text,
    ).toContain("fake: stdin ended");
  }, 60_000);

  it("names the protocol of a host whose channel it does not speak", async () => {
    const supervisor = await supervise(homeEnv());
    const project = makeProject();
    const older = await startSupervised(
      supervisor.record.control,
      withSupervisor(project, "proto-one", {
        env: { FAKE_CONTROL_PROTOCOL: "1" },
      }),
    );
    pids.push(older.instance.pid);
    expect(older.instance.controlProtocol).toBe(1);
    expect(older.instance.missing).toEqual([
      expect.stringContaining("control protocol 1"),
    ]);
  });
});
