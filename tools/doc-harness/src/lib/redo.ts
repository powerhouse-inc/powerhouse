/**
 * `resume --redo-failed`: put attempts that failed for infrastructure reasons
 * back to every step that failed, so the idempotent workflow redoes them.
 * Nothing is deleted: each step's outputs and everything downstream move to
 * `<attempt>/previous/<n>/`, and the attempt's lines leave FINDINGS.jsonl and
 * the run's line leaves RUNS.jsonl so the summary re-appends them.
 */
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { z, type ZodType } from "zod";
import { isTruncation } from "./attempt-status.js";
import { readEntries, writeEntries } from "./findings.js";
import type { AttemptLayout, RunLayout } from "./paths.js";
import {
  Arm,
  ClaudeFailureReason,
  FindingRecord,
  RunRecord,
  type ClaudeFailureReason as FailureReason,
} from "./schemas.js";

function readCached<T>(file: string, schema: ZodType<T>): T | null {
  if (!existsSync(file)) return null;
  return schema.parse(JSON.parse(readFileSync(file, "utf8")));
}

export type RedoStep = "build" | "acceptance" | "judge" | "verify" | "record";

/** `tsc`: tscOk false; `vitest`: vitestOk false or suite errors; `any`: graded. */
export const AcceptanceRedoReason = z.enum(["tsc", "vitest", "any"]);
export type AcceptanceRedoReason = z.infer<typeof AcceptanceRedoReason>;

export type RedoReason = FailureReason | AcceptanceRedoReason;

/**
 * `wall-clock` matches that failure in any step; `judge:wall-clock` only in
 * the judge; `record:budget-exhausted` re-records (attempt.json and the
 * findings lines only) attempts whose build failed that way, so the new
 * status taxonomy applies without redoing any work. `acceptance:<reason>`
 * re-grades and re-records without re-judging. Every matching rule applies
 * to an attempt, not just the first.
 */
export interface RedoRule {
  step: RedoStep | null;
  reason: RedoReason;
}

export const DEFAULT_REDO_REASONS: readonly RedoRule[] = [
  { step: null, reason: "rate-limited" },
  { step: null, reason: "wall-clock" },
];

export interface RedoEntry {
  taskId: string;
  arm: Arm;
  n: number;
  /** Every rule that matched, upstream step first. */
  hits: RedoHit[];
  /** Where the stale files went. */
  previousDir: string;
  moved: string[];
  findingsRemoved: number;
}

export interface RedoResult {
  reset: RedoEntry[];
  runLineRemoved: boolean;
}

/** Only the field the decision needs; the rest of the file may predate the schema. */
const StepFailure = z
  .object({
    failureReason: ClaudeFailureReason.nullable().optional(),
    claude: z
      .object({ failureReason: ClaudeFailureReason.optional() })
      .loose()
      .nullable()
      .optional(),
  })
  .loose();

function failureOf(file: string): FailureReason | null {
  let parsed: z.infer<typeof StepFailure> | null;
  try {
    parsed = readCached(file, StepFailure);
  } catch {
    return null;
  }
  if (parsed === null) return null;
  return parsed.failureReason ?? parsed.claude?.failureReason ?? null;
}

/** Only what the acceptance rules read; skipped grades have nothing to redo. */
const TestsGrade = z
  .object({
    tscOk: z.boolean().nullable().optional(),
    vitestOk: z.boolean().nullable().optional(),
    suiteErrors: z.number().optional(),
    skipped: z.boolean().optional(),
  })
  .loose();

/** Every listed acceptance reason the grade in tests.json matches, in rule order. */
function acceptanceRedoReasons(
  file: string,
  rules: readonly RedoRule[],
): AcceptanceRedoReason[] {
  const wanted = rules.flatMap((r) =>
    r.step === "acceptance" ? [r.reason as AcceptanceRedoReason] : [],
  );
  if (wanted.length === 0) return [];
  let grade: z.infer<typeof TestsGrade> | null;
  try {
    grade = readCached(file, TestsGrade);
  } catch {
    return [];
  }
  if (grade === null || grade.skipped === true) return [];
  const hits: Record<AcceptanceRedoReason, boolean> = {
    tsc: grade.tscOk === false,
    vitest: grade.vitestOk === false || (grade.suiteErrors ?? 0) > 0,
    any: true,
  };
  return [...new Set(wanted.filter((r) => hits[r]))];
}

export interface RedoHit {
  step: RedoStep;
  reason: RedoReason;
}

/** Upstream first: a build redo implies everything below it. */
const STEP_ORDER: readonly RedoStep[] = [
  "build",
  "judge",
  "verify",
  "acceptance",
  "record",
];

function byStep(a: { step: RedoStep }, b: { step: RedoStep }): number {
  return STEP_ORDER.indexOf(a.step) - STEP_ORDER.indexOf(b.step);
}

function sortSteps(steps: Iterable<RedoStep>): RedoStep[] {
  return [...new Set(steps)].sort(
    (a, b) => STEP_ORDER.indexOf(a) - STEP_ORDER.indexOf(b),
  );
}

/**
 * Every rule that matches one attempt, upstream step first; empty when none
 * does. All of them apply: an attempt whose judge failed and whose grade is
 * stale gets both redone, so one pass leaves nothing behind.
 */
export function redoHitsFor(
  layout: AttemptLayout,
  rules: readonly RedoRule[],
): RedoHit[] {
  const checks: [RedoStep, string][] = [
    ["build", layout.buildJson],
    ["judge", layout.judgeJson],
    ["verify", layout.verifyJson],
  ];
  const failures = checks.flatMap(([step, file]) => {
    const reason = failureOf(file);
    return reason === null ? [] : [{ step, reason }];
  });
  const hits: RedoHit[] = [];
  for (const f of failures) {
    if (
      rules.some(
        (r) => r.reason === f.reason && (r.step === null || r.step === f.step),
      )
    ) {
      hits.push(f);
    }
  }
  for (const reason of acceptanceRedoReasons(layout.testsJson, rules)) {
    hits.push({ step: "acceptance", reason });
  }
  for (const f of failures) {
    if (rules.some((r) => r.reason === f.reason && r.step === "record")) {
      hits.push({ step: "record", reason: f.reason });
    }
  }
  return hits.sort(byStep);
}

/** The distinct steps of the hits, upstream first. */
export function redoSteps(hits: readonly RedoHit[]): RedoStep[] {
  return sortSteps(hits.map((h) => h.step));
}

/** Files one step owns, plus everything downstream of it. */
function filesOfStep(layout: AttemptLayout, step: RedoStep): string[] {
  if (step === "record") return [layout.attemptJson];
  // The judge already read tests.json, but its findings are doc findings: kept.
  const grading = [
    layout.testsJson,
    layout.vitestJsonPath,
    path.join(layout.dir, "vitest.log"),
    layout.tscOutputPath,
    layout.reinstallLogPath,
  ];
  if (step === "acceptance") return [...grading, layout.attemptJson];
  const verify = [
    layout.verifyJson,
    layout.verifyTranscriptPath,
    layout.verifyStderrPath,
    path.join(layout.dir, "verifier.system.md"),
    layout.attemptJson,
  ];
  const judge = [
    layout.judgeJson,
    layout.judgeTranscriptPath,
    layout.judgeStderrPath,
    path.join(layout.dir, "judge.system.md"),
    ...verify,
  ];
  const build = [
    layout.buildJson,
    layout.transcriptPath,
    layout.sessionJsonlPath,
    layout.stderrPath,
    ...grading,
    layout.metricsJson,
    layout.compactMd,
    layout.dtsDir,
    // The builder wrote into the workspace: prepare it again from the cache.
    layout.prepareJson,
    layout.installLogPath,
    layout.workspaceDir,
    ...judge,
  ];
  return step === "build" ? build : step === "judge" ? judge : verify;
}

/** The union of each step's files and downstream, upstream step first. */
export function filesToReset(
  layout: AttemptLayout,
  steps: readonly RedoStep[],
): string[] {
  const files: string[] = [];
  for (const step of sortSteps(steps)) {
    for (const file of filesOfStep(layout, step)) {
      if (!files.includes(file)) files.push(file);
    }
  }
  return files;
}

function nextPreviousDir(attemptDir: string): string {
  const root = path.join(attemptDir, "previous");
  let n = 1;
  while (existsSync(path.join(root, String(n)))) n += 1;
  return path.join(root, String(n));
}

/** Moves the files aside; returns the names moved. */
export function moveAside(
  layout: AttemptLayout,
  steps: readonly RedoStep[],
): { previousDir: string; moved: string[] } {
  const previousDir = nextPreviousDir(layout.dir);
  const moved: string[] = [];
  for (const file of filesToReset(layout, steps)) {
    if (!existsSync(file)) continue;
    if (file === layout.workspaceDir) {
      rmSync(path.join(file, "node_modules"), { recursive: true, force: true });
    }
    const rel = path.relative(layout.dir, file);
    const target = path.join(previousDir, rel);
    mkdirSync(path.dirname(target), { recursive: true });
    renameSync(file, target);
    moved.push(rel);
  }
  return { previousDir, moved };
}

/** Every `<task>/<arm>/<n>` directory under the run root. */
export function listAttemptDirs(
  run: RunLayout,
): { taskId: string; arm: Arm; n: number }[] {
  if (!existsSync(run.root)) return [];
  const out: { taskId: string; arm: Arm; n: number }[] = [];
  for (const task of readdirSync(run.root, { withFileTypes: true })) {
    if (!task.isDirectory() || task.name.startsWith(".")) continue;
    if (task.name === "docs") continue;
    for (const arm of Arm.options) {
      const armDir = path.join(run.root, task.name, arm);
      if (!existsSync(armDir)) continue;
      for (const d of readdirSync(armDir, { withFileTypes: true })) {
        if (!d.isDirectory() || !/^[1-9]\d*$/.test(d.name)) continue;
        out.push({ taskId: task.name, arm, n: Number(d.name) });
      }
    }
  }
  return out.sort(
    (a, b) =>
      a.taskId.localeCompare(b.taskId) ||
      a.arm.localeCompare(b.arm) ||
      a.n - b.n,
  );
}

export interface RedoOptions {
  reasons?: readonly RedoRule[];
  findingsFile: string;
  runsFile: string;
}

export function redoFailedAttempts(
  run: RunLayout,
  opts: RedoOptions,
): RedoResult {
  const reasons = opts.reasons ?? DEFAULT_REDO_REASONS;
  const reset: RedoEntry[] = [];
  for (const id of listAttemptDirs(run)) {
    const layout = run.attempt(id.taskId, id.arm, id.n);
    const hits = redoHitsFor(layout, reasons);
    if (hits.length === 0) continue;
    const { previousDir, moved } = moveAside(layout, redoSteps(hits));
    const findingsRemoved = removeFindings(opts.findingsFile, run.runId, id);
    reset.push({ ...id, hits, previousDir, moved, findingsRemoved });
  }
  if (reset.length === 0) return { reset, runLineRemoved: false };

  const runLineRemoved = removeRunLine(opts.runsFile, run.runId);
  const record = readCached(run.runJson, RunRecord);
  if (record !== null) {
    const done = new Set(reset.map((r) => `${r.taskId}/${r.arm}/${r.n}`));
    record.attempts = record.attempts.filter(
      (a) => !done.has(`${a.taskId}/${a.arm}/${a.n}`),
    );
    record.finishedAt = null;
    writeFileSync(run.runJson, `${JSON.stringify(record, null, 2)}\n`);
  }
  return { reset, runLineRemoved };
}

/** Drops the attempt's lines; unparseable lines are kept verbatim. */
export function removeFindings(
  file: string,
  runId: string,
  id: { taskId: string; arm: Arm; n: number },
): number {
  if (!existsSync(file)) return 0;
  const { entries, problems } = readEntries(file, FindingRecord);
  const keep = entries.filter(
    (f) =>
      !(
        f.runId === runId &&
        f.taskId === id.taskId &&
        f.arm === id.arm &&
        f.n === id.n
      ),
  );
  const removed = entries.length - keep.length;
  if (removed === 0) return 0;
  if (problems.length > 0) {
    throw new Error(
      `${file} has ${problems.length} unparseable line(s); fix them before --redo-failed rewrites it`,
    );
  }
  writeEntries(file, keep);
  return removed;
}

export function removeRunLine(file: string, runId: string): boolean {
  if (!existsSync(file)) return false;
  const { entries, problems } = readEntries(file, RunRecord);
  const keep = entries.filter((r) => r.runId !== runId);
  if (keep.length === entries.length) return false;
  if (problems.length > 0) {
    throw new Error(
      `${file} has ${problems.length} unparseable line(s); fix them before --redo-failed rewrites it`,
    );
  }
  writeEntries(file, keep);
  return true;
}

const RedoStepName = z.enum([
  "build",
  "acceptance",
  "judge",
  "verify",
  "record",
]);

/** `wall-clock,judge:budget-exhausted,record:budget-exhausted,acceptance:tsc`. */
export function parseRedoReasons(value: string | true | undefined): RedoRule[] {
  if (value === undefined || value === true) return [...DEFAULT_REDO_REASONS];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .map((s): RedoRule => {
      const colon = s.indexOf(":");
      if (colon === -1)
        return { step: null, reason: ClaudeFailureReason.parse(s) };
      const step = RedoStepName.parse(s.slice(0, colon));
      const reason = s.slice(colon + 1);
      return step === "acceptance"
        ? { step, reason: AcceptanceRedoReason.parse(reason) }
        : { step, reason: ClaudeFailureReason.parse(reason) };
    });
}

function describeHits(hits: readonly RedoHit[]): string {
  return hits.map((h) => `${h.step} ${h.reason}`).join(", ");
}

export function describeRedo(result: RedoResult): string[] {
  const lines = result.reset.map(
    (r) =>
      `redo ${r.taskId} ${r.arm}#${r.n}: ${describeHits(r.hits)}; moved ${r.moved.length} file(s) to ${r.previousDir}${r.findingsRemoved > 0 ? `; removed ${r.findingsRemoved} finding(s)` : ""}`,
  );
  if (result.reset.length === 0) lines.push("redo: nothing to reset");
  else if (result.runLineRemoved)
    lines.push("redo: removed the run's RUNS.jsonl line");
  return lines;
}

/** `4 redone (judge rate-limited 2, acceptance tsc 3)`; null when nothing was. */
export function summarizeRedo(result: RedoResult): string | null {
  if (result.reset.length === 0) return null;
  const counts = new Map<string, number>();
  for (const r of result.reset) {
    for (const h of r.hits) {
      const key = `${h.step} ${h.reason}`;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }
  const rules = [...counts.entries()].map(([k, n]) => `${k} ${n}`).join(", ");
  return `${result.reset.length} redone (${rules})`;
}

/** Only what the install check reads; the rest of the file may predate it. */
const PrepareResult = z.object({ installOk: z.boolean().optional() }).loose();

/**
 * The scoped rules that would redo every step of a run that is still failed,
 * read from the same step files `redoHitsFor` matches. Scoped because a bare
 * reason matches any step: `budget-exhausted` in a judge is a failure, but in
 * a build it is a truncation that was graded and judged anyway.
 */
export function pendingRedoRules(run: RunLayout): RedoRule[] {
  const rules = new Map<string, RedoHit>();
  for (const id of listAttemptDirs(run)) {
    const layout = run.attempt(id.taskId, id.arm, id.n);
    const steps: [RedoStep, string][] = [
      ["build", layout.buildJson],
      ["judge", layout.judgeJson],
      ["verify", layout.verifyJson],
    ];
    for (const [step, file] of steps) {
      const reason = failureOf(file);
      if (reason === null) continue;
      if (step === "build" && isTruncation(reason)) continue;
      rules.set(`${step}:${reason}`, { step, reason });
    }
  }
  return [...rules.values()].sort(
    (a, b) => byStep(a, b) || a.reason.localeCompare(b.reason),
  );
}

/** `build:rate-limited,judge:wall-clock`, as `--redo-failed` takes them. */
export function formatRedoRules(rules: readonly RedoRule[]): string {
  return rules
    .map((r) => (r.step === null ? r.reason : `${r.step}:${r.reason}`))
    .join(",");
}

/**
 * The prepare.json of every attempt whose install failed. `--redo-failed` has
 * no rule for these: the file has to go before a resume retries the install.
 */
export function pendingInstallFailures(run: RunLayout): string[] {
  const out: string[] = [];
  for (const id of listAttemptDirs(run)) {
    const layout = run.attempt(id.taskId, id.arm, id.n);
    let prepared: z.infer<typeof PrepareResult> | null;
    try {
      prepared = readCached(layout.prepareJson, PrepareResult);
    } catch {
      continue;
    }
    if (prepared?.installOk === false) out.push(layout.prepareJson);
  }
  return out;
}
