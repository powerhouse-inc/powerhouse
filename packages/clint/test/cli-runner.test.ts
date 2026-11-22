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
import { fileURLToPath, pathToFileURL } from "node:url";
import { readRunRecord } from "@powerhousedao/host-core";
import { packageJsonExports } from "@powerhousedao/shared/clis/constants";
import type * as SwitchboardServer from "@powerhousedao/switchboard/server";
import type { ILogger } from "document-model";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMemoryWorkdirStore } from "../src/core/store.js";
import { attachDefaultReactor } from "../src/integrations/powerhouse/index.js";

// The Cli runner end to end: a real switchboard in this process, and the real
// `ph-run run <host>` in a child per case, with real stdio, against a project
// whose hosts name the built runner and the fixture Clis.

const here = path.dirname(fileURLToPath(import.meta.url));
const CLINT_ROOT = path.resolve(here, "..");
const FIXTURES = path.join(here, "fixtures", "cli-runner");
const PH_RUN = path.resolve(CLINT_ROOT, "../../clis/ph-run/dist/cli.mjs");
const RUNNER = path.join(CLINT_ROOT, "dist", "runners", "cli-runner.mjs");
const DRIVE_TYPE = "powerhouse/document-drive";

function quietLogger(): ILogger {
  const noop = () => undefined;
  const logger = {
    level: "error",
    verbose: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    errorHandler: noop,
    child: () => logger,
  };
  return logger as unknown as ILogger;
}

const stripAnsi = (text: string) =>
  text
    .replace(/\x1b\][^\x07]*\x07/g, "")
    .replace(/\x1b\[[0-9;?<>=]*[A-Za-z~]/g, "")
    .replace(/\x1b[=>78]/g, "");

function link(target: string, at: string) {
  mkdirSync(path.dirname(at), { recursive: true });
  symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir");
}

/** A fixture Cli as a module: its file and the commands it imports. */
function writeCli(dir: string, file: string, fixture: string) {
  mkdirSync(dir, { recursive: true });
  copyFileSync(path.join(FIXTURES, fixture), path.join(dir, file));
  copyFileSync(
    path.join(FIXTURES, "commands.mjs"),
    path.join(dir, "commands.mjs"),
  );
}

function hostFile(name: string, url: string, config?: object): string {
  const host = {
    name,
    runner: { module: "@powerhousedao/clint/cli-runner" },
    ...(config ? { config } : {}),
    reactor: {
      backends: { switchboard: { kind: "remote", remote: { url } } },
    },
  };
  return `export default ${JSON.stringify(host, null, 2)};\n`;
}

/**
 * The project: its own `./cli` (the plain fixture, reached by self-reference)
 * and two fixture packages; clint and zod linked the way pnpm would.
 */
function makeProject(url: string): string {
  const root = mkdtempSync(path.join(tmpdir(), "ph-cli-runner-"));
  writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "cli-lab",
      private: true,
      type: "module",
      exports: { "./cli": packageJsonExports["./cli"] },
    }),
  );
  writeCli(
    path.join(root, path.dirname(packageJsonExports["./cli"].node)),
    path.basename(packageJsonExports["./cli"].node),
    "plain-cli.mjs",
  );
  const modules = path.join(root, "node_modules");
  link(CLINT_ROOT, path.join(modules, "@powerhousedao", "clint"));
  link(
    realpathSync(path.join(CLINT_ROOT, "node_modules", "zod")),
    path.join(modules, "zod"),
  );
  for (const [name, fixture] of [
    ["embedded-cli", "embedded-cli.mjs"],
    ["serving-cli", "serving-cli.mjs"],
    ["function-remote-cli", "function-remote-cli.mjs"],
  ] as const) {
    const dir = path.join(modules, "@fixture", name);
    writeCli(dir, "cli.mjs", fixture);
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({
        name: `@fixture/${name}`,
        type: "module",
        exports: { "./cli": { node: "./cli.mjs" } },
      }),
    );
  }
  const hosts: [string, object | undefined][] = [
    ["cli", undefined],
    ["embedded", { package: "@fixture/embedded-cli" }],
    ["serving", { package: "@fixture/serving-cli" }],
    ["function-remote", { package: "@fixture/function-remote-cli" }],
  ];
  for (const [name, config] of hosts) {
    mkdirSync(path.join(root, "hosts", name), { recursive: true });
    writeFileSync(
      path.join(root, "hosts", name, "host.js"),
      hostFile(name, url, config),
    );
  }
  // A package that supplies a host of the same name over its own `./cli`
  // (no config.package: the package's own, not the project's).
  const pack = path.join(modules, "@fixture", "tool-pack");
  writeCli(pack, "cli.mjs", "serving-cli.mjs");
  writeFileSync(
    path.join(pack, "package.json"),
    JSON.stringify({
      name: "@fixture/tool-pack",
      type: "module",
      exports: { "./cli": { node: "./cli.mjs" } },
    }),
  );
  mkdirSync(path.join(pack, "hosts", "serving"), { recursive: true });
  writeFileSync(
    path.join(pack, "hosts", "serving", "host.js"),
    hostFile("serving", url),
  );
  return root;
}

interface Run {
  child: ChildProcess;
  /** stdout and stderr so far, without terminal escapes. */
  output(): string;
  exited: Promise<number | null>;
}

const started: ChildProcess[] = [];

function killTree(pid: number) {
  if (process.platform === "win32") {
    spawnSync("taskkill", ["/PID", String(pid), "/T", "/F"], {
      windowsHide: true,
    });
  } else {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // already gone
    }
  }
}

async function freePort(): Promise<number> {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as net.AddressInfo;
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

/** Whether anything accepts connections on `port`. */
function listening(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect(port, "127.0.0.1");
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

describe("cli-runner", () => {
  let switchboard: SwitchboardServer.SwitchboardReactor;
  let root: string;
  let project: string;
  let url: string;
  let labId: string;
  let documentId: string;
  const env: Record<string, string> = {};

  function phRun(
    args: string[],
    options: { env?: Record<string, string>; preload?: string } = {},
  ): Run {
    const child = spawn(
      process.execPath,
      [
        ...(options.preload
          ? ["--import", pathToFileURL(options.preload).href]
          : []),
        PH_RUN,
        "run",
        ...args,
      ],
      {
        cwd: project,
        env: { ...env, ...options.env },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    started.push(child);
    let text = "";
    child.stdout?.on("data", (chunk: Buffer) => (text += chunk.toString()));
    child.stderr?.on("data", (chunk: Buffer) => (text += chunk.toString()));
    // A child that is gone takes its pipe with it.
    child.stdin?.on("error", () => undefined);
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    return { child, output: () => stripAnsi(text), exited };
  }

  async function waitFor(run: Run, expected: string, timeoutMs = 60_000) {
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

  async function exitCodeOf(run: Run, timeoutMs = 60_000) {
    const timeout = sleep(timeoutMs).then(() => {
      throw new Error(`still running after ${timeoutMs} ms:\n${run.output()}`);
    });
    return Promise.race([run.exited, timeout]);
  }

  beforeAll(async () => {
    for (const [file, what] of [
      [RUNNER, "@powerhousedao/clint"],
      [PH_RUN, "@powerhousedao/ph-run"],
    ]) {
      if (!existsSync(file)) {
        throw new Error(`Build ${what} first: ${file} is missing.`);
      }
    }
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) env[key] = value;
    }
    // Ink renders only its last frame in CI; the shell test reads frames.
    env.CI = "false";
    delete env.PH_STOP_ON_STDIN;

    root = mkdtempSync(path.join(tmpdir(), "ph-cli-runner-sb-"));
    const { startSwitchboard } =
      await import("@powerhousedao/switchboard/server");
    switchboard = await startSwitchboard(
      {
        server: { port: 0, host: "127.0.0.1" },
        storage: { inMemory: true, userDataDir: path.join(root, "user") },
        features: { workflows: false, mcp: false },
        packages: { disableLocal: true },
        identity: { keypairPath: path.join(root, "identity.json") },
        drive: { slug: "lab", global: { name: "Lab" } },
      },
      {
        logger: quietLogger(),
        signalHandlers: false,
        fatalErrorShutdown: false,
      },
    );
    url = `http://127.0.0.1:${switchboard.port}/d/lab`;
    const drives = await switchboard.reactor.find({ type: DRIVE_TYPE });
    const lab = drives.results.find((drive) => drive.header.slug === "lab");
    if (!lab) throw new Error("the switchboard made no drive lab");
    labId = lab.header.id;
    documentId = (
      await switchboard.reactor.createEmpty("powerhouse/document-model")
    ).header.id;
    project = makeProject(url);
  }, 180_000);

  afterAll(async () => {
    const survivors = started.filter(
      (child) => child.exitCode === null && child.signalCode === null,
    );
    for (const child of survivors) if (child.pid) killTree(child.pid);
    await switchboard?.shutdown();
    if (project) {
      rmSync(project, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 300,
      });
    }
    if (root) rmSync(root, { recursive: true, force: true, maxRetries: 10 });
    expect(survivors.map((child) => child.pid)).toEqual([]);
  }, 60_000);

  it("runs a one-shot command, prints and exits with the command's code", async () => {
    const hello = phRun(["cli", "--", "hello", "--name", "Ada"]);
    expect(await exitCodeOf(hello)).toBe(0);
    expect(hello.output()).toContain("Hello, Ada!");

    // `run` spelled out: what follows the verb is the Cli's too.
    const failing = phRun(["cli", "run", "fail"]);
    expect(await exitCodeOf(failing)).toBe(1);
    expect(failing.output()).toContain("intentional failure");

    // A one-shot leaves no run record behind.
    expect(readRunRecord(project, "cli")).toBeUndefined();
  }, 120_000);

  it("reads a document through the remote switchboard, on the drive the address names", async () => {
    const read = phRun(["cli", "--", "read-doc", documentId]);
    expect(await exitCodeOf(read)).toBe(0);
    expect(read.output()).toContain(
      `read ${documentId} powerhouse/document-model (drive ${labId})`,
    );
  }, 120_000);

  it("answers over stdin in the streaming mode, and records the run while it is open", async () => {
    const shell = phRun(["cli", "--", "-i"]);
    await waitFor(shell, `Reactor ready (drive: ${labId})`);
    expect(shell.output()).toContain("fixture-cli shell");
    expect(readRunRecord(project, "cli")?.pid).toBe(shell.child.pid);

    shell.child.stdin?.write("/hello --name Bo\n");
    await waitFor(shell, "Hello, Bo!");
    shell.child.stdin?.write(`/read-doc ${documentId}\n`);
    await waitFor(shell, `read ${documentId} powerhouse/document-model`);
    shell.child.stdin?.write("/exit\n");

    expect(await exitCodeOf(shell)).toBe(0);
    expect(readRunRecord(project, "cli")).toBeUndefined();
  }, 120_000);

  it("opens the ink shell when stdin is a terminal", async () => {
    // No pseudo-terminal on Windows: the child marks its piped stdin as one.
    const shell = phRun(["cli", "--", "-i"], {
      preload: path.join(FIXTURES, "fake-tty.mjs"),
    });
    await waitFor(shell, "fixture-cli shell");
    await waitFor(shell, `Reactor ready (drive: ${labId})`);
    // Ctrl+C, as the shell reads it in raw mode.
    shell.child.stdin?.write("\x03");

    expect(await exitCodeOf(shell)).toBe(0);
    expect(readRunRecord(project, "cli")).toBeUndefined();
  }, 120_000);

  it("starts none of the embedded reactor, switchboard or Connect the Cli configured, and ensures its drive on the remote", async () => {
    const ports = {
      FIXTURE_SWITCHBOARD_PORT: String(await freePort()),
      FIXTURE_CONNECT_PORT: String(await freePort()),
    };
    const shell = phRun(["embedded", "--", "-i"], { env: ports });
    await waitFor(shell, "Reactor ready (drive: ");
    const drives = await switchboard.reactor.find({ type: DRIVE_TYPE });
    const notes = drives.results.find((drive) => drive.header.name === "Notes");
    expect(notes).toBeDefined();
    expect(shell.output()).toContain(
      `Reactor ready (drive: ${notes?.header.id})`,
    );
    for (const port of Object.values(ports)) {
      expect(await listening(Number(port))).toBe(false);
    }
    shell.child.stdin?.write(`/read-doc ${documentId}\n`);
    await waitFor(shell, `read ${documentId} powerhouse/document-model`);
    shell.child.stdin?.write("/exit\n");
    expect(await exitCodeOf(shell)).toBe(0);

    const output = shell.output();
    expect(output).not.toContain("embedded reactor created");
    expect(output).not.toMatch(/Switchboard '.*' ready/);
    expect(output).not.toMatch(/Connect '.*' (ready|already running)/);

    // Nor do the embedded parts' switches exist for the run.
    const help = phRun(["embedded", "--", "--help"], { env: ports });
    expect(await exitCodeOf(help)).toBe(0);
    expect(help.output()).toContain("hello");
    expect(help.output()).not.toContain("--no-api");
    expect(help.output()).not.toContain("--no-studio");
  }, 120_000);

  it("builds a remote config given as a function from the setup context", async () => {
    const read = phRun(["function-remote", "--", "read-doc", documentId]);
    expect(await exitCodeOf(read)).toBe(0);
    const drives = await switchboard.reactor.find({ type: DRIVE_TYPE });
    const desk = drives.results.find(
      (drive) => drive.header.name === `Desk ${path.basename(project)}`,
    );
    expect(desk).toBeDefined();
    expect(read.output()).toContain(
      `read ${documentId} powerhouse/document-model (drive ${desk?.header.id})`,
    );
  }, 120_000);

  it("keeps one serving instance, which `--stop` ends, and runs one-shots beside it", async () => {
    const serving = phRun(["serving"]);
    await waitFor(serving, "Serving");
    expect(readRunRecord(project, "serving")?.pid).toBe(serving.child.pid);

    const beside = phRun(["serving", "--", "hello", "--name", "Ada"]);
    expect(await exitCodeOf(beside)).toBe(0);
    expect(beside.output()).toContain("Hello, Ada!");

    const second = phRun(["serving"]);
    expect(await exitCodeOf(second)).toBe(1);
    expect(second.output()).toContain(
      `serving is already running for this project (pid ${serving.child.pid})`,
    );

    const stop = phRun(["serving", "--stop"]);
    expect(await exitCodeOf(stop)).toBe(0);
    expect(stop.output()).toContain(
      `Stopped serving (pid ${serving.child.pid})`,
    );
    expect(await exitCodeOf(serving)).toBe(0);
    expect(readRunRecord(project, "serving")).toBeUndefined();
  }, 120_000);

  it("runs a package's cli host over the package's own Cli, recorded behind the package", async () => {
    // Without config.package the project's own (plain, one-shot) Cli would
    // end at once: serving shows the package's was loaded.
    const serving = phRun(["@fixture/tool-pack/serving"]);
    await waitFor(serving, "Serving");
    expect(readRunRecord(project, "@fixture/tool-pack/serving")).toMatchObject({
      host: "serving",
      package: "@fixture/tool-pack",
      pid: serving.child.pid,
    });
    expect(readRunRecord(project, "serving")).toBeUndefined();

    const second = phRun(["@fixture/tool-pack/serving"]);
    expect(await exitCodeOf(second)).toBe(1);
    expect(second.output()).toContain(
      `@fixture/tool-pack/serving is already running for this project (pid ${serving.child.pid})`,
    );

    const stop = phRun(["@fixture/tool-pack/serving", "--stop"]);
    expect(await exitCodeOf(stop)).toBe(0);
    expect(stop.output()).toContain(
      `Stopped @fixture/tool-pack/serving (pid ${serving.child.pid})`,
    );
    expect(await exitCodeOf(serving)).toBe(0);
    expect(
      readRunRecord(project, "@fixture/tool-pack/serving"),
    ).toBeUndefined();
  }, 120_000);

  describe("with PH_STOP_ON_STDIN set", () => {
    const supervised = { PH_STOP_ON_STDIN: "1" };

    it("refuses the shell, so stdin never becomes chat input", async () => {
      const shell = phRun(["cli", "--", "-i"], { env: supervised });
      expect(await exitCodeOf(shell)).toBe(1);
      expect(shell.output()).toContain("PH_STOP_ON_STDIN=1");
      expect(shell.output()).not.toContain("fixture-cli shell");
    }, 120_000);

    it("stops a serving Cli cleanly when stdin closes", async () => {
      const serving = phRun(["serving"], { env: supervised });
      await waitFor(serving, "Serving");
      serving.child.stdin?.end();

      expect(await exitCodeOf(serving, 30_000)).toBe(0);
      expect(readRunRecord(project, "serving")).toBeUndefined();
    }, 120_000);

    it("holds a stop asked while the Cli starts until it serves, well inside the limit", async () => {
      const serving = phRun(["serving"], { env: supervised });
      serving.child.stdin?.end();

      // The limit would end it with 143 after 15 s.
      expect(await exitCodeOf(serving, 12_000)).toBe(0);
      expect(serving.output()).toContain("Serving");
      expect(readRunRecord(project, "serving")).toBeUndefined();
    }, 120_000);

    it("takes a line on stdin as a stop request, not as a command", async () => {
      const serving = phRun(["serving"], { env: supervised });
      await waitFor(serving, "Serving");
      serving.child.stdin?.write("/hello --name Zed\n");

      expect(await exitCodeOf(serving, 30_000)).toBe(0);
      expect(serving.output()).not.toContain("Hello, Zed!");
      expect(readRunRecord(project, "serving")).toBeUndefined();
    }, 120_000);
  });

  describe("attachDefaultReactor", () => {
    const setup = () => ({
      workdir: root,
      config: {},
      workspace: createMemoryWorkdirStore(),
    });

    it("attaches with no _module, on the drive the address names, and releases once", async () => {
      const reactor = await attachDefaultReactor(setup(), { url });
      expect(reactor._module).toBeUndefined();
      expect(reactor.driveId).toBe(labId);
      expect(reactor.driveUrl).toBe(url);
      expect(reactor.switchboardUrl).toBe(
        `http://127.0.0.1:${switchboard.port}/graphql`,
      );
      expect(reactor.writes?.ready()).toBe(true);
      const document = await reactor.client.get(documentId);
      expect(document.header.documentType).toBe("powerhouse/document-model");
      await reactor.shutdown();
      await reactor.shutdown();
    }, 60_000);

    it("finds or creates the drives the Cli asks for, through the client", async () => {
      const first = await attachDefaultReactor(setup(), {
        url,
        drives: [{ name: "Inbox", role: "personal" }],
      });
      const again = await attachDefaultReactor(setup(), {
        url,
        drive: { name: "Inbox" },
      });
      expect(first.personalDriveId).toBeTruthy();
      expect(first.driveId).toBe(first.personalDriveId);
      expect(again.driveId).toBe(first.driveId);
      expect(first.drives).toEqual([
        { id: first.driveId, name: "Inbox", role: "personal" },
      ]);
      await first.shutdown();
      await again.shutdown();
    }, 60_000);

    it("refuses an address whose drive the switchboard does not serve", async () => {
      await expect(
        attachDefaultReactor(setup(), {
          url: `http://127.0.0.1:${switchboard.port}/d/nowhere`,
        }),
      ).rejects.toThrow(/serves no drive "nowhere"/);
    }, 60_000);
  });
});
