// A signal-exit callback can keep the process running after a signal that
// signal-exit's own listener would end it with. Its own file: the signal
// unloads the signal-exit copy rolldown loaded into this process.

import { setTimeout as sleep } from "node:timers/promises";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BuildStopped } from "../src/services/package-build/pipeline/steps.js";
import { buildPackage } from "../src/services/package-build/run-build.js";
import type { StandardBuildStep } from "../src/services/package-build/steps/context.js";
import { standardBuildSteps } from "../src/services/package-build/steps/standard.js";
import type { BuildArgs } from "../src/types.js";
import {
  createStagedProject,
  scratchLeft,
  type StagedProject,
  treeDigest,
} from "./staged-build-project.js";

const args = {
  outDir: "dist",
  noSharedDeps: false,
  ignoreTypeErrors: false,
  release: false,
  debug: undefined,
} as BuildArgs;

/** The emitter every signal-exit copy in the process shares. */
type SignalExitEmitter = {
  readonly count: number;
  on(event: "exit", listener: () => boolean): void;
  removeListener(event: "exit", listener: () => boolean): void;
};

const originalCwd = process.cwd();
let made: StagedProject | undefined;

beforeEach(() => {
  vi.stubEnv("CI", "1");
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  process.chdir(originalCwd);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  made?.dispose();
});

// On Windows, process.kill ends the process instead of delivering the signal.
it.skipIf(process.platform === "win32")(
  "puts back a compiler output a step rewrites after the signal, when a signal-exit callback keeps the process running",
  async () => {
    made = createStagedProject();
    process.chdir(made.root);
    made.write(
      "tsconfig.json",
      made.read("tsconfig.json").replace('"./dist/types"', '"./lib"'),
    );
    const compiled = () =>
      treeDigest(made!.root, ["dist", "lib", "tsconfig.tsbuildinfo"]);
    // The first build loads rolldown, whose signal-exit listens for signals.
    await buildPackage(args);
    const emitter = (globalThis as Record<symbol, unknown>)[
      Symbol.for("signal-exit emitter")
    ] as SignalExitEmitter;
    expect(emitter.count).toBe(1);
    const before = compiled();
    const late: StandardBuildStep = {
      id: "late",
      after: ["typecheck"],
      run: async () => {
        process.kill(process.pid, "SIGTERM");
        await sleep(100);
        // tsc, or a step like it, writing a compiler output after the signal.
        made!.write("lib/index.d.ts", "export declare const late: 1;\n");
      },
    };
    const keepRunning = () => true;
    emitter.on("exit", keepRunning);

    try {
      await expect(
        buildPackage(args, { steps: [...standardBuildSteps, late] }),
      ).rejects.toThrow(new BuildStopped("SIGTERM"));
    } finally {
      emitter.removeListener("exit", keepRunning);
    }

    expect(compiled()).toEqual(before);
    expect(scratchLeft(made)).toEqual([]);
  },
  120_000,
);
