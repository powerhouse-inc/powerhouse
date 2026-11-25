import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  copyFileSync,
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
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { isPidAlive, readRunRecord } from "@powerhousedao/host-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A6 end to end: a generic compound of a real switchboard and a Cli, run by
// the real `ph-run run <stack>`. The switchboard runs in its own process
// (`ph run switchboard`, started by the compound) and the Cli in front, in
// the compound's process. Every process started here is gone at the end.

const here = path.dirname(fileURLToPath(import.meta.url));
const CLINT_ROOT = path.resolve(here, "..");
const REPO = path.resolve(CLINT_ROOT, "../..");
const FIXTURES = path.join(here, "fixtures", "cli-runner");
const PH_RUN_ROOT = path.join(REPO, "clis", "ph-run");
const HOST_CORE_ROOT = path.join(REPO, "packages", "host-core");
const PH_RUN = path.join(PH_RUN_ROOT, "dist", "cli.mjs");
const SWITCHBOARD = "stack-switchboard";

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

/** The project: a switchboard host, two cli hosts on its `lab` drive (a
 * plain Cli and one that serves its routine), and a stack of each. */
function makeProject(): string {
  const root = mkdtempSync(path.join(tmpdir(), "ph-cli-stack-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "stack-lab", private: true, type: "module" }),
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
  for (const [name, fixture] of [
    ["plain-cli", "plain-cli.mjs"],
    ["serving-cli", "serving-cli.mjs"],
  ] as const) {
    const dir = path.join(modules, "@fixture", name);
    mkdirSync(dir, { recursive: true });
    copyFileSync(path.join(FIXTURES, fixture), path.join(dir, "cli.mjs"));
    copyFileSync(
      path.join(FIXTURES, "commands.mjs"),
      path.join(dir, "commands.mjs"),
    );
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: `@fixture/${name}`,
        type: "module",
        exports: { "./cli": { node: "./cli.mjs" } },
      }),
    );
  }
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
  writeHost(root, "switchboard", {
    name: SWITCHBOARD,
    runner: { module: "@powerhousedao/ph-run/runners/switchboard", port: 0 },
    reactor: {
      backends: {
        main: {
          kind: "in-process",
          storage: { kind: "path", dataDir: "${userData}/.ph/reactor-storage" },
        },
      },
      drives: [{ slug: "lab", name: "Lab" }],
    },
    config: {
      switchboard: {
        packages: { disableLocal: true },
        features: { workflows: false },
      },
    },
  });
  const lab = {
    $output: { host: "switchboard", path: ["drives", "lab", "url"] },
  };
  for (const [folder, pkg] of [
    ["cli", "@fixture/plain-cli"],
    ["serving-cli", "@fixture/serving-cli"],
  ] as const) {
    writeHost(root, folder, {
      name: folder,
      runner: { module: "@powerhousedao/clint/cli-runner" },
      config: { package: pkg },
      reactor: {
        backends: { switchboard: { kind: "remote", remote: { url: lab } } },
      },
    });
  }
  for (const [folder, cli] of [
    ["stack", "cli"],
    ["serving-stack", "serving-cli"],
  ] as const) {
    writeHost(root, folder, {
      name: folder,
      runner: { module: "@powerhousedao/host-core/runners/compound" },
      children: { switchboard: { host: "switchboard" }, cli: { host: cli } },
    });
  }
  // The proxy under a generic compound (A7): routes from a sibling's output.
  writeHost(root, "upstream", {
    name: "stack-upstream",
    runner: { module: "@fixture/upstream/runner" },
  });
  writeHost(root, "proxy", {
    name: "stack-proxy",
    runner: { module: "@powerhousedao/clint/proxy-runner", port: 0 },
    config: {
      routes: {
        "/up": {
          upstream: {
            $output: { host: "upstream", path: ["origin"] },
          },
        },
      },
    },
  });
  writeHost(root, "proxy-cli", {
    name: "proxy-cli",
    runner: { module: "@powerhousedao/clint/cli-runner" },
    config: { package: "@fixture/plain-cli" },
  });
  writeHost(root, "proxy-stack", {
    name: "proxy-stack",
    runner: { module: "@powerhousedao/host-core/runners/compound" },
    children: {
      upstream: { host: "upstream" },
      proxy: { host: "proxy" },
      cli: { host: "proxy-cli" },
    },
  });
  return root;
}

interface Run {
  child: ChildProcess;
  output(): string;
  exited: Promise<number | null>;
}

describe("a stack of a switchboard and a Cli", () => {
  let project: string;
  const started: ChildProcess[] = [];
  /** The switchboard processes the stacks started, read from its record. */
  const switchboards = new Set<number>();
  const env: Record<string, string> = {};

  function phRun(args: string[], extra: Record<string, string> = {}): Run {
    const child = spawn(process.execPath, [PH_RUN, "run", ...args], {
      cwd: project,
      env: { ...env, ...extra },
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

  /** The running switchboard's pid, remembered for the survivor check. */
  function switchboardPid(): number | undefined {
    const pid = readRunRecord(project, SWITCHBOARD)?.pid;
    if (pid !== undefined) switchboards.add(pid);
    return pid;
  }

  async function waitFor(run: Run, expected: string, timeoutMs = 180_000) {
    const deadline = Date.now() + timeoutMs;
    while (!run.output().includes(expected)) {
      switchboardPid();
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

  async function exitCodeOf(run: Run, timeoutMs = 120_000) {
    const deadline = Date.now() + timeoutMs;
    while (run.child.exitCode === null && run.child.signalCode === null) {
      switchboardPid();
      if (Date.now() > deadline) {
        throw new Error(
          `still running after ${timeoutMs} ms:\n${run.output()}`,
        );
      }
      await sleep(100);
    }
    return run.exited;
  }

  const logRuns = () => {
    const dir = path.join(project, ".ph", "services", "switchboard");
    return existsSync(dir) ? readdirSync(dir) : [];
  };

  beforeAll(() => {
    for (const [file, what] of [
      [path.join(CLINT_ROOT, "dist", "runners", "cli-runner.mjs"), "clint"],
      [PH_RUN, "ph-run"],
      [
        path.join(HOST_CORE_ROOT, "dist", "runners", "compound.mjs"),
        "host-core",
      ],
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
    project = makeProject();
  });

  afterAll(() => {
    const alive = [
      ...started
        .filter((child) => child.exitCode === null && child.signalCode === null)
        .flatMap((child) => (child.pid ? [child.pid] : [])),
      ...[...switchboards].filter((pid) => isPidAlive(pid)),
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
    rmSync(project, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 300,
    });
    expect(alive).toEqual([]);
  }, 60_000);

  it("runs the switchboard in its own process and the Cli in front, which sees it, and stops both when the shell exits", async () => {
    const shell = phRun(["stack", "--", "-i"]);
    await waitFor(shell, "Reactor ready (drive: ");

    const stack = readRunRecord(project, "stack");
    const switchboard = readRunRecord(project, SWITCHBOARD);
    expect(stack?.pid).toBe(shell.child.pid);
    expect(switchboard?.pid).toBeDefined();
    expect(switchboard?.pid).not.toBe(shell.child.pid);
    const url = (
      switchboard?.outputs as { drives: { lab: { url: string } } } | undefined
    )?.drives.lab.url;
    expect(url).toMatch(/^http:\/\/localhost:\d+\/d\/lab$/);
    expect(stack?.members?.switchboard.outputs).toEqual(switchboard?.outputs);
    // Its output went to this run's log file, not into the shell.
    expect(logRuns()).toHaveLength(1);
    expect(shell.output()).not.toContain("Switchboard");

    shell.child.stdin?.write("/members\n");
    await waitFor(shell, `switchboard ready`);
    expect(shell.output()).toContain(`drives.lab.url=${url}`);
    shell.child.stdin?.write("/hello --name Bo\n");
    await waitFor(shell, "Hello, Bo!");
    shell.child.stdin?.write("/exit\n");

    expect(await exitCodeOf(shell)).toBe(0);
    expect(isPidAlive(switchboard!.pid)).toBe(false);
    expect(readRunRecord(project, SWITCHBOARD)).toBeUndefined();
    expect(readRunRecord(project, "stack")).toBeUndefined();
  }, 300_000);

  it("runs a command beside a running stack without starting a second one, and `--stop` stops the stack", async () => {
    const serving = phRun(["serving-stack"]);
    await waitFor(serving, "Serving");
    const pid = switchboardPid();
    const runs = logRuns();

    const hello = phRun(["serving-stack", "--", "hello", "--name", "Ada"]);
    expect(await exitCodeOf(hello)).toBe(0);
    expect(hello.output()).toContain("Hello, Ada!");
    // the same switchboard; no second one was started
    expect(switchboardPid()).toBe(pid);
    expect(logRuns()).toEqual(runs);

    // Beside it a command must end; and a bare word is no compound verb.
    const shell = phRun(["serving-stack", "--", "-i"]);
    expect(await exitCodeOf(shell)).toBe(1);
    expect(shell.output()).toContain("serving-stack is already running");
    const bare = phRun(["serving-stack", "hello"]);
    expect(await exitCodeOf(bare)).toBe(1);
    expect(bare.output()).toContain('does not support the verb "hello"');
    // A second start is the running stack: shown, and nothing starts.
    const second = phRun(["serving-stack"]);
    expect(await exitCodeOf(second)).toBe(0);
    expect(second.output()).toContain("serving-stack is already running");
    expect(second.output()).toContain("Nothing was started.");
    expect(switchboardPid()).toBe(pid);
    expect(logRuns()).toEqual(runs);

    const stop = phRun(["serving-stack", "--stop"]);
    expect(await exitCodeOf(stop)).toBe(0);
    expect(stop.output()).toContain(
      `Stopped serving-stack (pid ${serving.child.pid})`,
    );
    expect(await exitCodeOf(serving)).not.toBeNull();
    expect(isPidAlive(pid!)).toBe(false);
    expect(readRunRecord(project, SWITCHBOARD)).toBeUndefined();
    expect(readRunRecord(project, "serving-stack")).toBeUndefined();
  }, 300_000);

  it("starts the stack for a one-shot when none runs, and stops it when the command ends", async () => {
    const hello = phRun(["stack", "--", "hello", "--name", "Cy"]);
    expect(await exitCodeOf(hello)).toBe(0);
    expect(hello.output()).toContain("Hello, Cy!");
    expect(readRunRecord(project, SWITCHBOARD)).toBeUndefined();
    expect(readRunRecord(project, "stack")).toBeUndefined();
  }, 300_000);

  it("runs the proxy as a member, routed to a sibling's output, and stops it with the stack", async () => {
    const shell = phRun(["proxy-stack", "--", "-i"]);
    await waitFor(shell, "fixture-cli shell");

    const upstream = readRunRecord(project, "stack-upstream");
    const proxy = readRunRecord(project, "stack-proxy");
    expect(upstream?.pid).toBeDefined();
    expect(proxy?.pid).toBeDefined();
    for (const pid of [upstream!.pid, proxy!.pid]) switchboards.add(pid);
    expect(proxy?.pid).not.toBe(shell.child.pid);
    const url = (proxy?.outputs as { url: string } | undefined)?.url;
    expect(url).toMatch(/^http:\/\/[^/]+:\d+$/);

    // The route reaches the member it was taken from, through the proxy.
    const answer = await fetch(`${url}/up/hello`);
    expect(answer.status).toBe(200);
    expect(await answer.text()).toBe("stack-upstream saw /hello");

    // The Cli sees the proxy's address like any member's.
    shell.child.stdin?.write("/members\n");
    await waitFor(shell, "proxy ready url=");
    expect(shell.output()).toContain(`url=${url}`);
    shell.child.stdin?.write("/exit\n");

    expect(await exitCodeOf(shell)).toBe(0);
    expect(isPidAlive(proxy!.pid)).toBe(false);
    expect(isPidAlive(upstream!.pid)).toBe(false);
    expect(readRunRecord(project, "stack-proxy")).toBeUndefined();
    expect(readRunRecord(project, "stack-upstream")).toBeUndefined();
    expect(readRunRecord(project, "proxy-stack")).toBeUndefined();
    await expect(fetch(`${url}/up/hello`)).rejects.toThrow();
  }, 300_000);

  describe("when supervised (PH_STOP_ON_STDIN)", () => {
    const supervised = { PH_STOP_ON_STDIN: "1" };

    it("stops the whole stack when its stdin ends", async () => {
      const serving = phRun(["serving-stack"], supervised);
      await waitFor(serving, "Serving");
      const pid = switchboardPid();
      serving.child.stdin?.end();
      expect(await exitCodeOf(serving, 60_000)).toBe(143);
      expect(isPidAlive(pid!)).toBe(false);
      expect(readRunRecord(project, SWITCHBOARD)).toBeUndefined();
      expect(readRunRecord(project, "serving-stack")).toBeUndefined();
    }, 300_000);

    it("refuses the shell, so stdin is never both the stop and the input, and stops what it started", async () => {
      const shell = phRun(["stack", "--", "-i"], supervised);
      expect(await exitCodeOf(shell)).toBe(1);
      expect(shell.output()).toContain(
        "holds its stdin to ask it to stop (PH_STOP_ON_STDIN=1)",
      );
      expect(shell.output()).not.toContain("fixture-cli shell");
      expect(readRunRecord(project, SWITCHBOARD)).toBeUndefined();
      for (const pid of switchboards) expect(isPidAlive(pid)).toBe(false);
    }, 300_000);
  });
});
