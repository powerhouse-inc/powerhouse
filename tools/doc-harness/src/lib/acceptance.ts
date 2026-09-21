/** Hidden tests against the builder's workspace: tsc, then vitest as JSON. */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { Task } from "./catalog.js";
import type { AttemptLayout } from "./paths.js";
import { run, type RunOptions, type RunResult } from "./process.js";
import type { SuiteFailure, TestsResult } from "./schemas.js";
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

/** Per-file results; `message` is empty when the failure was in a hook. */
export const VitestJsonFailures = z.object({
  testResults: z.array(
    z.object({
      name: z.string(),
      status: z.string(),
      message: z.string().default(""),
    }),
  ),
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

/* ----------------------------------------------------- failure reasons */

const ESC = String.fromCharCode(27);
const ANSI = new RegExp(`${ESC}\\[[0-9;]*m`, "g");
const MAX_FAILURES = 10;
const MAX_MESSAGE = 300;

function clip(text: string): string {
  const one = text.replace(/\s+/g, " ").trim();
  return one.length > MAX_MESSAGE ? `${one.slice(0, MAX_MESSAGE)}…` : one;
}

/** Hook failures fail no test and carry no JSON message; only the log has them. */
export function parseVitestFailures(log: string): SuiteFailure[] {
  const lines = log.replace(ANSI, "").split(/\r?\n/);
  const out: SuiteFailure[] = [];
  const seen = new Set<string>();
  for (const [i, line] of lines.entries()) {
    const fail = /^\s*FAIL\s+(\S.*?)\s*$/.exec(line);
    if (!fail) continue;
    const name = fail[1];
    if (seen.has(name)) continue;
    seen.add(name);
    const message = lines
      .slice(i + 1, i + 6)
      .map((l) => l.trim())
      .find((l) => /^[\w$]*(?:Error|Exception)\b/.test(l));
    out.push({ name, message: message === undefined ? "" : clip(message) });
    if (out.length === MAX_FAILURES) break;
  }
  return out;
}

/** Test files vitest reported as failed, when the JSON carries their message. */
export function parseVitestJsonFailures(text: string): SuiteFailure[] {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return [];
  }
  const parsed = VitestJsonFailures.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.testResults
    .filter((r) => r.status === "failed" && r.message.trim().length > 0)
    .slice(0, MAX_FAILURES)
    .map((r) => ({ name: path.basename(r.name), message: clip(r.message) }));
}

/** The first `error TS…` line, which is the one that explains the rest. */
export function firstTscError(output: string): string | null {
  for (const line of output.replace(ANSI, "").split(/\r?\n/)) {
    if (/error TS\d+/.test(line)) return clip(line);
  }
  return null;
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
    tscError: null,
    vitestOk: null,
    suiteErrors: 0,
    suiteFailures: [],
    passed: 0,
    failed: 0,
    total: 0,
    timedOut: false,
    durationMs: 0,
    vitestJsonPath: null,
    vitestLogPath: null,
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
  if (!result.tscOk) result.tscError = firstTscError(tsc.output);
  if (tsc.status === "timeout") result.timedOut = true;
  if (kind === "tsc-only") return done();

  const remaining = Math.max(
    o.timeoutMs - (Date.now() - startedAt),
    MIN_VITEST_MS,
  );
  const args = [
    "exec",
    "vitest",
    "run",
    "--reporter=json",
    `--outputFile=${o.layout.vitestJsonPath}`,
    // The only reporter that says why a suite failed; json writes counts only.
    "--reporter=default",
    // Pinned recipe configs lack these.
    ...ACCEPTANCE_VITEST_EXCLUDES.flatMap((g) => ["--exclude", g]),
  ];
  const vitest = await runner("pnpm", args, {
    cwd,
    timeoutMs: remaining,
    verbose: false,
    env: { ...process.env, CI: "true" },
  });
  writeFileSync(
    vitestLogPath(o.layout),
    commandLog(`pnpm ${args.join(" ")}`, vitest),
  );
  result.vitestLogPath = vitestLogPath(o.layout);
  if (vitest.status === "timeout") result.timedOut = true;
  // A crashed or killed vitest leaves no JSON: counts stay 0/0/0 and the log tells why.
  const reportText = existsSync(o.layout.vitestJsonPath)
    ? readFileSync(o.layout.vitestJsonPath, "utf8")
    : null;
  const counts = reportText === null ? null : parseVitestJson(reportText);
  if (counts !== null) {
    Object.assign(result, counts);
    result.vitestJsonPath = o.layout.vitestJsonPath;
  }
  result.vitestOk = counts !== null && !result.timedOut;
  result.suiteFailures = mergeFailures(
    parseVitestFailures(vitest.output),
    reportText === null ? [] : parseVitestJsonFailures(reportText),
  );
  return done();
}

/** The log the failure text lands in, with the command and how it ended. */
export function commandLog(command: string, result: RunResult): string {
  return `$ ${command}\n${result.output}\n[${result.status} code=${String(result.code)} ${result.durationMs}ms]\n`;
}

function mergeFailures(
  fromLog: SuiteFailure[],
  fromJson: SuiteFailure[],
): SuiteFailure[] {
  const named = fromLog.map((f) => f.name);
  const extra = fromJson.filter(
    (f) =>
      !named.some((name) => name === f.name || name.startsWith(`${f.name} `)),
  );
  return [...fromLog, ...extra].slice(0, MAX_FAILURES);
}
