// The package's own modules load in a worker process during `ph build`: a
// module that exits, hangs or blocks at import cannot end or stall the build.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BuildRefusal } from "../src/services/package-build/pipeline/steps.js";
import { buildPackage } from "../src/services/package-build/run-build.js";
import { definitionsStepWithin } from "../src/services/package-build/steps/definitions.js";
import { standardBuildSteps } from "../src/services/package-build/steps/standard.js";
import type { BuildArgs } from "../src/types.js";
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

const editArgs = {
  outDir: "dist",
  noSharedDeps: false,
  ignoreTypeErrors: false,
  release: false,
  debug: undefined,
} as BuildArgs;
const releaseArgs = { ...editArgs, release: true } as BuildArgs;

const originalCwd = process.cwd();
const projects: StagedProject[] = [];

beforeEach(() => {
  vi.stubEnv("CI", "1");
  vi.stubEnv("PH_NO_TELEMETRY", "1");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  process.chdir(originalCwd);
  for (const made of projects.splice(0)) made.dispose();
});

function codeFirstProject(ledger: string): StagedProject {
  const made = createStagedProject();
  projects.push(made);
  addCodeFirstLedger(made, ledger);
  process.chdir(made.root);
  return made;
}

const cliBuild = (
  made: StagedProject,
  extra: readonly string[],
  env: Record<string, string> = {},
) =>
  spawnSync(process.execPath, [PH_CLI, "build", ...extra], {
    cwd: made.root,
    encoding: "utf8",
    env: { ...process.env, CI: "1", PH_NO_TELEMETRY: "1", ...env },
    timeout: 150_000,
  });

const bundles = (made: StagedProject) =>
  treeDigest(made.root, ["dist/browser", "dist/node"]);

describe("a module that exits the process at import", () => {
  // Exits only when asked, so the line is in the bundles of both builds.
  const exiting = `if (process.env.PH_TEST_EXIT_AT_IMPORT) process.exit(0);\n${LEDGER_SOURCE}`;
  const exitNow = { PH_TEST_EXIT_AT_IMPORT: "1" };
  const couldNotRun =
    "The definition check could not run: the check exited with code 0 before it reported";

  it("leaves `ph build` to bundle, warn and exit 0", () => {
    const made = codeFirstProject(exiting);
    expect(cliBuild(made, []).status).toBe(0);
    const unaffected = bundles(made);
    rmSync(join(made.dist, "browser"), { recursive: true });
    rmSync(join(made.dist, "node"), { recursive: true });

    const result = cliBuild(made, [], exitNow);

    expect(result.status).toBe(0);
    expect(result.stderr).toContain(`⚠ ${couldNotRun}\n`);
    expect(bundles(made)).toEqual(unaffected);
    expect(scratchLeft(made)).toEqual([]);
  }, 300_000);
});

describe("a module whose top-level await never settles", () => {
  const hanging = `await new Promise<void>(() => {});\n${LEDGER_SOURCE}`;
  const steps = standardBuildSteps.map((step) =>
    step.id === "definitions" ? definitionsStepWithin(8_000) : step,
  );
  const timedOut =
    "The definition check could not run: the check did not finish within 8 seconds";

  it("times out, and `--release` refuses with the previous output", async () => {
    const made = codeFirstProject(hanging);
    await buildPackage(editArgs, { steps });
    const before = previousOutput(made);

    const built = buildPackage(releaseArgs, { steps });

    await expect(built).rejects.toThrow(new BuildRefusal(`✘ ${timedOut}`));
    await expect(built).rejects.toMatchObject({ exitCode: 1 });
    expect(previousOutput(made)).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  }, 120_000);
});

describe("a module that blocks its event loop at import", () => {
  // Blocks only when asked; it writes its pid first so the test can find it.
  const blocking = `if (process.env.PH_TEST_BLOCK_AT_IMPORT) {
  process.getBuiltinModule("node:fs").writeFileSync("worker.pid", String(process.pid));
  for (;;);
}
${LEDGER_SOURCE}`;

  const alive = (pid: number) => {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  };

  it("dies with the build when only the build is told to stop", async () => {
    const made = codeFirstProject(blocking);
    const build = spawn(process.execPath, [PH_CLI, "build"], {
      cwd: made.root,
      env: {
        ...process.env,
        CI: "1",
        PH_NO_TELEMETRY: "1",
        PH_TEST_BLOCK_AT_IMPORT: "1",
      },
      stdio: "ignore",
    });
    const ended = new Promise((resolve) => build.on("close", resolve));
    const pidFile = join(made.root, "worker.pid");
    for (let waited = 0; !existsSync(pidFile); waited += 100) {
      expect(waited).toBeLessThan(120_000);
      await sleep(100);
    }
    const worker = Number(readFileSync(pidFile, "utf8"));

    build.kill("SIGTERM");
    await ended;
    await sleep(500);
    const survived = alive(worker);
    if (survived) process.kill(worker, "SIGKILL");

    expect(survived).toBe(false);
  }, 180_000);
});
