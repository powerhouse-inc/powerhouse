import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { killTree } from "@powerhousedao/host-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `ph-run run supervisor`, the built entry: the supervisor of the user in the
// foreground, and the commands a second terminal asks it with. Its folder is
// a temp one, never the user's own.

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PH_RUN_ROOT = path.resolve(HERE, "..");
const PH_RUN = path.join(PH_RUN_ROOT, "dist", "cli.mjs");

/** Serves nothing: it records its pid, and its stop writes a marker. */
const RUNNER = `import fs from "node:fs";
export const kind = "reactor";
export const verbs = ["run", "dev"];
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const outputsSchema = { safeParse: (data) => ({ success: true, data }) };
export async function dev(host) {
  fs.writeFileSync(host.config.pidFile, String(process.pid));
  const keep = setInterval(() => {}, 1000);
  const shutdown = async () => {
    clearInterval(keep);
    fs.writeFileSync(host.config.marker, "stopped through its stop");
  };
  process.once("SIGTERM", () => void shutdown().then(() => process.exit(0)));
  return { outputs: { origin: "http://127.0.0.1:1" }, ready: Promise.resolve(), shutdown };
}
export const run = dev;
`;

function write(file: string, source: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function until(
  what: () => boolean,
  timeoutMs = 60_000,
): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (what()) return true;
    await sleep(100);
  }
  return what();
}

describe("ph-run run supervisor", () => {
  let tmp: string;
  let project: string;
  let home: string;
  const children: ChildProcess[] = [];

  const env = (): NodeJS.ProcessEnv => {
    const base: NodeJS.ProcessEnv = { ...process.env, PH_NO_TELEMETRY: "1" };
    delete base.PH_STOP_ON_STDIN;
    delete base.PH_COMPOUND_MEMBER;
    delete base.PH_USER_DATA_DIR;
    return { ...base, PH_SUPERVISOR_HOME: home };
  };
  const pidOf = (host: string) =>
    Number(readFileSync(path.join(tmp, `${host}.pid`), "utf8"));

  /** One command of a second terminal, run to its end. */
  function ask(...args: string[]) {
    const result = spawnSync(
      process.execPath,
      [PH_RUN, "run", "supervisor", ...args],
      { cwd: tmp, env: env(), encoding: "utf8", windowsHide: true },
    );
    return { code: result.status, out: result.stdout + result.stderr };
  }

  /** A command that keeps running; its output so far in `out`. */
  function keep(args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
    const child = spawn(
      process.execPath,
      [PH_RUN, "run", "supervisor", ...args],
      {
        cwd: tmp,
        env: { ...env(), ...extraEnv },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );
    children.push(child);
    const seen = { out: "", code: undefined as number | null | undefined };
    child.stdout.on("data", (chunk: Buffer) => (seen.out += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (seen.out += chunk.toString()));
    child.on("exit", (code) => (seen.code = code));
    return { child, seen };
  }

  beforeAll(() => {
    tmp = mkdtempSync(path.join(tmpdir(), "ph-run-supervisor-"));
    project = path.join(tmp, "project");
    home = path.join(tmp, "home");
    write(
      path.join(project, "package.json"),
      JSON.stringify({ name: "supervised-lab", private: true, type: "module" }),
    );
    write(path.join(project, "powerhouse.config.json"), "{}");
    const modules = path.join(project, "node_modules");
    mkdirSync(path.join(modules, "@powerhousedao"), { recursive: true });
    symlinkSync(
      PH_RUN_ROOT,
      path.join(modules, "@powerhousedao", "ph-run"),
      process.platform === "win32" ? "junction" : "dir",
    );
    write(path.join(modules, "@fixture", "kept", "runner.mjs"), RUNNER);
    write(
      path.join(modules, "@fixture", "kept", "package.json"),
      JSON.stringify({
        name: "@fixture/kept",
        type: "module",
        exports: { "./runner": "./runner.mjs" },
      }),
    );
    for (const host of ["web", "api"]) {
      write(
        path.join(project, "hosts", host, "host.js"),
        `export default ${JSON.stringify({
          name: host,
          runner: { module: "@fixture/kept/runner" },
          config: {
            pidFile: path.join(tmp, `${host}.pid`),
            marker: path.join(tmp, `${host}.stopped`),
          },
        })};\n`,
      );
    }
  });

  afterAll(async () => {
    const left: number[] = [];
    for (const host of ["web", "api"]) {
      if (!existsSync(path.join(tmp, `${host}.pid`))) continue;
      if (isAlive(pidOf(host))) left.push(pidOf(host));
    }
    for (const child of children) {
      if (child.pid && child.exitCode === null && isAlive(child.pid)) {
        left.push(child.pid);
      }
    }
    for (const pid of left) killTree(pid, "SIGKILL");
    await sleep(left.length > 0 ? 1_000 : 0);
    rmSync(tmp, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
    expect(left).toEqual([]);
  });

  it("says that none runs", () => {
    const ps = ask("ps");
    expect(ps.code).toBe(1);
    expect(ps.out).toContain("No supervisor runs for this user.");
    expect(ask("--stop").out).toContain("No supervisor runs for this user.");
    expect(existsSync(path.join(home, "supervisor.json"))).toBe(false);
  });

  it("runs once per user, holds what tools start through it, and stops all of it", async () => {
    const supervisor = keep([]);
    expect(
      await until(() => supervisor.seen.out.includes("Ctrl-C stops it")),
    ).toBe(true);
    expect(supervisor.seen.out).toContain(
      `Supervisor running (pid ${supervisor.child.pid}, standalone). It holds no application`,
    );
    const record = JSON.parse(
      readFileSync(path.join(home, "supervisor.json"), "utf8"),
    ) as { pid: number; mode: string };
    expect(record).toMatchObject({
      pid: supervisor.child.pid,
      mode: "standalone",
    });

    // A second start reports the one that runs and starts nothing.
    const second = ask();
    expect(second.code).toBe(0);
    expect(second.out).toContain(
      `A supervisor already runs for this user (pid ${supervisor.child.pid}`,
    );
    expect(ask("ps").out).toContain("It holds no instance.");

    // With the supervisor: it outlives the command that asked.
    const kept = ask(
      "start",
      "web",
      "dev",
      "--lifetime",
      "supervisor",
      "--project",
      project,
    );
    expect(kept.out).toContain(
      "Started under the supervisor, with the supervisor:",
    );
    expect(kept.code).toBe(0);
    const web = pidOf("web");
    expect(isAlive(web)).toBe(true);

    // The same instance: a second start starts nothing.
    const again = ask(
      "start",
      "web",
      "dev",
      "--lifetime",
      "supervisor",
      "--project",
      project,
    );
    expect(again.out).toContain("It runs already; nothing was started:");
    expect(pidOf("web")).toBe(web);

    // With the caller: it ends when the command that asked is killed.
    const caller = keep(["start", "api", "dev", "--project", project]);
    expect(
      await until(() =>
        caller.seen.out.includes("It stops when this command ends"),
      ),
    ).toBe(true);
    const api = pidOf("api");
    expect(isAlive(api)).toBe(true);

    const listed = ask("ps").out;
    expect(listed).toMatch(
      new RegExp(`pid ${web}\\s+with the supervisor\\s+web dev`),
    );
    expect(listed).toMatch(
      new RegExp(`pid ${api}\\s+with the caller\\s+api dev`),
    );

    caller.child.kill("SIGKILL");
    expect(await until(() => !isAlive(api))).toBe(true);
    expect(isAlive(web)).toBe(true);

    // Stopping it stops what it holds, and leaves no record.
    const stopped = ask("--stop");
    expect(stopped.out).toContain(
      `Supervisor (pid ${supervisor.child.pid}) stopped, with the 1 instance(s) it held.`,
    );
    expect(stopped.code).toBe(0);
    expect(await until(() => supervisor.seen.code !== undefined)).toBe(true);
    expect(supervisor.seen.code).toBe(0);
    expect(isAlive(web)).toBe(false);
    expect(readFileSync(path.join(tmp, "web.stopped"), "utf8")).toBe(
      "stopped through its stop",
    );
    expect(existsSync(path.join(home, "supervisor.json"))).toBe(false);
    expect(existsSync(path.join(project, ".ph", "run", "web.json"))).toBe(
      false,
    );
  }, 180_000);

  it("stops when its stdin ends, as on Ctrl-C", async () => {
    const supervisor = keep([], { PH_STOP_ON_STDIN: "1" });
    expect(
      await until(() => supervisor.seen.out.includes("Ctrl-C stops it")),
    ).toBe(true);
    supervisor.child.stdin.end();
    expect(await until(() => supervisor.seen.code !== undefined)).toBe(true);
    expect(supervisor.seen.code).toBe(0);
    expect(supervisor.seen.out).toContain("Supervisor stopped.");
    expect(existsSync(path.join(home, "supervisor.json"))).toBe(false);
  }, 60_000);
});
