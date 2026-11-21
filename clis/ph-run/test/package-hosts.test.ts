import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { readRunRecord } from "@powerhousedao/host-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// `ph-run run <package>/<host>` (decision D5), the built entry: a host an
// installed package supplies runs with its runner from the package, its
// record behind the package, and the project's cwd and `.ph/`, next to a
// project host of the same name.

const PH_RUN = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../dist/cli.mjs",
);

/** `who`: which copy of the runner ran. It prints what it was handed. */
const runner = (who: string) => `export const kind = "reactor";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export const outputsSchema = { safeParse: (data) => ({ success: true, data }) };
export async function run(host, ctx) {
  console.log("ran " + JSON.stringify({
    who: "${who}",
    name: host.name,
    projectRoot: ctx.projectRoot,
    hostPackage: ctx.hostPackage ?? null,
    cwd: process.cwd(),
  }));
  const keep = setInterval(() => {}, 1000);
  process.on("SIGTERM", () => {
    clearInterval(keep);
    setTimeout(() => process.exit(0), 50);
  });
  return { outputs: { origin: "http://localhost:1", who: "${who}" }, shutdown: async () => clearInterval(keep) };
}
`;

function write(file: string, source: string) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, source);
}

function childEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env, PH_NO_TELEMETRY: "1" };
  delete env.PH_STOP_ON_STDIN;
  delete env.PH_COMPOUND_MEMBER;
  delete env.PH_USER_DATA_DIR;
  return env;
}

describe("ph-run run <package>/<host>", () => {
  const started: ChildProcess[] = [];
  let base: string;
  let project: string;
  let tools: string;

  function phRun(args: string[], env: Record<string, string> = {}) {
    const child = spawn(process.execPath, [PH_RUN, "run", ...args], {
      cwd: project,
      env: { ...childEnv(), ...env },
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

  async function waitFor(check: () => boolean, output: () => string) {
    const deadline = Date.now() + 30_000;
    while (!check()) {
      if (Date.now() > deadline) {
        throw new Error(`no record within 30 s:\n${output()}`);
      }
      await sleep(100);
    }
  }

  const once = (args: string[]) =>
    spawnSync(process.execPath, [PH_RUN, "run", ...args], {
      cwd: project,
      env: childEnv(),
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
    });

  beforeAll(() => {
    if (!existsSync(PH_RUN)) {
      throw new Error(
        `Build @powerhousedao/ph-run first: ${PH_RUN} is missing.`,
      );
    }
    base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-run-pkg-hosts-")));
    project = path.join(base, "lab");
    tools = path.join(base, "store", "tools");
    write(
      path.join(project, "package.json"),
      JSON.stringify({ name: "pkg-lab", type: "module" }),
    );
    const own = path.join(project, "node_modules", "kit-runner");
    write(
      path.join(own, "package.json"),
      JSON.stringify({ name: "kit-runner", type: "module", main: "index.js" }),
    );
    write(path.join(own, "index.js"), runner("project"));
    write(
      path.join(project, "hosts", "sb", "host.js"),
      `export default { name: "sb", runner: { module: "kit-runner" } };`,
    );
    // The package: its real folder elsewhere, linked in, with its own copy
    // of the runner.
    write(
      path.join(tools, "package.json"),
      JSON.stringify({ name: "@acme/tools", type: "module" }),
    );
    const theirs = path.join(tools, "node_modules", "kit-runner");
    write(
      path.join(theirs, "package.json"),
      JSON.stringify({ name: "kit-runner", type: "module", main: "index.js" }),
    );
    write(path.join(theirs, "index.js"), runner("package"));
    write(
      path.join(tools, "hosts", "sb", "host.js"),
      `export default { name: "sb", runner: { module: "kit-runner" } };`,
    );
    mkdirSync(path.join(project, "node_modules", "@acme"), { recursive: true });
    symlinkSync(
      tools,
      path.join(project, "node_modules", "@acme", "tools"),
      "junction",
    );
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
    rmSync(base, { recursive: true, force: true, maxRetries: 10 });
    expect(survivors.map((child) => child.pid)).toEqual([]);
  });

  it("runs the package's host next to the project's of the same name, and stops it alone", async () => {
    const theirs = phRun(["@acme/tools/sb"]);
    const ours = phRun(["sb"]);
    await waitFor(
      () => readRunRecord(project, "@acme/tools/sb") !== undefined,
      theirs.output,
    );
    await waitFor(
      () => readRunRecord(project, "sb") !== undefined,
      ours.output,
    );

    // Its record behind the package; the project's own under its name.
    expect(
      existsSync(path.join(project, ".ph", "run", "@acme", "tools", "sb.json")),
    ).toBe(true);
    expect(readRunRecord(project, "@acme/tools/sb")).toMatchObject({
      host: "sb",
      package: "@acme/tools",
      projectName: "pkg-lab",
      outputs: { who: "package" },
    });
    expect(readRunRecord(project, "sb")?.outputs).toMatchObject({
      who: "project",
    });
    // The package's runner, handed the package; the project's root and cwd.
    expect(theirs.output()).toContain(
      `ran ${JSON.stringify({
        who: "package",
        name: "sb",
        projectRoot: project,
        hostPackage: { name: "@acme/tools", root: tools },
        cwd: project,
      })}`,
    );

    const stop = once(["@acme/tools/sb", "--stop"]);
    expect(stop.stdout).toContain("Stopped @acme/tools/sb");
    expect(await theirs.exited).not.toBeNull();
    expect(readRunRecord(project, "@acme/tools/sb")).toBeUndefined();
    // The project's host of the same name runs on.
    expect(ours.child.exitCode).toBeNull();
    expect(once(["sb", "--stop"]).status).toBe(0);
    expect(await ours.exited).not.toBeNull();
  }, 90_000);

  it("runs a compound's member a package supplies from the host handed over, with the package's runner", async () => {
    const member = {
      compound: "stack",
      member: "tool",
      folder: "@acme/tools/sb",
      host: { name: "tool-sb", runner: { module: "kit-runner" } },
    };
    const run = phRun(["@acme/tools/sb"], {
      PH_STOP_ON_STDIN: "1",
      PH_COMPOUND_MEMBER: JSON.stringify(member),
    });
    await waitFor(
      () => readRunRecord(project, "@acme/tools/tool-sb") !== undefined,
      run.output,
    );
    expect(run.output()).toContain('{"who":"package","name":"tool-sb"');
    expect(readRunRecord(project, "@acme/tools/tool-sb")?.package).toBe(
      "@acme/tools",
    );
    run.child.stdin.end();
    expect(await run.exited).toBe(0);
    expect(readRunRecord(project, "@acme/tools/tool-sb")).toBeUndefined();
  }, 90_000);

  it("says what is wrong with a ref, naming the package and the host", () => {
    const missing = once(["@acme/nope/sb"]);
    expect(missing.status).toBe(1);
    expect(missing.stderr).toContain(
      'Package "@acme/nope" is not installed in this project, so it supplies no host "sb".',
    );
    const unknown = once(["@acme/tools/studio"]);
    expect(unknown.status).toBe(1);
    expect(unknown.stderr).toContain(
      'Package "@acme/tools" supplies no host "studio". Its hosts: sb.',
    );
    const bare = once(["@acme/tools"]);
    expect(bare.status).toBe(1);
    expect(bare.stderr).toContain('"@acme/tools" names a package, not a host.');
  }, 90_000);
});
