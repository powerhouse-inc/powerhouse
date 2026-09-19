/** Hidden tests against the builder's workspace: tsc, then vitest as JSON. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { z } from "zod";
import type { Task } from "./catalog.js";
import type { AttemptLayout } from "./paths.js";
import { run, type RunOptions, type RunResult } from "./process.js";
import type { TestsResult } from "./schemas.js";
import {
  ACCEPTANCE_VITEST_EXCLUDES,
  copyAcceptanceFiles,
  refreshGradingConfig,
  reinstallIfMissing,
  type Installer,
} from "./workspace.js";

export type { Installer } from "./workspace.js";

export type Runner = (
  cmd: string,
  args: string[],
  options: RunOptions,
) => Promise<RunResult>;

/** The subset of vitest's JSON reporter output the harness reads. */
export const VitestJsonSummary = z.object({
  numTotalTests: z.number(),
  numFailedTestSuites: z.number().optional(),
  numPassedTests: z.number(),
  numFailedTests: z.number(),
});

export type TestCounts = {
  passed: number;
  failed: number;
  total: number;
  suiteErrors: number;
};

export function parseVitestJson(text: string): TestCounts | null {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return null;
  }
  const parsed = VitestJsonSummary.safeParse(json);
  if (!parsed.success) return null;
  return {
    passed: parsed.data.numPassedTests,
    failed: parsed.data.numFailedTests,
    total: parsed.data.numTotalTests,
    suiteErrors: parsed.data.numFailedTestSuites ?? 0,
  };
}

export interface AcceptanceOptions {
  task: Task;
  layout: AttemptLayout;
  /** Budget for tsc and vitest together. */
  timeoutMs: number;
  pinnedRoot?: string;
  /** Copies the files but runs nothing; counts stay 0 and tscOk null. */
  dryRun?: boolean;
  runner?: Runner;
  /** Reinstalls a workspace record.ts already stripped; without it, tsc fails. */
  reinstall?: { cacheDir: string; timeoutMs: number; installer?: Installer };
}

const MIN_VITEST_MS = 30_000;

/** Vitest's stdout/stderr, next to its JSON. */
export function vitestLogPath(layout: Pick<AttemptLayout, "vitestJsonPath">) {
  return layout.vitestJsonPath.replace(/\.json$/, ".log");
}

export async function runAcceptance(
  o: AcceptanceOptions,
): Promise<TestsResult> {
  const startedAt = Date.now();
  const runner = o.runner ?? run;
  const { kind } = o.task.acceptance;
  const cwd = o.layout.workspaceDir;
  copyAcceptanceFiles(o.task, cwd, o.pinnedRoot);

  const result: TestsResult = {
    kind,
    tscOk: null,
    tscOutputPath: null,
    vitestOk: null,
    suiteErrors: 0,
    passed: 0,
    failed: 0,
    total: 0,
    timedOut: false,
    durationMs: 0,
    vitestJsonPath: null,
  };
  const done = (): TestsResult => ({
    ...result,
    durationMs: Date.now() - startedAt,
  });
  if (kind === "none" || o.dryRun === true) return done();

  refreshGradingConfig(o.task, cwd);
  if (o.reinstall) {
    await reinstallIfMissing({
      workspaceDir: cwd,
      task: o.task,
      cacheDir: o.reinstall.cacheDir,
      logPath: o.layout.reinstallLogPath,
      timeoutMs: o.reinstall.timeoutMs,
      installer: o.reinstall.installer,
    });
  }

  const tsc = await runner("pnpm", ["exec", "tsc", "--noEmit"], {
    cwd,
    timeoutMs: o.timeoutMs,
    verbose: false,
  });
  writeFileSync(o.layout.tscOutputPath, tsc.output);
  result.tscOk = tsc.status === "pass";
  result.tscOutputPath = o.layout.tscOutputPath;
  if (tsc.status === "timeout") result.timedOut = true;
  if (kind === "tsc-only") return done();

  const remaining = Math.max(
    o.timeoutMs - (Date.now() - startedAt),
    MIN_VITEST_MS,
  );
  const vitest = await runner(
    "pnpm",
    [
      "exec",
      "vitest",
      "run",
      "--reporter=json",
      `--outputFile=${o.layout.vitestJsonPath}`,
      // Pinned recipe configs lack these.
      ...ACCEPTANCE_VITEST_EXCLUDES.flatMap((g) => ["--exclude", g]),
    ],
    {
      cwd,
      timeoutMs: remaining,
      verbose: false,
      env: { ...process.env, CI: "true" },
    },
  );
  writeFileSync(vitestLogPath(o.layout), vitest.output);
  if (vitest.status === "timeout") result.timedOut = true;
  // A crashed or killed vitest leaves no JSON: counts stay 0/0/0 and the log tells why.
  const counts = existsSync(o.layout.vitestJsonPath)
    ? parseVitestJson(readFileSync(o.layout.vitestJsonPath, "utf8"))
    : null;
  if (counts !== null) {
    Object.assign(result, counts);
    result.vitestJsonPath = o.layout.vitestJsonPath;
  }
  result.vitestOk = counts !== null && !result.timedOut;
  return done();
}
