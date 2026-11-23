import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import net from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import {
  callControl,
  CONTROL_PROTOCOL,
  controlRecordOf,
  isPidAlive,
  readRunRecord,
  type ControlRecord,
} from "@powerhousedao/host-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// F1 end to end: a Cli that keeps running, started by the real `ph-run run
// <host>`, and the service commands typed in other processes, which act on
// what runs in the first. Every process started here is gone at the end.

const here = path.dirname(fileURLToPath(import.meta.url));
const CLINT_ROOT = path.resolve(here, "..");
const REPO = path.resolve(CLINT_ROOT, "../..");
const FIXTURES = path.join(here, "fixtures", "cli-runner");
const PH_RUN_ROOT = path.join(REPO, "clis", "ph-run");
const HOST_CORE_ROOT = path.join(REPO, "packages", "host-core");
const PH_RUN = path.join(PH_RUN_ROOT, "dist", "cli.mjs");

const stripAnsi = (text: string) =>
  text
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-9;?<>=]*[A-Za-z~]/g, "")
    .replace(/\x1b[=>78]/g, "");

function link(target: string, at: string) {
  mkdirSync(path.dirname(at), { recursive: true });
  symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
}

function writeHost(root: string, folder: string, host: object) {
  mkdirSync(path.join(root, "hosts", folder), { recursive: true });
  writeFileSync(
    path.join(root, "hosts", folder, "host.js"),
    `export default ${JSON.stringify(host, null, 2)};\n`,
  );
}

/** The project: a cli host of the serving Cli with a service, and a stack of
 * an HTTP member with that Cli in front. */
function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ph-cli-control-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "control-lab", private: true, type: "module" }),
  );
  writeFileSync(path.join(root, "powerhouse.config.json"), "{}");
  const modules = path.join(root, "node_modules");
  link(CLINT_ROOT, path.join(modules, "@powerhousedao", "clint"));
  link(PH_RUN_ROOT, path.join(modules, "@powerhousedao", "ph-run"));
  link(HOST_CORE_ROOT, path.join(modules, "@powerhousedao", "host-core"));
  link(
    realpathSync(path.join(CLINT_ROOT, "node_modules", "zod")),
    path.join(modules, "zod"),
  );
  const pack = path.join(modules, "@fixture", "service-cli");
  mkdirSync(pack, { recursive: true });
  copyFileSync(
    path.join(FIXTURES, "service-cli.mjs"),
    path.join(pack, "cli.mjs"),
  );
  copyFileSync(
    path.join(FIXTURES, "commands.mjs"),
    path.join(pack, "commands.mjs"),
  );
  writeFileSync(
    path.join(pack, "package.json"),
    JSON.stringify({
      name: "@fixture/service-cli",
      type: "module",
      exports: { "./cli": { node: "./cli.mjs" } },
    }),
  );
  const upstream = path.join(modules, "@fixture", "upstream");
  mkdirSync(upstream, { recursive: true });
  copyFileSync(
    path.join(FIXTURES, "upstream-runner.mjs"),
    path.join(upstream, "runner.mjs"),
  );
  writeFileSync(
    path.join(upstream, "package.json"),
    JSON.stringify({
      name: "@fixture/upstream",
      type: "module",
      exports: { "./runner": "./runner.mjs" },
    }),
  );
  writeHost(root, "services", {
    name: "services",
    runner: { module: "@powerhousedao/clint/cli-runner" },
    config: { package: "@fixture/service-cli" },
  });
  writeHost(root, "upstream", {
    name: "control-upstream",
    runner: { module: "@fixture/upstream/runner" },
  });
  writeHost(root, "stack-cli", {
    name: "stack-cli",
    runner: { module: "@powerhousedao/clint/cli-runner" },
    config: { package: "@fixture/service-cli" },
  });
  writeHost(root, "service-stack", {
    name: "service-stack",
    runner: { module: "@powerhousedao/host-core/runners/compound" },
    children: { upstream: { host: "upstream" }, cli: { host: "stack-cli" } },
  });
  return root;
}

interface Run {
  child: ChildProcess;
  output(): string;
  exited: Promise<number | null>;
}

describe("service commands beside a Cli that keeps running", () => {
  let project: string;
  let home: string;
  const started: ChildProcess[] = [];
  /** Every process a run reported: the workers, the stack's member. */
  const reported = new Set<number>();
  const env: Record<string, string> = {};

  function phRun(args: string[]): Run {
    const child = spawn(process.execPath, [PH_RUN, "run", ...args], {
      cwd: project,
      env,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    started.push(child);
    let text = "";
    child.stdout?.on("data", (chunk: Buffer) => (text += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (text += chunk.toString()));
    child.stdin?.on("error", () => undefined);
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    return { child, output: () => stripAnsi(text), exited };
  }

  async function waitFor(run: Run, expected: string, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (!run.output().includes(expected)) {
      if (run.child.exitCode !== null) {
        throw new Error(
          `exited (${run.child.exitCode}) before printing "${expected}":\n${run.output()}`,
        );
      }
      if (Date.now() > deadline) {
        throw new Error(
          `"${expected}" not printed within ${timeoutMs} ms:\n${run.output()}`,
        );
      }
      await sleep(100);
    }
  }

  /** A command in a process of its own, beside whatever runs. */
  async function command(host: string, ...argv: string[]) {
    const run = phRun([host, "--", ...argv]);
    const timer = setTimeout(() => run.child.kill("SIGKILL"), 120_000);
    const code = await run.exited;
    clearTimeout(timer);
    return { code, output: run.output() };
  }

  /** The pid `-ps` or `-start` printed for the instance. */
  function pidIn(output: string): number {
    const pid = Number(/pid (\d+)/.exec(output)?.[1]);
    expect(pid, output).toBeGreaterThan(0);
    reported.add(pid);
    return pid;
  }

  /** The worker processes themselves, from the service's log (on Windows
   * the instance's pid is the shell's). */
  async function workers(host: string): Promise<number[]> {
    const { output } = await command(host, "worker-logs", "--lines", "200");
    const pids = [...output.matchAll(/test-service pid (\d+)/g)].map((m) =>
      Number(m[1]),
    );
    for (const pid of pids) reported.add(pid);
    return pids;
  }

  async function gone(pid: number, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (isPidAlive(pid) && Date.now() < deadline) await sleep(100);
    return !isPidAlive(pid);
  }

  function controlOf(host: string): ControlRecord {
    const control = controlRecordOf(readRunRecord(project, host));
    expect(control).toBeDefined();
    return control!;
  }

  beforeAll(() => {
    for (const [file, what] of [
      [path.join(CLINT_ROOT, "dist", "runners", "cli-runner.mjs"), "clint"],
      [PH_RUN, "ph-run"],
      [path.join(HOST_CORE_ROOT, "dist", "control-channel.mjs"), "host-core"],
    ]) {
      if (!existsSync(file)) {
        throw new Error(
          `Build @powerhousedao/${what} first: ${file} is missing.`,
        );
      }
    }
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    delete env.PH_STOP_ON_STDIN;
    delete env.PH_COMPOUND_MEMBER;
    env.PH_NO_TELEMETRY = "1";
    env.FIXTURE_TEST_SERVICE = path.join(here, "fixtures", "test-service.js");
    project = makeProject();
    // The Cli keeps its services' state under the user's home: a home of
    // this test's own.
    home = mkdtempSync(path.join(tmpdir(), "ph-cli-control-home-"));
    env.HOME = home;
    env.USERPROFILE = home;
  });

  afterAll(() => {
    const alive = [
      ...started
        .filter((child) => child.exitCode === null && child.signalCode === null)
        .flatMap((child) => (child.pid ? [child.pid] : [])),
      ...[...reported].filter((pid) => isPidAlive(pid)),
    ];
    for (const pid of alive) {
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
          windowsHide: true,
        });
      } else {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // gone
        }
      }
    }
    for (const dir of [project, home]) {
      rmSync(dir, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 300,
      });
    }
    expect(alive).toEqual([]);
  }, 60_000);

  it("refuses a start with nothing running to forward to, and starts nothing", async () => {
    for (const name of ["worker-start", "worker-restart"]) {
      const { code, output } = await command("services", name);
      expect(code).toBe(1);
      expect(output).toContain("worker was not started");
      expect(output).toContain("`ph run services`");
      expect(output).not.toContain("[ready]");
    }
    const ps = await command("services", "worker-ps");
    expect(ps.code).toBe(0);
    expect(ps.output).toContain("[idle]");
    expect(await workers("services")).toEqual([]);
  }, 300_000);

  it("acts on the running instance: ps, start, restart, stop and start again", async () => {
    const serving = phRun(["services"]);
    await waitFor(serving, "Serving");
    const control = controlOf("services");
    expect(control.protocol).toBe(CONTROL_PROTOCOL);
    expect(control.address).toContain(String(serving.child.pid));
    await expect(callControl(control, "hello")).resolves.toMatchObject({
      cli: "fixture-services",
      pid: serving.child.pid,
      mode: "ad hoc",
    });

    expect((await command("services", "worker-ps")).output).toContain("[idle]");

    // Started from a second process, it runs in the first and stays.
    const start = await command("services", "worker-start");
    expect(start.code).toBe(0);
    expect(start.output).toContain("Worker [ready]");
    expect(start.output).toContain("port=4592");
    const first = pidIn(start.output);
    const [firstWorker] = await workers("services");
    expect(isPidAlive(firstWorker)).toBe(true);

    const ps = await command("services", "worker-ps");
    expect(ps.code).toBe(0);
    expect(ps.output).toContain("Worker [ready]");
    expect(ps.output).not.toContain("failed");
    expect(pidIn(ps.output)).toBe(first);

    const restart = await command("services", "worker-restart");
    expect(restart.code).toBe(0);
    expect(restart.output).toContain("Worker [ready]");
    expect(pidIn(restart.output)).not.toBe(first);
    expect(await gone(firstWorker)).toBe(true);
    const secondWorker = (await workers("services")).at(-1)!;
    expect(secondWorker).not.toBe(firstWorker);
    expect(isPidAlive(secondWorker)).toBe(true);

    const stop = await command("services", "worker-stop");
    expect(stop.code).toBe(0);
    expect(stop.output).not.toContain("✗");
    expect(await gone(secondWorker)).toBe(true);
    expect((await command("services", "worker-ps")).output).toContain(
      "[stopped]",
    );

    const again = await command("services", "worker-start");
    expect(again.output).toContain("Worker [ready]");
    pidIn(again.output);
    const thirdWorker = (await workers("services")).at(-1)!;
    expect(isPidAlive(thirdWorker)).toBe(true);

    // A request without the record's token is refused, and changes nothing.
    await expect(
      callControl({ ...control, token: "guess" }, "stop", { id: "worker" }),
    ).rejects.toMatchObject({ code: "unauthorized" });
    const unsigned = await new Promise<string>((resolve, reject) => {
      const socket = net.connect(control.address);
      let text = "";
      socket.setEncoding("utf8");
      socket.once("error", reject);
      socket.once("connect", () =>
        socket.write(
          `${JSON.stringify({ protocol: CONTROL_PROTOCOL, id: 1, method: "stop", params: { id: "worker" } })}\n`,
        ),
      );
      socket.on("data", (chunk: string) => (text += chunk));
      socket.once("close", () => resolve(text));
    });
    expect(JSON.parse(unsigned)).toMatchObject({
      ok: false,
      error: { code: "unauthorized" },
    });
    expect(isPidAlive(thirdWorker)).toBe(true);
    expect((await command("services", "worker-ps")).output).toContain(
      "Worker [ready]",
    );

    // Stopping the Cli stops what was started in it.
    const stopped = phRun(["services", "--stop"]);
    expect(await stopped.exited).toBe(0);
    expect(await serving.exited).not.toBeNull();
    expect(await gone(thirdWorker)).toBe(true);
    expect(readRunRecord(project, "services")).toBeUndefined();
    await expect(callControl(control, "hello")).rejects.toMatchObject({
      code: "unreachable",
    });
  }, 600_000);

  it("reaches a stack's Cli the same way", async () => {
    const serving = phRun(["service-stack"]);
    await waitFor(serving, "Serving");
    const member = readRunRecord(project, "control-upstream")?.pid;
    if (member !== undefined) reported.add(member);
    const control = controlOf("service-stack");
    expect(control.address).toContain(String(serving.child.pid));

    const start = await command("service-stack", "worker-start");
    expect(start.code).toBe(0);
    expect(start.output).toContain("Worker [ready]");
    pidIn(start.output);
    const [worker] = await workers("service-stack");
    expect(isPidAlive(worker)).toBe(true);

    // The stack's members are the running stack's, seen from beside it.
    const seen = await command("service-stack", "members");
    expect(seen.output).toContain("worker ready");
    expect(seen.output).toContain("upstream ready");

    const stop = await command("service-stack", "worker-stop");
    expect(stop.code).toBe(0);
    expect(await gone(worker)).toBe(true);
    expect((await command("service-stack", "worker-ps")).output).toContain(
      "[stopped]",
    );

    const stopped = phRun(["service-stack", "--stop"]);
    expect(await stopped.exited).toBe(0);
    expect(await serving.exited).not.toBeNull();
    expect(readRunRecord(project, "service-stack")).toBeUndefined();
    if (member !== undefined) expect(await gone(member)).toBe(true);
  }, 600_000);

  it("refuses a start in a stack that only lives for the command", async () => {
    const { code, output } = await command("service-stack", "worker-start");
    expect(code).toBe(1);
    expect(output).toContain("worker was not started");
    expect(output).toContain("`ph run service-stack`");
    expect(readRunRecord(project, "service-stack")).toBeUndefined();
  }, 300_000);
});
