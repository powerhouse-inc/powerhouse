// The built `ph build` as a process: stopped by a signal, killed outright,
// started twice at once, and with package modules that keep timers running.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  closeSync,
  constants,
  existsSync,
  openSync,
  writeFileSync,
} from "node:fs";
import { hostname } from "node:os";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, describe, expect, it } from "vitest";
import { LEDGER_SOURCE } from "./model-project.js";
import {
  addCodeFirstLedger,
  createStagedProject,
  PH_CLI,
  previousOutput,
  scratchLeft,
  type StagedProject,
  treeDigest,
} from "./staged-build-project.js";

const projects: StagedProject[] = [];
const children: ChildProcess[] = [];
const fds: number[] = [];

afterEach(() => {
  for (const child of children.splice(0)) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // Already gone.
      }
    }
  }
  for (const fd of fds.splice(0)) closeSync(fd);
  for (const made of projects.splice(0)) made.dispose();
});

function project(): StagedProject {
  const made = createStagedProject();
  projects.push(made);
  return made;
}

type Ended = {
  readonly code: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
};

/** `ph build` in the package, in a process group of its own. */
function startBuild(
  made: StagedProject,
  env: Readonly<Record<string, string>> = {},
): { child: ChildProcess; ended: Promise<Ended> } {
  const child = spawn(process.execPath, [PH_CLI, "build"], {
    cwd: made.root,
    env: { ...process.env, CI: "1", PH_NO_TELEMETRY: "1", ...env },
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  children.push(child);
  let stdout = "";
  let stderr = "";
  child.stdout!.on("data", (chunk: Buffer) => (stdout += chunk.toString()));
  child.stderr!.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
  const ended = new Promise<Ended>((resolve) =>
    child.on("close", (code, signal) =>
      resolve({ code, signal, stdout, stderr }),
    ),
  );
  return { child, ended };
}

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const build = (made: StagedProject, env?: Record<string, string>) =>
  startBuild(made, env).ended;

async function until(ready: () => boolean, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;
  while (!ready()) {
    if (Date.now() > deadline) throw new Error("timed out");
    await sleep(25);
  }
}

/**
 * Makes the browser bundle hang: it bundles a package whose package.json is
 * a FIFO, and the resolver's read of it waits for a writer. Outside tsc's
 * include, so only the bundler reads it.
 */
function hangBrowserBundle(made: StagedProject): string {
  made.write("reactor/index.ts", 'export { hang } from "hang-dep";\n');
  made.write("node_modules/hang-dep/index.js", "export const hang = 1;\n");
  const fifo = join(made.root, "node_modules", "hang-dep", "package.json");
  expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
  return fifo;
}

/** Resolves once the bundler waits on the FIFO; the open end keeps it waiting. */
async function bundlerWaiting(fifo: string): Promise<void> {
  await until(() => {
    try {
      fds.push(openSync(fifo, constants.O_WRONLY | constants.O_NONBLOCK));
      return true;
    } catch (error) {
      if ((error as { code?: unknown }).code !== "ENXIO") throw error;
      return false;
    }
  });
}

/**
 * The environment of a build on another machine that shares the package, as
 * a new container on a bind mount is: `os.hostname()` names another host.
 */
function onAnotherHost(made: StagedProject): Record<string, string> {
  const preload = join(dirname(made.root), "other-host.mjs");
  writeFileSync(
    preload,
    'import os from "node:os";\nimport { syncBuiltinESMExports } from "node:module";\nos.hostname = () => "3f2a9c1b7d4e";\nsyncBuiltinESMExports();\n',
  );
  return { NODE_OPTIONS: `--import=${pathToFileURL(preload).href}` };
}

/** `build`, killed after `timeoutMs`: a build that waits for a lock forever fails. */
async function buildWithin(
  made: StagedProject,
  env: Record<string, string>,
  timeoutMs: number,
): Promise<Ended> {
  const { child, ended } = startBuild(made, env);
  const timer = setTimeout(
    () => process.kill(-child.pid!, "SIGKILL"),
    timeoutMs,
  );
  try {
    return await ended;
  } finally {
    clearTimeout(timer);
  }
}

async function builtOnce(): Promise<StagedProject> {
  const made = project();
  const first = await build(made);
  expect(first.code).toBe(0);
  return made;
}

describe.skipIf(process.platform === "win32")(
  "a build stopped while it bundles",
  () => {
    it("by SIGINT leaves the previous output, ends by that signal, releases its lock and leaves its run to the next build, which recovers it on another host", async () => {
      const made = await builtOnce();
      const fifo = hangBrowserBundle(made);
      const before = previousOutput(made);
      const { child, ended } = startBuild(made);

      await bundlerWaiting(fifo);
      child.kill("SIGINT");
      const result = await ended;

      expect(result.signal).toBe("SIGINT");
      expect(previousOutput(made)).toEqual(before);
      expect(scratchLeft(made)).toEqual([expect.stringMatching(/^runs\//)]);
      made.write("reactor/index.ts", "export const reactor = 1;\n");

      const next = await buildWithin(made, onAnotherHost(made), 90_000);

      expect(next.code).toBe(0);
      expect(next.stdout).not.toContain("Another build");
      expect(next.stderr).toContain(
        "⚠ An earlier build of this package stopped before it finished; its partial output was removed and the previous output restored.\n",
      );
      expect(scratchLeft(made)).toEqual([]);
    }, 180_000);

    it("by SIGKILL is undone by the next build, which then succeeds", async () => {
      const made = await builtOnce();
      const fifo = hangBrowserBundle(made);
      const before = previousOutput(made);
      const { child, ended } = startBuild(made);
      await bundlerWaiting(fifo);
      child.kill("SIGKILL");
      expect((await ended).signal).toBe("SIGKILL");
      // What the killed build left: its lock, its run, its stage.
      expect(previousOutput(made)).toEqual(before);
      const [stage, run, lock, ...rest] = scratchLeft(made);
      expect(rest).toEqual([]);
      expect(run).toMatch(/^runs\//);
      expect(stage).toBe(`.dist.ph-stage-${run.slice("runs/".length)}`);
      expect(lock).toBe("lock");
      made.write("reactor/index.ts", "export const reactor = 1;\n");

      const next = await build(made);

      expect(next.code).toBe(0);
      expect(next.stderr).toContain(
        "⚠ An earlier build of this package stopped before it finished; its partial output was removed and the previous output restored.\n",
      );
      expect(scratchLeft(made)).toEqual([]);
      expect(
        existsSync(join(made.dist, "browser", "reactor", "index.js")),
      ).toBe(true);
    }, 180_000);
  },
);

describe.skipIf(process.platform === "win32")(
  "a build killed while tsc runs",
  () => {
    it("has its declarations restored before the next tsc, which rebuilds them", async () => {
      const made = await builtOnce();
      const declarations = made.read("dist/types/index.d.ts");
      made.write(
        "index.ts",
        `${made.read("index.ts")}export const added = 1;\n`,
      );
      const { child, ended } = startBuild(made, { PH_TEST_TSC_HANG: "1" });
      await until(() => existsSync(join(made.root, "tsc-wrote")));
      // tsc had written the new declarations when the build died.
      expect(made.read("dist/types/index.d.ts")).toContain("added");
      process.kill(-child.pid!, "SIGKILL");
      await ended;

      const next = await build(made);

      expect(next.code).toBe(0);
      const builds = made
        .tscCalls()
        .filter(({ args }) => args[0] === "--build");
      expect(builds.at(-1)?.declarations).toBe(declarations);
      expect(made.read("dist/types/index.d.ts")).toContain(
        "export declare const added = 1;",
      );
      expect(scratchLeft(made)).toEqual([]);
    }, 180_000);
  },
);

describe("two builds of one package started together", () => {
  it("both succeed, one after the other, with one build's output", async () => {
    const made = project();
    const first = startBuild(made);
    const second = startBuild(made);

    const results = await Promise.all([first.ended, second.ended]);
    const together = treeDigest(made.root, ["dist"]);
    expect(results.map(({ code }) => code)).toEqual([0, 0]);
    const waited = results
      .map(({ stdout }, index) => ({ stdout, other: [second, first][index] }))
      .filter(({ stdout }) => stdout.includes("Another build"));
    expect(waited).toHaveLength(1);
    const lock = ".ph/build/lock";
    expect(waited[0].stdout).toMatch(
      new RegExp(
        `Another build of this package holds ${escaped(lock)} \\(host ${escaped(hostname())}, pid ${waited[0].other.child.pid}, run [^)]+\\); waiting for it to finish\\.\\.\\. If that build is gone, delete ${escaped(lock)}\\.\n`,
      ),
    );
    expect(scratchLeft(made)).toEqual([]);

    expect((await build(made)).code).toBe(0);
    expect(treeDigest(made.root, ["dist"])).toEqual(together);
  }, 180_000);
});

describe("a build that loaded the package's own modules", () => {
  it("exits when it is done, though a module keeps a timer running", () => {
    const made = project();
    addCodeFirstLedger(made, `setInterval(() => {}, 1000);\n${LEDGER_SOURCE}`);

    const result = spawnSync(process.execPath, [PH_CLI, "build"], {
      cwd: made.root,
      encoding: "utf8",
      env: { ...process.env, CI: "1", PH_NO_TELEMETRY: "1" },
      timeout: 90_000,
    });

    expect(result.signal).toBe(null);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      "✔ ok: 1 definition (code-first, 1 selected source)",
    );
  }, 120_000);
});
