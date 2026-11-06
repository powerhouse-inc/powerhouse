// The built `ph build` as a process: stopped by a signal, killed outright,
// started twice at once, and with package modules that keep timers running.

import { type ChildProcess, spawn, spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  constants,
  existsSync,
  openSync,
  readdirSync,
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

    it("by SIGKILL leaves the previous output and build info as they were, and is undone by the next build, which then succeeds", async () => {
      const made = await builtOnce();
      const fifo = hangBrowserBundle(made);
      const before = previousOutput(made);
      made.write(
        "index.ts",
        `${made.read("index.ts")}export const added = 1;\n`,
      );
      const { child, ended } = startBuild(made);
      await bundlerWaiting(fifo);
      child.kill("SIGKILL");
      expect((await ended).signal).toBe("SIGKILL");
      expect(previousOutput(made)).toEqual(before);
      const run = scratchLeft(made).find((entry) => entry.startsWith("runs/"));
      const id = run?.slice("runs/".length);
      expect(scratchLeft(made).sort()).toEqual(
        [
          `.dist.ph-stage-${id}`,
          `.tsconfig.tsbuildinfo.ph-stage-${id}`,
          `runs/${id}`,
          "lock",
        ].sort(),
      );
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
      expect(made.read("dist/types/index.d.ts")).toContain(
        "export declare const added = 1;",
      );
    }, 180_000);
  },
);

describe.skipIf(process.platform === "win32")(
  "a build killed while tsc runs",
  () => {
    it("leaves the previous declarations and build info, and the next tsc rebuilds them", async () => {
      const made = await builtOnce();
      const before = previousOutput(made);
      const declarations = made.read("dist/types/index.d.ts");
      made.write(
        "index.ts",
        `${made.read("index.ts")}export const added = 1;\n`,
      );
      const { child, ended } = startBuild(made, { PH_TEST_TSC_HANG: "1" });
      await until(() => existsSync(join(made.root, "tsc-wrote")));
      process.kill(-child.pid!, "SIGKILL");
      await ended;
      expect(previousOutput(made)).toEqual(before);

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

describe.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
  "a build killed after tsc wrote declarations it keeps in place",
  () => {
    const valued = (made: StagedProject, value: string) =>
      made.write(
        "index.ts",
        `${made.read("index.ts").replace(/export const value = .*\n/, "")}export const value = "${value}" as const;\n`,
      );
    const layouts: [string, (made: StagedProject) => void, string][] = [
      [
        "lib",
        (made) =>
          made.write(
            "tsconfig.json",
            made.read("tsconfig.json").replace('"./dist/types"', '"./lib"'),
          ),
        "lib/index.d.ts",
      ],
      [
        "dist itself, from a project without build info",
        (made) =>
          made.write(
            "tsconfig.json",
            made
              .read("tsconfig.json")
              .replace('"incremental": true,', "")
              .replace(
                '"declarationDir": "./dist/types"',
                '"outDir": "./dist"',
              ),
          ),
        "dist/index.d.ts",
      ],
      [
        "dist itself, from a referenced project",
        (made) => {
          const { compilerOptions, include } = JSON.parse(
            made.read("tsconfig.json"),
          ) as { compilerOptions: object; include: string[] };
          made.write(
            "compiler/tsconfig.json",
            JSON.stringify({
              compilerOptions: {
                ...compilerOptions,
                incremental: undefined,
                declarationDir: undefined,
                composite: true,
                rootDir: "..",
                outDir: "../dist",
              },
              include: include.map((path) => `../${path}`),
            }),
          );
          made.write(
            "tsconfig.json",
            JSON.stringify({ files: [], references: [{ path: "./compiler" }] }),
          );
        },
        "dist/index.d.ts",
      ],
    ];
    const built = (made: StagedProject, declarations: string) => {
      const node = join(made.root, "dist", "node");
      const bundled = readdirSync(node, { recursive: true })
        .map(String)
        .filter((file) => file.endsWith(".mjs"))
        .map((file) => made.read(join("dist", "node", file)))
        .join("\n");
      return {
        declarations: /value: "(\w+)"/.exec(made.read(declarations))?.[1],
        bundle: /value = "(\w+)"/.exec(bundled)?.[1],
      };
    };

    it.each(layouts.slice(1))(
      "into %s, is undone by the next build",
      async (_, layout, declarations) => {
        const made = project();
        layout(made);
        valued(made, "ZERO");
        expect((await build(made)).code).toBe(0);
        const before = previousOutput(made);
        valued(made, "A");
        const { child, ended } = startBuild(made, { PH_TEST_TSC_HANG: "1" });
        await until(() => existsSync(join(made.root, "tsc-wrote")));
        process.kill(-child.pid!, "SIGKILL");
        await ended;
        expect(built(made, declarations)).toEqual({
          declarations: "A",
          bundle: "ZERO",
        });
        made.write(
          "index.ts",
          `${made.read("index.ts")}export const broken: number = "not a number";\n`,
        );

        const next = await build(made);

        expect(next.code).toBe(1);
        expect(next.stderr).toContain(
          "⚠ An earlier build of this package stopped before it finished; its partial output was removed and the previous output restored.\n",
        );
        expect(previousOutput(made)).toEqual(before);
        expect(scratchLeft(made)).toEqual([]);
      },
      240_000,
    );

    it.each(layouts)(
      "into %s, is not undone over a later build that wrote in place while .ph/build could not be written",
      async (_, layout, declarations) => {
        const made = project();
        layout(made);
        valued(made, "ZERO");
        expect((await build(made)).code).toBe(0);
        valued(made, "A");
        const { child, ended } = startBuild(made, { PH_TEST_TSC_HANG: "1" });
        await until(() => existsSync(join(made.root, "tsc-wrote")));
        process.kill(-child.pid!, "SIGKILL");
        await ended;
        const control = join(made.root, ".ph", "build");
        chmodSync(control, 0o555);
        valued(made, "B");
        try {
          expect((await build(made)).code).toBe(0);
        } finally {
          chmodSync(control, 0o755);
        }
        expect(built(made, declarations)).toEqual({
          declarations: "B",
          bundle: "B",
        });
        made.write(
          "powerhouse.manifest.json",
          made
            .read("powerhouse.manifest.json")
            .replace('"@fixture/classic-package"', '"@fixture/renamed"'),
        );

        const refused = await build(made);

        expect(refused.code).toBe(1);
        expect(built(made, declarations)).toEqual({
          declarations: "B",
          bundle: "B",
        });
        expect(refused.stderr).toContain(
          "⚠ An earlier build of this package stopped before it finished, and a build that wrote dist in place ran after it; the earlier build's partial output was removed and the newer files were kept.\n",
        );
        expect(scratchLeft(made)).toEqual([]);
      },
      240_000,
    );
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
