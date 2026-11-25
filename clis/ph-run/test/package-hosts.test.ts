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
import { createServer } from "node:net";
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
export async function build(host, ctx) {
  console.log("built " + JSON.stringify({ who: "${who}", name: host.name, cwd: process.cwd() }));
}
`;

/** A port the OS gave out, free again: what the Connect is asked to bind. */
function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const probe = createServer();
    probe.once("error", fail);
    probe.listen(0, "127.0.0.1", () => {
      const address = probe.address();
      const port = typeof address === "object" && address ? address.port : 0;
      probe.close(() => done(port));
    });
  });
}

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
    // A run ended by a signal has no code on POSIX: its signal stands in.
    const exited = new Promise<number | NodeJS.Signals | null>((resolve) =>
      child.once("exit", (code, signal) => resolve(code ?? signal)),
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

  const once = (args: string[], cwd = project) =>
    spawnSync(process.execPath, [PH_RUN, "run", ...args], {
      cwd,
      env: childEnv(),
      encoding: "utf8",
      windowsHide: true,
      timeout: 60_000,
    });

  // Not `once`: a stop waits for the pid to go, and on Linux an exited child
  // stays a zombie until this process reaps it, which spawnSync blocks.
  async function stop(ref: string) {
    const run = phRun([ref, "--stop"]);
    return { status: await run.exited, stdout: run.output() };
  }

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
    // A compound of the package's: its build is refused before its runner
    // is asked.
    write(
      path.join(tools, "node_modules", "kit-compound", "package.json"),
      JSON.stringify({
        name: "kit-compound",
        type: "module",
        main: "index.js",
      }),
    );
    write(
      path.join(tools, "node_modules", "kit-compound", "index.js"),
      `export const kind = "compound";
export const hostSchema = { safeParse: (host) => ({ success: true, data: host }) };
export async function run() { console.log("compound ran"); }
export async function build() { console.log("compound built"); }
`,
    );
    write(
      path.join(tools, "hosts", "stack", "host.js"),
      `export default { name: "stack", runner: { module: "kit-compound" }, children: { sb: { host: "sb" } } };`,
    );
    // A Connect the package built, served by ph-run's own runner (the
    // package's dependency), next to a Connect build of the project's.
    write(
      path.join(tools, "hosts", "connect", "host.js"),
      `export default ${JSON.stringify({
        name: "connect",
        runner: {
          module: "@powerhousedao/ph-run/runners/connect",
          outDir: "${package}/dist/connect",
          strictPort: true,
        },
      })};`,
    );
    write(
      path.join(tools, "dist", "connect", "index.html"),
      "<!doctype html><title>the package's build</title>",
    );
    write(
      path.join(project, "dist", "connect", "index.html"),
      "<!doctype html><title>the project's build</title>",
    );
    mkdirSync(path.join(tools, "node_modules", "@powerhousedao"), {
      recursive: true,
    });
    symlinkSync(
      path.dirname(path.dirname(PH_RUN)),
      path.join(tools, "node_modules", "@powerhousedao", "ph-run"),
      "junction",
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

    const stopped = await stop("@acme/tools/sb");
    expect(stopped.stdout).toContain("Stopped @acme/tools/sb");
    expect(await theirs.exited).not.toBeNull();
    expect(readRunRecord(project, "@acme/tools/sb")).toBeUndefined();
    // The project's host of the same name runs on.
    expect(ours.child.exitCode).toBeNull();
    expect((await stop("sb")).status).toBe(0);
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

  it("serves the Connect build at ${package}/dist/connect: the package's, not the project's", async () => {
    const port = await freePort();
    const run = phRun(["@acme/tools/connect", "serve", "--port", String(port)]);
    await waitFor(
      () => readRunRecord(project, "@acme/tools/connect") !== undefined,
      run.output,
    );
    const outputs = readRunRecord(project, "@acme/tools/connect")?.outputs;
    const origin = (outputs as { origin?: string } | undefined)?.origin;
    expect(origin).toBe(`http://127.0.0.1:${port}`);
    const page = await fetch(`${origin}/`, {
      headers: { accept: "text/html" },
    });
    expect(await page.text()).toContain("the package's build");
    expect((await stop("@acme/tools/connect")).status).toBe(0);
    expect(await run.exited).not.toBeNull();
  }, 90_000);

  it("refuses to build a package's host, standalone and compound; the package's own repository builds it", () => {
    for (const ref of ["@acme/tools/sb", "@acme/tools/stack"]) {
      const refused = once([ref, "build"]);
      expect(refused.status, refused.stdout).toBe(1);
      expect(refused.stderr).toContain(
        `@acme/tools/hosts/${ref.split("/").at(-1)}/host.js: ${ref} is a host @acme/tools supplies, and a package's hosts are built by the package: "build" does not run on it.`,
      );
      expect(refused.stdout).not.toContain("built");
    }
    // In the package's own folder its hosts are the project's: they build.
    const own = once(["sb", "build"], tools);
    expect(own.status, own.stderr).toBe(0);
    expect(own.stdout).toContain(
      `built ${JSON.stringify({ who: "package", name: "sb", cwd: tools })}`,
    );
    // And a project host builds as before.
    const ours = once(["sb", "build"]);
    expect(ours.status, ours.stderr).toBe(0);
    expect(ours.stdout).toContain('built {"who":"project"');
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
      'Package "@acme/tools" supplies no host "studio". Its hosts: connect, sb, stack.',
    );
    const bare = once(["@acme/tools"]);
    expect(bare.status).toBe(1);
    expect(bare.stderr).toContain('"@acme/tools" names a package, not a host.');
  }, 90_000);
});
