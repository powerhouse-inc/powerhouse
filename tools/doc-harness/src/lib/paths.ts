/**
 * Where everything lives on disk. One place, so the steps, the CLI and the
 * tests agree on file names.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Arm } from "./schemas.js";

/** tools/doc-harness. DOC_HARNESS_ROOT pins it when running from a bundle (Studio). */
export const HARNESS_ROOT =
  process.env.DOC_HARNESS_ROOT ??
  path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/** The monorepo checkout this harness lives in. */
export const MONOREPO_ROOT = path.resolve(HARNESS_ROOT, "../..");

/** apps/academy/docs/academy, relative to the monorepo root (used with git archive). */
export const DOCS_REL = "apps/academy/docs/academy";

/**
 * The public recipes checkout. Sibling of the monorepo, or of the worktrees
 * directory when the monorepo is itself a worktree; DOC_HARNESS_RECIPES_DIR
 * overrides both.
 */
export function recipesRoot(): string {
  if (process.env.DOC_HARNESS_RECIPES_DIR) {
    return process.env.DOC_HARNESS_RECIPES_DIR;
  }
  const candidates = [
    path.resolve(MONOREPO_ROOT, "../recipes"),
    path.resolve(MONOREPO_ROOT, "../../recipes"),
  ];
  return candidates.find((c) => existsSync(c)) ?? candidates[0];
}

export const CATALOG_FILE = path.join(HARNESS_ROOT, "catalog/tasks.json");
export const PINNED_ROOT = path.join(HARNESS_ROOT, "catalog/pinned");
export const PROMPTS_ROOT = path.join(HARNESS_ROOT, "prompts");
export const FINDINGS_FILE = path.join(HARNESS_ROOT, "FINDINGS.jsonl");
export const RUNS_FILE = path.join(HARNESS_ROOT, "RUNS.jsonl");
export const STATE_DIR = path.join(HARNESS_ROOT, "state");
export const RUNS_ROOT = path.join(HARNESS_ROOT, "runs");

export interface AttemptLayout {
  taskId: string;
  arm: Arm;
  n: number;
  dir: string;
  workspaceDir: string;
  /** Arm B only: the reference recipe, read-only for the builder. */
  referenceDir: string;
  /** Collected .d.ts of the exercised packages, for the judge. */
  dtsDir: string;
  settingsFile: string;
  judgeSettingsFile: string;
  verifierSettingsFile: string;
  systemPromptFile: string;
  taskPromptFile: string;
  transcriptPath: string;
  sessionJsonlPath: string;
  stderrPath: string;
  installLogPath: string;
  prepareJson: string;
  buildJson: string;
  testsJson: string;
  tscOutputPath: string;
  vitestJsonPath: string;
  metricsJson: string;
  compactMd: string;
  judgeJson: string;
  judgeTranscriptPath: string;
  judgeStderrPath: string;
  verifyJson: string;
  verifyTranscriptPath: string;
  verifyStderrPath: string;
  attemptJson: string;
}

export interface RunLayout {
  runId: string;
  root: string;
  runJson: string;
  docsDir: string;
  docsIndex: string;
  reportMd: string;
  /** Shared, per-(task,pin) installed node_modules template. */
  installCacheDir: string;
  attempt(taskId: string, arm: Arm, n: number): AttemptLayout;
}

export function runLayout(
  runId: string,
  runsRoot: string = RUNS_ROOT,
): RunLayout {
  const root = path.join(runsRoot, runId);
  return {
    runId,
    root,
    runJson: path.join(root, "run.json"),
    docsDir: path.join(root, "docs"),
    docsIndex: path.join(root, "docs", "INDEX.md"),
    reportMd: path.join(root, "REPORT.md"),
    installCacheDir: path.join(root, ".install-cache"),
    attempt(taskId, arm, n) {
      const dir = path.join(root, taskId, arm, String(n));
      return {
        taskId,
        arm,
        n,
        dir,
        workspaceDir: path.join(dir, "workspace"),
        referenceDir: path.join(dir, "workspace", "reference"),
        dtsDir: path.join(dir, "dts"),
        settingsFile: path.join(dir, "settings.json"),
        judgeSettingsFile: path.join(dir, "judge.settings.json"),
        verifierSettingsFile: path.join(dir, "verifier.settings.json"),
        systemPromptFile: path.join(dir, "builder.system.md"),
        taskPromptFile: path.join(dir, "builder.task.md"),
        transcriptPath: path.join(dir, "transcript.stream.jsonl"),
        sessionJsonlPath: path.join(dir, "session.jsonl"),
        stderrPath: path.join(dir, "build.stderr.log"),
        installLogPath: path.join(dir, "install.log"),
        prepareJson: path.join(dir, "prepare.json"),
        buildJson: path.join(dir, "build.json"),
        testsJson: path.join(dir, "tests.json"),
        tscOutputPath: path.join(dir, "tsc.log"),
        vitestJsonPath: path.join(dir, "vitest.json"),
        metricsJson: path.join(dir, "metrics.json"),
        compactMd: path.join(dir, "transcript.compact.md"),
        judgeJson: path.join(dir, "judge.json"),
        judgeTranscriptPath: path.join(dir, "judge.stream.jsonl"),
        judgeStderrPath: path.join(dir, "judge.stderr.log"),
        verifyJson: path.join(dir, "verify.json"),
        verifyTranscriptPath: path.join(dir, "verify.stream.jsonl"),
        verifyStderrPath: path.join(dir, "verify.stderr.log"),
        attemptJson: path.join(dir, "attempt.json"),
      };
    },
  };
}

/** `2026-09-17T14-03-22Z` style: sortable and safe as a directory name. */
export function newRunId(now: Date = new Date()): string {
  return now
    .toISOString()
    .replace(/\.\d{3}Z$/, "Z")
    .replace(/:/g, "-");
}

/** Claude Code's on-disk session directory name for a cwd. */
export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, "-");
}

export function claudeSessionFile(
  configDir: string,
  cwd: string,
  sessionId: string,
): string {
  return path.join(
    configDir,
    "projects",
    encodeClaudeProjectDir(cwd),
    `${sessionId}.jsonl`,
  );
}

export function defaultClaudeConfigDir(): string {
  return (
    process.env.CLAUDE_CONFIG_DIR ??
    path.join(process.env.HOME ?? "", ".claude")
  );
}

export function assertExists(p: string, what: string): void {
  if (!existsSync(p)) {
    throw new Error(`${what} not found at ${p}`);
  }
}
