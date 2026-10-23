import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawn } from "node:child_process";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { isPidAlive } from "../src/run-record.js";
import {
  spawnHost,
  SpawnHostError,
  type SpawnedHost,
  type SpawnHostOptions,
} from "../src/spawn-host.js";

const HOST_NAME = "lab-sb";

// argv: node cli.mjs run <folder> [verb]. Knobs come from the child's env.
const FAKE_CLI = `import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
const runDir = path.join(process.env.PH_USER_DATA_DIR ?? process.cwd(), ".ph", "run");
const file = path.join(runDir, "${HOST_NAME}.json");
process.on("exit", () => {
  try {
    if (JSON.parse(readFileSync(file, "utf8")).pid === process.pid) rmSync(file);
  } catch {}
});
process.on("SIGTERM", () => {
  if (!process.env.FAKE_IGNORE_TERM) process.exit(0);
});
console.log("fake ph run", process.argv.slice(2).join(" "));
if (process.env.FAKE_SPLIT_UTF8) {
  const bytes = Buffer.from([0x63, 0x61, 0x66, 0xc3, 0xa9, 0x0a]);
  process.stdout.write(bytes.subarray(0, 4));
  setTimeout(() => process.stdout.write(bytes.subarray(4)), 50);
}
if (process.env.FAKE_EXIT_EARLY) {
  console.error("fake: boom");
  process.exit(3);
}
if (existsSync(file)) {
  const other = JSON.parse(readFileSync(file, "utf8")).pid;
  try {
    process.kill(other, 0);
    console.error("${HOST_NAME} is already running for this project (pid " + other + ")");
    process.exit(1);
  } catch {}
}
if (!process.env.FAKE_NEVER_READY) {
  setTimeout(() => {
    mkdirSync(runDir, { recursive: true });
    writeFileSync(file, JSON.stringify({
      version: 2,
      host: "${HOST_NAME}",
      projectName: "spawn-lab",
      kind: "reactor",
      verb: process.argv[4] ?? "run",
      pid: process.pid,
      startedAt: new Date().toISOString(),
      outputs: { origin: "http://127.0.0.1:1", env: process.env, argv: process.argv.slice(2) },
    }));
  }, Number(process.env.FAKE_DELAY ?? 0));
}
setInterval(() => {}, 1000);
`;

const temporary: string[] = [];
const spawned: SpawnedHost[] = [];
const launchers: number[] = [];
const hostPids: number[] = [];

afterEach(async () => {
  for (const host of spawned.splice(0)) await host.stop();
  for (const pid of [...launchers.splice(0), ...hostPids.splice(0)]) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // gone
    }
  }
  for (const dir of temporary.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function tempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), prefix));
  temporary.push(dir);
  return dir;
}

function makeProject(opts: { outputsSchema?: boolean } = {}): string {
  const dir = tempDir("ph-spawn-host-");
  writeFileSync(
    path.join(dir, "package.json"),
    JSON.stringify({ name: "spawn-lab", type: "module" }),
  );
  const runnerDir = path.join(dir, "node_modules", "fake-runner");
  mkdirSync(runnerDir, { recursive: true });
  writeFileSync(
    path.join(runnerDir, "package.json"),
    JSON.stringify({ name: "fake-runner", type: "module", main: "index.js" }),
  );
  const schema = "{ safeParse: (data) => ({ success: true, data }) }";
  writeFileSync(
    path.join(runnerDir, "index.js"),
    `export const kind = "reactor";
export const hostSchema = ${schema};
${opts.outputsSchema === false ? "" : `export const outputsSchema = ${schema};`}
export async function run() {}
`,
  );
  const cliDir = path.join(dir, "node_modules", "@powerhousedao", "ph-cli");
  mkdirSync(path.join(cliDir, "dist"), { recursive: true });
  writeFileSync(
    path.join(cliDir, "package.json"),
    JSON.stringify({ name: "@powerhousedao/ph-cli", type: "module" }),
  );
  writeFileSync(path.join(cliDir, "dist", "cli.mjs"), FAKE_CLI);
  mkdirSync(path.join(dir, "hosts", "sb"), { recursive: true });
  writeFileSync(
    path.join(dir, "hosts", "sb", "host.js"),
    `export default { name: "${HOST_NAME}", runner: { module: "fake-runner" } };`,
  );
  return dir;
}

async function start(
  options: Partial<SpawnHostOptions> & { projectRoot: string },
): Promise<SpawnedHost> {
  const host = await spawnHost({
    host: "sb",
    dataDir: tempDir("ph-spawn-data-"),
    readyTimeoutMs: 10_000,
    stopTimeoutMs: 5_000,
    ...options,
  });
  spawned.push(host);
  return host;
}

async function rejection(promise: Promise<unknown>): Promise<SpawnHostError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof SpawnHostError) return error;
    throw error;
  }
  throw new Error("expected a SpawnHostError");
}

const SPAWN_HOST_SRC = fileURLToPath(
  new URL("../src/spawn-host.ts", import.meta.url),
);
const HOST_CORE_DIR = fileURLToPath(new URL("..", import.meta.url));

/** A separate launcher process (own group) that spawns the fake host. */
async function launch(
  projectRoot: string,
  dataDir: string,
  exitAfterReady: boolean,
): Promise<{ launcherPid: number; hostPid: number }> {
  const script = path.join(tempDir("ph-spawn-launcher-"), "launcher.mts");
  writeFileSync(
    script,
    `import { spawnHost } from ${JSON.stringify(pathToFileHref(SPAWN_HOST_SRC))};
const host = await spawnHost({ projectRoot: ${JSON.stringify(projectRoot)}, host: "sb", dataDir: ${JSON.stringify(dataDir)}, readyTimeoutMs: 20000 });
console.log(JSON.stringify({ hostPid: host.pid }));
${exitAfterReady ? "process.exit(0);" : "setInterval(() => {}, 1000);"}
`,
  );
  const launcher = spawn(
    process.execPath,
    ["--conditions=source", "--import", "tsx", script],
    { cwd: HOST_CORE_DIR, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  launchers.push(launcher.pid ?? -1);
  let out = "";
  let err = "";
  launcher.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    err += chunk;
  });
  const hostPid = await new Promise<number>((resolve, reject) => {
    launcher.stdout.setEncoding("utf8").on("data", (chunk: string) => {
      out += chunk;
      const line = /\{"hostPid":\d+\}/.exec(out);
      if (line) resolve((JSON.parse(line[0]) as { hostPid: number }).hostPid);
    });
    launcher.once("exit", (code) => {
      if (!/hostPid/.test(out))
        reject(new Error(`launcher exited ${code}: ${err}`));
    });
  });
  hostPids.push(hostPid);
  return { launcherPid: launcher.pid ?? -1, hostPid };
}

function pathToFileHref(file: string): string {
  return new URL(`file://${file}`).href;
}

async function waitDead(pid: number, ms = 10_000): Promise<boolean> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    if (!isPidAlive(pid)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}

const recordFile = (dataDir: string) =>
  path.join(dataDir, ".ph", "run", `${HOST_NAME}.json`);

describe("spawnHost", () => {
  it("resolves with the record's outputs and stops cleanly", async () => {
    const projectRoot = makeProject();
    const host = await start({ projectRoot, verb: "dev" });
    expect(host.record.host).toBe(HOST_NAME);
    expect(host.outputs?.origin).toBe("http://127.0.0.1:1");
    expect(host.outputs?.argv).toEqual(["run", "sb", "dev"]);
    expect(isPidAlive(host.pid)).toBe(true);

    const exit = await host.stop();
    expect(exit).toEqual({ code: 0, signal: null, forced: false });
    expect(existsSync(recordFile(host.dataDir))).toBe(false);
    await expect(host.stop()).resolves.toBe(exit);
    await expect(host.exited).resolves.toEqual(exit);
  });

  it("keeps the record under dataDir, not the project's .ph", async () => {
    const projectRoot = makeProject();
    const host = await start({ projectRoot });
    expect(existsSync(recordFile(host.dataDir))).toBe(true);
    expect(existsSync(path.join(projectRoot, ".ph"))).toBe(false);
  });

  it("gives the child a clean env plus the caller's keys", async () => {
    const projectRoot = makeProject();
    process.env.PH_SPAWN_HOST_LEAK = "leaked";
    try {
      const host = await start({ projectRoot, env: { FAKE_EXTRA: "x" } });
      const env = host.outputs?.env as Record<string, string>;
      expect(env.PH_SPAWN_HOST_LEAK).toBeUndefined();
      expect(env.VITEST).toBeUndefined();
      expect(env).toMatchObject({
        FAKE_EXTRA: "x",
        FEATURE_UNIFORM_RUNNERS_ENABLED: "1",
        PH_USER_DATA_DIR: host.dataDir,
        PH_NO_TELEMETRY: "1",
        PH_NO_DOTENV: "1",
        PATH: process.env.PATH,
      });
    } finally {
      delete process.env.PH_SPAWN_HOST_LEAK;
    }
  });

  it("refuses PH_USER_DATA_DIR in env", async () => {
    const projectRoot = makeProject();
    await expect(
      start({ projectRoot, env: { PH_USER_DATA_DIR: "/elsewhere" } }),
    ).rejects.toThrow(/dataDir/);
  });

  it("rejects with the exit code and output tail on an early exit", async () => {
    const projectRoot = makeProject();
    const error = await rejection(
      start({ projectRoot, env: { FAKE_EXIT_EARLY: "1" } }),
    );
    expect(error.phase).toBe("exited");
    expect(error.exit?.code).toBe(3);
    expect(error.outputTail).toContain("fake: boom");
  });

  it("stops the child and rejects when no record appears in time", async () => {
    const projectRoot = makeProject();
    const error = await rejection(
      start({
        projectRoot,
        readyTimeoutMs: 300,
        env: { FAKE_NEVER_READY: "1" },
      }),
    );
    expect(error.phase).toBe("timeout");
    expect(error.exit?.forced).toBe(false);
  });

  it.skipIf(process.platform === "win32")(
    "SIGKILLs a child that ignores SIGTERM and clears its record",
    async () => {
      const projectRoot = makeProject();
      const host = await start({
        projectRoot,
        stopTimeoutMs: 300,
        env: { FAKE_IGNORE_TERM: "1" },
      });
      const exit = await host.stop();
      expect(exit).toEqual({ code: null, signal: "SIGKILL", forced: true });
      expect(existsSync(recordFile(host.dataDir))).toBe(false);
    },
  );

  it("aborts before ready", async () => {
    const projectRoot = makeProject();
    const controller = new AbortController();
    const error = await rejection(
      start({
        projectRoot,
        signal: controller.signal,
        onOutput: () => controller.abort(),
        env: { FAKE_NEVER_READY: "1" },
      }),
    );
    expect(error.phase).toBe("aborted");
    expect(error.exit).toEqual({ code: 0, signal: null, forced: false });
  });

  it("stops on abort after ready", async () => {
    const projectRoot = makeProject();
    const controller = new AbortController();
    const host = await start({ projectRoot, signal: controller.signal });
    controller.abort();
    await expect(host.exited).resolves.toMatchObject({ code: 0 });
  });

  it("runs two instances side by side in separate data dirs", async () => {
    const projectRoot = makeProject();
    const [a, b] = await Promise.all([
      start({ projectRoot }),
      start({ projectRoot }),
    ]);
    expect(a.pid).not.toBe(b.pid);
    expect(a.dataDir).not.toBe(b.dataDir);
    expect(isPidAlive(a.pid) && isPidAlive(b.pid)).toBe(true);
  });

  it("surfaces ph run's lock when a data dir is already in use", async () => {
    const projectRoot = makeProject();
    const first = await start({ projectRoot });
    const error = await rejection(
      start({ projectRoot, dataDir: first.dataDir }),
    );
    expect(error.phase).toBe("exited");
    expect(error.outputTail).toContain("already running");
    const kept = JSON.parse(
      readFileSync(recordFile(first.dataDir), "utf8"),
    ) as { pid: number };
    expect(kept.pid).toBe(first.pid);
  });

  it("refuses a one-shot verb before spawning", async () => {
    const projectRoot = makeProject();
    await expect(start({ projectRoot, verb: "build" })).rejects.toThrow(
      /one-shot/,
    );
  });

  it("refuses a runner that exports no outputsSchema", async () => {
    const projectRoot = makeProject({ outputsSchema: false });
    await expect(start({ projectRoot })).rejects.toThrow(/no outputsSchema/);
  });

  it.skipIf(process.platform === "win32")(
    "a Ctrl-C of the launcher's group reaches the host",
    async () => {
      const projectRoot = makeProject();
      const { launcherPid, hostPid } = await launch(
        projectRoot,
        tempDir("ph-spawn-data-"),
        false,
      );
      process.kill(-launcherPid, "SIGINT");
      expect(await waitDead(launcherPid)).toBe(true);
      expect(await waitDead(hostPid)).toBe(true);
    },
    30_000,
  );

  it.skipIf(process.platform === "win32")(
    "a launcher that exits without stop() takes the host down",
    async () => {
      const projectRoot = makeProject();
      const dataDir = tempDir("ph-spawn-data-");
      const { hostPid } = await launch(projectRoot, dataDir, true);
      expect(await waitDead(hostPid)).toBe(true);
      expect(existsSync(recordFile(dataDir))).toBe(false);
    },
    30_000,
  );

  it("decodes a multibyte character split across chunks", async () => {
    const projectRoot = makeProject();
    let text = "";
    const host = await start({
      projectRoot,
      env: { FAKE_SPLIT_UTF8: "1", FAKE_DELAY: "200" },
      onOutput: (_stream, chunk) => {
        text += chunk;
      },
    });
    await host.stop();
    expect(text).toContain("caf\u00e9\n");
    expect(text).not.toContain("\ufffd");
  });

  it("survives an onOutput that throws", async () => {
    const projectRoot = makeProject();
    const host = await start({
      projectRoot,
      onOutput: () => {
        throw new Error("listener bug");
      },
    });
    await expect(host.stop()).resolves.toMatchObject({ code: 0 });
  });

  it("forwards output to onOutput and logFile", async () => {
    const projectRoot = makeProject();
    const logFile = path.join(tempDir("ph-spawn-log-"), "host.log");
    const chunks: string[] = [];
    const host = await start({
      projectRoot,
      logFile,
      onOutput: (_stream, chunk) => chunks.push(chunk),
    });
    await host.stop();
    expect(chunks.join("")).toContain("fake ph run run sb");
    expect(readFileSync(logFile, "utf8")).toContain("fake ph run run sb");
  });
});
