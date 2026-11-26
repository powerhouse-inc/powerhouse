import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readRunRecord } from "@powerhousedao/host-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `ph-run run <host>` as a child, the built entry, over fake runners: what a
// compound's own-process member relies on (stop on stdin, the host handed
// over) and the bare-word argv of a passthrough runner.

const PH_RUN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/cli.mjs",
);

const FAKE_RUNNER = `export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const outputsSchema = { safeParse: (data) => ({ success: true, data }) };
export async function run(host, ctx) {
  console.log("run " + JSON.stringify({ name: host.name, config: host.config ?? null, reload: typeof ctx.reloadHost }));
  const keep = setInterval(() => {}, 1000);
  process.on("SIGTERM", () => {
    console.log("stopping on SIGTERM");
    clearInterval(keep);
    setTimeout(() => process.exit(0), 50);
  });
  const ready = new Promise((resolve) => setTimeout(resolve, Number(process.env.FAKE_READY_MS ?? 0)));
  return { outputs: { origin: "http://localhost:1" }, ready, shutdown: async () => clearInterval(keep) };
}
`;

const FAKE_CLI = `export const kind = "reactor";
export const verbs = ["run"];
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const argsSchema = { options: [], flags: [], passthrough: true };
export async function run(host, ctx) {
  console.log("argv " + JSON.stringify(ctx.argv ?? []));
}
`;

// A one-shot reactor that prints the operator its host env names.
const FAKE_ENV = `export const kind = "reactor";
export const verbs = ["run"];
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run(host, ctx) {
  console.log("operator " + (ctx.env.PH_OPERATOR ?? "none"));
}
`;

interface Run {
  child: ChildProcess;
  output(): string;
  exited: Promise<number | null>;
}

/** This process's env without a supervisor's stdin rule of its own. */
function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PH_NO_TELEMETRY: "1" };
  delete env.PH_STOP_ON_STDIN;
  delete env.PH_COMPOUND_MEMBER;
  delete env.PH_OPERATOR;
  return { ...env, ...extra };
}

describe("ph-run run, for a compound's member", () => {
  const started: ChildProcess[] = [];
  let project: string;

  function phRun(args: string[], env: Record<string, string> = {}): Run {
    const child = spawn(process.execPath, [PH_RUN, "run", ...args], {
      cwd: project,
      env: childEnv(env),
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    started.push(child);
    let text = "";
    child.stdout.on("data", (chunk: Buffer) => (text += chunk.toString()));
    child.stderr.on("data", (chunk: Buffer) => (text += chunk.toString()));
    child.stdin.on("error", () => undefined);
    const exited = new Promise<number | null>((resolve) =>
      child.once("exit", (code) => resolve(code)),
    );
    return { child, output: () => text, exited };
  }

  async function waitFor(check: () => boolean, run: Run, what: string) {
    const deadline = Date.now() + 30_000;
    while (!check()) {
      if (Date.now() > deadline) {
        throw new Error(`no ${what} within 30 s:\n${run.output()}`);
      }
      await sleep(100);
    }
  }

  async function exitCodeOf(run: Run, ms = 30_000) {
    const timeout = sleep(ms).then(() => {
      throw new Error(`still running after ${ms} ms:\n${run.output()}`);
    });
    return Promise.race([run.exited, timeout]);
  }

  beforeAll(() => {
    if (!existsSync(PH_RUN)) {
      throw new Error(
        `Build @powerhousedao/ph-run first: ${PH_RUN} is missing.`,
      );
    }
    project = mkdtempSync(path.join(tmpdir(), "ph-run-members-"));
    writeFileSync(
      path.join(project, "package.json"),
      JSON.stringify({ name: "members-lab", type: "module" }),
    );
    for (const [name, source] of [
      ["fake-runner", FAKE_RUNNER],
      ["fake-cli", FAKE_CLI],
      ["fake-env", FAKE_ENV],
    ] as const) {
      const dir = path.join(project, "node_modules", name);
      mkdirSync(dir, { recursive: true });
      writeFileSync(
        path.join(dir, "package.json"),
        JSON.stringify({ name, type: "module", main: "index.js" }),
      );
      writeFileSync(path.join(dir, "index.js"), source);
    }
    for (const [folder, module] of [
      ["sb", "fake-runner"],
      ["cli", "fake-cli"],
      ["env", "fake-env"],
    ] as const) {
      mkdirSync(path.join(project, "hosts", folder), { recursive: true });
      writeFileSync(
        path.join(project, "hosts", folder, "host.js"),
        `export default { name: "${folder}", runner: { module: "${module}" }, config: { from: "file" } };`,
      );
    }
  });

  afterAll(() => {
    const survivors = started.filter(
      (child) => child.exitCode === null && child.signalCode === null,
    );
    for (const child of survivors) {
      if (!child.pid) continue;
      if (process.platform === "win32") {
        spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
          windowsHide: true,
        });
      } else {
        child.kill("SIGKILL");
      }
    }
    rmSync(project, { recursive: true, force: true, maxRetries: 10 });
    expect(survivors.map((child) => child.pid)).toEqual([]);
  });

  it("names the OS user its host's operator, unless the env names one", async () => {
    const named = phRun(["env"]);
    expect(await exitCodeOf(named)).toBe(0);
    expect(named.output()).toContain("operator os-user");
    const given = phRun(["env"], { PH_OPERATOR: "0xabc" });
    expect(await exitCodeOf(given)).toBe(0);
    expect(given.output()).toContain("operator 0xabc");
  }, 60_000);

  it("stops a reactor host when its supervisor's stdin ends, once it has started", async () => {
    const run = phRun(["sb"], { PH_STOP_ON_STDIN: "1", FAKE_READY_MS: "800" });
    // Asked to stop while it starts: held until its record is written.
    run.child.stdin?.end();
    expect(await exitCodeOf(run)).toBe(0);
    expect(run.output()).toContain("stopping on SIGTERM");
    expect(readRunRecord(project, "sb")).toBeUndefined();
  }, 60_000);

  it("takes a line on stdin as the stop too", async () => {
    const run = phRun(["sb"], { PH_STOP_ON_STDIN: "1" });
    await waitFor(
      () => readRunRecord(project, "sb") !== undefined,
      run,
      "record",
    );
    run.child.stdin?.write("stop\n");
    expect(await exitCodeOf(run)).toBe(0);
    expect(run.output()).toContain("stopping on SIGTERM");
  }, 60_000);

  it("does not read stdin without PH_STOP_ON_STDIN", async () => {
    const run = phRun(["sb"]);
    await waitFor(
      () => readRunRecord(project, "sb") !== undefined,
      run,
      "record",
    );
    run.child.stdin?.end();
    await sleep(1_500);
    expect(run.child.exitCode).toBeNull();
    const stop = phRun(["sb", "--stop"]);
    expect(await exitCodeOf(stop)).toBe(0);
    expect(await exitCodeOf(run)).not.toBeNull();
    expect(readRunRecord(project, "sb")).toBeUndefined();
  }, 60_000);

  it("runs the host a compound handed over instead of the file, and drops it from its env", async () => {
    const member = {
      compound: "app",
      member: "app-sb",
      folder: "sb",
      host: {
        name: "sb-member",
        runner: { module: "fake-runner" },
        config: { from: "compound" },
      },
    };
    const run = phRun(["sb"], {
      PH_STOP_ON_STDIN: "1",
      PH_COMPOUND_MEMBER: JSON.stringify(member),
    });
    await waitFor(
      () => readRunRecord(project, "sb-member") !== undefined,
      run,
      "record",
    );
    expect(run.output()).toContain(
      `run ${JSON.stringify({ name: "sb-member", config: { from: "compound" }, reload: "undefined" })}`,
    );
    expect(readRunRecord(project, "sb")).toBeUndefined();
    run.child.stdin?.end();
    expect(await exitCodeOf(run)).toBe(0);
    expect(readRunRecord(project, "sb-member")).toBeUndefined();
  }, 60_000);

  it("refuses a handed-over host for another folder", async () => {
    const run = phRun(["cli"], {
      PH_COMPOUND_MEMBER: JSON.stringify({
        compound: "app",
        member: "app-sb",
        folder: "sb",
        host: { name: "sb-member", runner: { module: "fake-runner" } },
      }),
    });
    expect(await exitCodeOf(run)).toBe(1);
    expect(run.output()).toContain(
      'holds member "app-sb" (hosts/sb) of compound "app", not hosts/cli',
    );
  }, 60_000);
});

describe("ph-run run, a passthrough runner's first word", () => {
  // Reuses nothing from the block above: its own project.
  let project: string;
  const run = (args: string[]) =>
    spawnSync(process.execPath, [PH_RUN, "run", ...args], {
      cwd: project,
      env: childEnv(),
      encoding: "utf8",
      windowsHide: true,
      timeout: 30_000,
    });

  beforeAll(() => {
    project = mkdtempSync(path.join(tmpdir(), "ph-run-bare-word-"));
    writeFileSync(
      path.join(project, "package.json"),
      JSON.stringify({ name: "bare-word-lab", type: "module" }),
    );
    const dir = path.join(project, "node_modules", "fake-cli");
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(dir, "package.json"),
      JSON.stringify({ name: "fake-cli", type: "module", main: "index.js" }),
    );
    writeFileSync(path.join(dir, "index.js"), FAKE_CLI);
    mkdirSync(path.join(project, "hosts", "cli"), { recursive: true });
    writeFileSync(
      path.join(project, "hosts", "cli", "host.js"),
      `export default { name: "cli", runner: { module: "fake-cli" } };`,
    );
  });

  afterAll(() => {
    rmSync(project, { recursive: true, force: true, maxRetries: 10 });
  });

  it("starts the runner's arguments when it is not a verb", () => {
    const hello = run(["cli", "hello", "--name", "Ada"]);
    expect(hello.status).toBe(0);
    expect(hello.stdout).toContain('argv ["hello","--name","Ada"]');
    const spelled = run(["cli", "run", "hello"]);
    expect(spelled.stdout).toContain('argv ["hello"]');
  }, 60_000);

  it("stays a verb when it names one, so `--` is needed for a command of that name", () => {
    const build = run(["cli", "build"]);
    expect(build.status).toBe(1);
    expect(build.stderr).toContain('does not support the verb "build"');
    const command = run(["cli", "--", "build"]);
    expect(command.stdout).toContain('argv ["build"]');
  }, 60_000);
});
