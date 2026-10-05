import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { z } from "zod";
import {
  suiteLabel,
  suitesFromVitest,
  VitestBenchReport,
} from "../records/from-vitest.js";
import { RecordsError } from "../records/jsonl-store.js";
import type { CommandResult } from "../records/records-commands.js";
import { BOUND_DIRECTIONS, FIX_EXIT } from "./fix-options.js";
import type {
  BoundCriterionOptions,
  CasesOptions,
  CompareOptions,
  CriterionOptions,
  RatioCriterionOptions,
} from "./fix-options.js";

export const FlatCase = z.strictObject({
  suite: z.string().min(1),
  name: z.string().min(1),
  meanMs: z.number().nonnegative(),
  hz: z.number().nonnegative(),
  rmePct: z.number().nonnegative(),
  sampleCount: z.int().nonnegative(),
});
export type FlatCase = z.infer<typeof FlatCase>;

/**
 * The thresholds and the before numbers together, timestamped, so the
 * comparison can show the criterion predates the run it judges.
 */
const Control = z.strictObject({
  before: FlatCase,
  tolerance: z.number().positive(),
});
type Control = z.infer<typeof Control>;

export const Criterion = z.strictObject({
  writtenAt: z.iso.datetime(),
  beforePath: z.string().min(1),
  before: FlatCase,
  maxRatio: z.number().positive(),
  failRatio: z.number().positive().optional(),
  control: Control.optional(),
});
export type Criterion = z.infer<typeof Criterion>;

/**
 * A threshold on the after-run alone, for a case no before-run has. With
 * `over`, the measure is the case's mean divided by that case's mean in the
 * same run; without it, the case's mean in ms.
 */
export const BoundCriterion = z.strictObject({
  kind: z.literal("bound"),
  writtenAt: z.iso.datetime(),
  caseName: z.string().min(1),
  over: z.string().min(1).optional(),
  direction: z.enum(BOUND_DIRECTIONS),
  threshold: z.number().positive(),
  failAt: z.number().positive().optional(),
  beforePath: z.string().min(1).optional(),
  control: Control.optional(),
});
export type BoundCriterion = z.infer<typeof BoundCriterion>;

export const CriterionFile = z.union([BoundCriterion, Criterion]);
export type CriterionFile = z.infer<typeof CriterionFile>;

export type Verdict = "met" | "partial" | "missed" | "inconclusive";

export type Comparison = {
  verdict: Verdict;
  ratio: number;
  after: FlatCase;
  controlRatio: number | undefined;
  controlAfter: FlatCase | undefined;
  reasons: string[];
};

export type BoundComparison = {
  verdict: Verdict;
  measure: number;
  after: FlatCase;
  overAfter: FlatCase | undefined;
  controlRatio: number | undefined;
  controlAfter: FlatCase | undefined;
  reasons: string[];
};

type Guarded = {
  verdict: Verdict;
  controlRatio: number | undefined;
};

export function flattenReport(report: VitestBenchReport): FlatCase[] {
  const flat: FlatCase[] = [];
  for (const suite of suitesFromVitest(report)) {
    for (const item of suite.cases) {
      flat.push({
        suite: suiteLabel(suite.fullName),
        name: item.name,
        meanMs: item.meanMs,
        hz: item.hz,
        rmePct: item.rmePct,
        sampleCount: item.sampleCount,
      });
    }
  }
  return flat;
}

export function readReport(path: string): FlatCase[] {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new RecordsError(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}`,
      FIX_EXIT.notFound,
    );
  }
  const parsed = VitestBenchReport.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new RecordsError(
      `${path} is not a vitest bench results file: ${parsed.error.issues[0]?.message ?? "unknown shape"}`,
      FIX_EXIT.error,
    );
  }
  return flattenReport(parsed.data);
}

/** An exact name wins; otherwise a substring that names exactly one case. */
export function findCase(cases: FlatCase[], query: string): FlatCase {
  const exact = cases.filter((item) => item.name === query);
  if (exact.length === 1) {
    return exact[0];
  }
  if (exact.length > 1) {
    throw new RecordsError(
      `${query} names ${String(exact.length)} cases across suites: ${exact.map((item) => item.suite).join("; ")}. Qualify it as "<suite> :: <name>"`,
      FIX_EXIT.usage,
    );
  }
  const qualified = cases.filter(
    (item) => `${item.suite} :: ${item.name}` === query,
  );
  if (qualified.length === 1) {
    return qualified[0];
  }
  const needle = query.toLowerCase();
  const loose = cases.filter((item) =>
    item.name.toLowerCase().includes(needle),
  );
  if (loose.length === 1) {
    return loose[0];
  }
  if (loose.length === 0) {
    throw new RecordsError(
      `No case matches ${query}. Cases: ${cases.map((item) => item.name).join(" | ")}`,
      FIX_EXIT.notFound,
    );
  }
  throw new RecordsError(
    `${query} is ambiguous: ${loose.map((item) => item.name).join(" | ")}`,
    FIX_EXIT.usage,
  );
}

function ms(value: number): string {
  return `${value.toFixed(4)} ms`;
}

export function formatCases(cases: FlatCase[]): string[] {
  const lines: string[] = [];
  let suite = "";
  for (const item of cases) {
    if (item.suite !== suite) {
      suite = item.suite;
      lines.push(suite);
    }
    lines.push(
      `  ${item.name} | mean ${ms(item.meanMs)} | hz ${item.hz.toFixed(2)} | rme ${item.rmePct.toFixed(2)}% | n ${String(item.sampleCount)}`,
    );
  }
  return lines;
}

/** The checks every verdict passes through: the timestamp, then the control. */
function guard(
  judged: Verdict,
  writtenAt: string,
  control: Control | undefined,
  controlAfter: FlatCase | undefined,
  afterModifiedAt: Date,
  reasons: string[],
): Guarded {
  let verdict = judged;
  const controlRatio =
    control !== undefined && controlAfter !== undefined
      ? controlAfter.meanMs / control.before.meanMs
      : undefined;
  if (afterModifiedAt.getTime() <= Date.parse(writtenAt)) {
    verdict = "inconclusive";
    reasons.push(
      `the after-run (${afterModifiedAt.toISOString()}) predates the criterion (${writtenAt}); a criterion written after the number is not a criterion`,
    );
  }
  if (control !== undefined) {
    if (controlAfter === undefined || controlRatio === undefined) {
      verdict = "inconclusive";
      reasons.push(
        `the control case ${control.before.name} is missing from the after-run`,
      );
    } else if (Math.abs(controlRatio - 1) > control.tolerance) {
      verdict = "inconclusive";
      reasons.push(
        `the control ${control.before.name} moved ${controlRatio.toFixed(3)}x, outside +/-${(control.tolerance * 100).toFixed(0)}%; the machine was not the same between runs`,
      );
    } else {
      reasons.push(
        `the control ${control.before.name} held at ${controlRatio.toFixed(3)}x`,
      );
    }
  }
  return { verdict, controlRatio };
}

export function judge(
  criterion: Criterion,
  after: FlatCase,
  controlAfter: FlatCase | undefined,
  afterModifiedAt: Date,
): Comparison {
  const reasons: string[] = [];
  const ratio = after.meanMs / criterion.before.meanMs;

  let verdict: Verdict;
  if (ratio <= criterion.maxRatio) {
    verdict = "met";
    reasons.push(
      `${ratio.toFixed(3)}x is at or under the ${criterion.maxRatio.toFixed(3)}x threshold`,
    );
  } else if (criterion.failRatio !== undefined && ratio < criterion.failRatio) {
    verdict = "partial";
    reasons.push(
      `${ratio.toFixed(3)}x is between the ${criterion.maxRatio.toFixed(3)}x threshold and the ${criterion.failRatio.toFixed(3)}x miss line`,
    );
  } else {
    verdict = "missed";
    reasons.push(
      criterion.failRatio === undefined
        ? `${ratio.toFixed(3)}x is above the ${criterion.maxRatio.toFixed(3)}x threshold`
        : `${ratio.toFixed(3)}x is at or above the ${criterion.failRatio.toFixed(3)}x miss line`,
    );
  }

  const guarded = guard(
    verdict,
    criterion.writtenAt,
    criterion.control,
    controlAfter,
    afterModifiedAt,
    reasons,
  );
  return {
    verdict: guarded.verdict,
    ratio,
    after,
    controlRatio: guarded.controlRatio,
    controlAfter,
    reasons,
  };
}

export function verdictExit(verdict: Verdict): number {
  switch (verdict) {
    case "met":
      return FIX_EXIT.ok;
    case "partial":
    case "inconclusive":
      return FIX_EXIT.partial;
    case "missed":
      return FIX_EXIT.red;
  }
}

export function formatComparison(
  criterion: Criterion,
  comparison: Comparison,
  afterPath: string,
): string[] {
  const lines = [
    `criterion written ${criterion.writtenAt}: ${criterion.before.name} mean <= ${criterion.maxRatio.toFixed(3)}x before${criterion.failRatio === undefined ? "" : `, missed at >= ${criterion.failRatio.toFixed(3)}x`}`,
    `before (${criterion.beforePath}): ${ms(criterion.before.meanMs)} | rme ${criterion.before.rmePct.toFixed(2)}% | n ${String(criterion.before.sampleCount)}`,
    `after  (${afterPath}): ${ms(comparison.after.meanMs)} | rme ${comparison.after.rmePct.toFixed(2)}% | n ${String(comparison.after.sampleCount)}`,
    `ratio: ${comparison.ratio.toFixed(3)}x (${((1 - comparison.ratio) * 100).toFixed(1)}% faster)`,
  ];
  if (
    criterion.control !== undefined &&
    comparison.controlAfter !== undefined
  ) {
    lines.push(
      `control ${criterion.control.before.name}: ${ms(criterion.control.before.meanMs)} -> ${ms(comparison.controlAfter.meanMs)} (${(comparison.controlRatio ?? 0).toFixed(3)}x)`,
    );
  }
  lines.push(...comparison.reasons.map((reason) => `  - ${reason}`));
  lines.push(`verdict: ${comparison.verdict.toUpperCase()}`);
  return lines;
}

export function runCases(options: CasesOptions): CommandResult {
  const cases = readReport(options.path);
  return {
    exit: FIX_EXIT.ok,
    lines: formatCases(cases),
    data: { path: options.path, cases },
  };
}

function refuseExisting(out: string): void {
  if (existsSync(out)) {
    throw new RecordsError(
      `${out} already exists. A criterion is written once; pass --out to name another file`,
      FIX_EXIT.usage,
    );
  }
}

function writeCriterion(out: string, criterion: CriterionFile): void {
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(criterion, null, 2)}\n`);
}

function controlLine(control: Control): string {
  return `  control: ${control.before.name} at ${ms(control.before.meanMs)} must stay within +/-${(control.tolerance * 100).toFixed(0)}%`;
}

function runRatioCriterion(options: RatioCriterionOptions): CommandResult {
  const cases = readReport(options.before);
  const before = findCase(cases, options.caseName);
  const criterion: Criterion = {
    writtenAt: new Date().toISOString(),
    beforePath: options.before,
    before,
    maxRatio: options.maxRatio,
  };
  if (options.failRatio !== undefined) {
    criterion.failRatio = options.failRatio;
  }
  if (options.control !== "") {
    criterion.control = {
      before: findCase(cases, options.control),
      tolerance: options.controlTolerance,
    };
  }
  writeCriterion(options.out, criterion);
  const lines = [
    `criterion written to ${options.out} at ${criterion.writtenAt}`,
    `  holds if: ${before.name} mean <= ${(options.maxRatio * before.meanMs).toFixed(4)} ms (${options.maxRatio.toFixed(3)}x of ${ms(before.meanMs)})`,
    options.failRatio === undefined
      ? `  fails if: above that`
      : `  fails if: >= ${(options.failRatio * before.meanMs).toFixed(4)} ms (${options.failRatio.toFixed(3)}x); between is partial`,
  ];
  if (criterion.control !== undefined) {
    lines.push(controlLine(criterion.control));
  }
  return {
    exit: FIX_EXIT.ok,
    lines,
    data: { out: options.out, criterion },
  };
}

function boundValue(criterion: BoundCriterion, value: number): string {
  return criterion.over === undefined ? ms(value) : `${value.toFixed(3)}x`;
}

function boundMeasureLabel(criterion: BoundCriterion): string {
  return criterion.over === undefined
    ? `${criterion.caseName} mean`
    : `${criterion.caseName} mean / ${criterion.over} mean`;
}

function boundOperator(criterion: BoundCriterion): string {
  return criterion.direction === "at-most" ? "<=" : ">=";
}

function missOperator(criterion: BoundCriterion): string {
  return criterion.direction === "at-most" ? ">=" : "<=";
}

function runBoundCriterion(options: BoundCriterionOptions): CommandResult {
  const criterion: BoundCriterion = {
    kind: "bound",
    writtenAt: new Date().toISOString(),
    caseName: options.caseName,
    direction: options.direction,
    threshold: options.threshold,
  };
  if (options.over !== "") {
    criterion.over = options.over;
  }
  if (options.failAt !== undefined) {
    criterion.failAt = options.failAt;
  }
  if (options.before !== "") {
    criterion.beforePath = options.before;
  }
  if (options.control !== "") {
    criterion.control = {
      before: findCase(readReport(options.before), options.control),
      tolerance: options.controlTolerance,
    };
  }
  writeCriterion(options.out, criterion);
  const lines = [
    `criterion written to ${options.out} at ${criterion.writtenAt}`,
    `  holds if: ${boundMeasureLabel(criterion)} ${boundOperator(criterion)} ${boundValue(criterion, criterion.threshold)} in the after-run`,
    criterion.failAt === undefined
      ? `  fails if: the other side of that`
      : `  fails if: ${missOperator(criterion)} ${boundValue(criterion, criterion.failAt)}; between is partial`,
    `  judged on the after-run alone; the case need not exist in any before-run`,
  ];
  if (criterion.control !== undefined) {
    lines.push(controlLine(criterion.control));
  }
  return {
    exit: FIX_EXIT.ok,
    lines,
    data: { out: options.out, criterion },
  };
}

export function runCriterion(options: CriterionOptions): CommandResult {
  refuseExisting(options.out);
  return options.mode === "ratio"
    ? runRatioCriterion(options)
    : runBoundCriterion(options);
}

export function judgeBound(
  criterion: BoundCriterion,
  after: FlatCase,
  overAfter: FlatCase | undefined,
  controlAfter: FlatCase | undefined,
  afterModifiedAt: Date,
): BoundComparison {
  const reasons: string[] = [];
  if (criterion.over !== undefined && overAfter === undefined) {
    throw new RecordsError(
      `The criterion measures growth over ${criterion.over}, but no over case was given`,
      FIX_EXIT.error,
    );
  }
  const measure =
    overAfter === undefined ? after.meanMs : after.meanMs / overAfter.meanMs;
  const shown = boundValue(criterion, measure);
  const threshold = boundValue(criterion, criterion.threshold);
  const atMost = criterion.direction === "at-most";
  const holds = atMost
    ? measure <= criterion.threshold
    : measure >= criterion.threshold;
  const short =
    criterion.failAt !== undefined &&
    (atMost ? measure < criterion.failAt : measure > criterion.failAt);

  let verdict: Verdict;
  if (holds) {
    verdict = "met";
    reasons.push(
      `${shown} is at or ${atMost ? "under" : "over"} the ${threshold} threshold`,
    );
  } else if (short && criterion.failAt !== undefined) {
    verdict = "partial";
    reasons.push(
      `${shown} is between the ${threshold} threshold and the ${boundValue(criterion, criterion.failAt)} miss line`,
    );
  } else {
    verdict = "missed";
    reasons.push(
      criterion.failAt === undefined
        ? `${shown} is ${atMost ? "above" : "below"} the ${threshold} threshold`
        : `${shown} is at or ${atMost ? "above" : "below"} the ${boundValue(criterion, criterion.failAt)} miss line`,
    );
  }

  const guarded = guard(
    verdict,
    criterion.writtenAt,
    criterion.control,
    controlAfter,
    afterModifiedAt,
    reasons,
  );
  return {
    verdict: guarded.verdict,
    measure,
    after,
    overAfter,
    controlRatio: guarded.controlRatio,
    controlAfter,
    reasons,
  };
}

export function formatBoundComparison(
  criterion: BoundCriterion,
  comparison: BoundComparison,
  afterPath: string,
): string[] {
  const miss =
    criterion.failAt === undefined
      ? ""
      : `, missed at ${missOperator(criterion)} ${boundValue(criterion, criterion.failAt)}`;
  const lines = [
    `criterion written ${criterion.writtenAt}: ${boundMeasureLabel(criterion)} ${boundOperator(criterion)} ${boundValue(criterion, criterion.threshold)}${miss} (after-run only)`,
    `after  (${afterPath}): ${comparison.after.name} ${ms(comparison.after.meanMs)} | rme ${comparison.after.rmePct.toFixed(2)}% | n ${String(comparison.after.sampleCount)}`,
  ];
  if (comparison.overAfter !== undefined) {
    lines.push(
      `over   (${afterPath}): ${comparison.overAfter.name} ${ms(comparison.overAfter.meanMs)} | rme ${comparison.overAfter.rmePct.toFixed(2)}% | n ${String(comparison.overAfter.sampleCount)}`,
      `growth: ${comparison.measure.toFixed(3)}x`,
    );
  }
  if (
    criterion.control !== undefined &&
    comparison.controlAfter !== undefined
  ) {
    lines.push(
      `control ${criterion.control.before.name}: ${ms(criterion.control.before.meanMs)} -> ${ms(comparison.controlAfter.meanMs)} (${(comparison.controlRatio ?? 0).toFixed(3)}x)`,
    );
  }
  lines.push(...comparison.reasons.map((reason) => `  - ${reason}`));
  lines.push(`verdict: ${comparison.verdict.toUpperCase()}`);
  return lines;
}

export function readCriterion(path: string): CriterionFile {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new RecordsError(
      `Could not read the criterion ${path}: ${error instanceof Error ? error.message : String(error)}`,
      FIX_EXIT.notFound,
    );
  }
  const parsed = CriterionFile.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new RecordsError(
      `${path} is not a criterion file: ${parsed.error.issues[0]?.message ?? "unknown shape"}`,
      FIX_EXIT.error,
    );
  }
  return parsed.data;
}

function compareBound(
  criterion: BoundCriterion,
  options: CompareOptions,
  cases: FlatCase[],
  controlAfter: FlatCase | undefined,
): CommandResult {
  const after = findCase(cases, criterion.caseName);
  const overAfter =
    criterion.over === undefined ? undefined : findCase(cases, criterion.over);
  const comparison = judgeBound(
    criterion,
    after,
    overAfter,
    controlAfter,
    statSync(options.after).mtime,
  );
  return {
    exit: verdictExit(comparison.verdict),
    lines: formatBoundComparison(criterion, comparison, options.after),
    data: {
      criterion: options.criterion,
      after: options.after,
      verdict: comparison.verdict,
      measure: comparison.measure,
      controlRatio: comparison.controlRatio ?? null,
      reasons: comparison.reasons,
    },
  };
}

export function runCompare(options: CompareOptions): CommandResult {
  const criterion = readCriterion(options.criterion);
  const cases = readReport(options.after);
  const controlAfter =
    criterion.control === undefined
      ? undefined
      : cases.find((item) => item.name === criterion.control?.before.name);
  if ("kind" in criterion) {
    return compareBound(criterion, options, cases, controlAfter);
  }
  const after = findCase(cases, criterion.before.name);
  const comparison = judge(
    criterion,
    after,
    controlAfter,
    statSync(options.after).mtime,
  );
  return {
    exit: verdictExit(comparison.verdict),
    lines: formatComparison(criterion, comparison, options.after),
    data: {
      criterion: options.criterion,
      after: options.after,
      verdict: comparison.verdict,
      ratio: comparison.ratio,
      controlRatio: comparison.controlRatio ?? null,
      reasons: comparison.reasons,
    },
  };
}
