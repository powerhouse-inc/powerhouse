/**
 * `resume --redo-failed`: put attempts that failed for infrastructure reasons
 * back to the step that failed, so the idempotent workflow redoes them. Nothing
 * is deleted: the step's outputs and everything downstream move to
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
 * re-grades and re-records without re-judging.
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
  step: RedoStep;
  reason: RedoReason;
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

function acceptanceRedoReason(
  file: string,
  rules: readonly RedoRule[],
): AcceptanceRedoReason | null {
  const wanted = rules.flatMap((r) =>
    r.step === "acceptance" ? [r.reason as AcceptanceRedoReason] : [],
  );
  if (wanted.length === 0) return null;
  let grade: z.infer<typeof TestsGrade> | null;
  try {
    grade = readCached(file, TestsGrade);
  } catch {
    return null;
  }
  if (grade === null || grade.skipped === true) return null;
  const hits: Record<AcceptanceRedoReason, boolean> = {
    tsc: grade.tscOk === false,
    vitest: grade.vitestOk === false || (grade.suiteErrors ?? 0) > 0,
    any: true,
  };
  return wanted.find((r) => hits[r]) ?? null;
}

/**
 * The step to redo for one attempt, or null when no rule matches a failure.
 * A step redo wins over an `acceptance:` match, which wins over a `record:`
 * match, since each re-records anyway.
 */
export function redoStepFor(
  layout: AttemptLayout,
  rules: readonly RedoRule[],
): { step: RedoStep; reason: RedoReason } | null {
  const checks: [RedoStep, string][] = [
    ["build", layout.buildJson],
    ["judge", layout.judgeJson],
    ["verify", layout.verifyJson],
  ];
  const failures = checks.flatMap(([step, file]) => {
    const reason = failureOf(file);
    return reason === null ? [] : [{ step, reason }];
  });
  for (const f of failures) {
    if (
      rules.some(
        (r) => r.reason === f.reason && (r.step === null || r.step === f.step),
      )
    ) {
      return f;
    }
  }
  const graded = acceptanceRedoReason(layout.testsJson, rules);
  if (graded !== null) return { step: "acceptance", reason: graded };
  for (const f of failures) {
    if (rules.some((r) => r.reason === f.reason && r.step === "record")) {
      return { step: "record", reason: f.reason };
    }
  }
  return null;
}

/** Files each step owns, plus everything downstream of it. */
export function filesToReset(layout: AttemptLayout, step: RedoStep): string[] {
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

function nextPreviousDir(attemptDir: string): string {
  const root = path.join(attemptDir, "previous");
  let n = 1;
  while (existsSync(path.join(root, String(n)))) n += 1;
  return path.join(root, String(n));
}

/** Moves the files aside; returns the names moved. */
export function moveAside(
  layout: AttemptLayout,
  step: RedoStep,
): { previousDir: string; moved: string[] } {
  const previousDir = nextPreviousDir(layout.dir);
  const moved: string[] = [];
  for (const file of filesToReset(layout, step)) {
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
    const hit = redoStepFor(layout, reasons);
    if (hit === null) continue;
    const { previousDir, moved } = moveAside(layout, hit.step);
    const findingsRemoved = removeFindings(opts.findingsFile, run.runId, id);
    reset.push({ ...id, ...hit, previousDir, moved, findingsRemoved });
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

export function describeRedo(result: RedoResult): string[] {
  const lines = result.reset.map(
    (r) =>
      `redo ${r.taskId} ${r.arm}#${r.n}: ${r.step} ${r.reason}; moved ${r.moved.length} file(s) to ${r.previousDir}${r.findingsRemoved > 0 ? `; removed ${r.findingsRemoved} finding(s)` : ""}`,
  );
  if (result.reset.length === 0) lines.push("redo: nothing to reset");
  else if (result.runLineRemoved)
    lines.push("redo: removed the run's RUNS.jsonl line");
  return lines;
}
