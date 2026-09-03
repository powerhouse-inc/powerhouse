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
import { FIX_EXIT } from "./fix-options.js";
import type {
  CasesOptions,
  CompareOptions,
  CriterionOptions,
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
export const Criterion = z.strictObject({
  writtenAt: z.iso.datetime(),
  beforePath: z.string().min(1),
  before: FlatCase,
  maxRatio: z.number().positive(),
  failRatio: z.number().positive().optional(),
  control: z
    .strictObject({ before: FlatCase, tolerance: z.number().positive() })
    .optional(),
});
export type Criterion = z.infer<typeof Criterion>;

export type Verdict = "met" | "partial" | "missed" | "inconclusive";

export type Comparison = {
  verdict: Verdict;
  ratio: number;
  after: FlatCase;
  controlRatio: number | undefined;
  controlAfter: FlatCase | undefined;
  reasons: string[];
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

export function judge(
  criterion: Criterion,
  after: FlatCase,
  controlAfter: FlatCase | undefined,
  afterModifiedAt: Date,
): Comparison {
  const reasons: string[] = [];
  const ratio = after.meanMs / criterion.before.meanMs;
  const controlRatio =
    criterion.control !== undefined && controlAfter !== undefined
      ? controlAfter.meanMs / criterion.control.before.meanMs
      : undefined;

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

  if (afterModifiedAt.getTime() <= Date.parse(criterion.writtenAt)) {
    verdict = "inconclusive";
    reasons.push(
      `the after-run (${afterModifiedAt.toISOString()}) predates the criterion (${criterion.writtenAt}); a criterion written after the number is not a criterion`,
    );
  }
  if (criterion.control !== undefined) {
    if (controlAfter === undefined || controlRatio === undefined) {
      verdict = "inconclusive";
      reasons.push(
        `the control case ${criterion.control.before.name} is missing from the after-run`,
      );
    } else if (Math.abs(controlRatio - 1) > criterion.control.tolerance) {
      verdict = "inconclusive";
      reasons.push(
        `the control ${criterion.control.before.name} moved ${controlRatio.toFixed(3)}x, outside +/-${(criterion.control.tolerance * 100).toFixed(0)}%; the machine was not the same between runs`,
      );
    } else {
      reasons.push(
        `the control ${criterion.control.before.name} held at ${controlRatio.toFixed(3)}x`,
      );
    }
  }

  return { verdict, ratio, after, controlRatio, controlAfter, reasons };
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

export function runCriterion(options: CriterionOptions): CommandResult {
  if (existsSync(options.out)) {
    throw new RecordsError(
      `${options.out} already exists. A criterion is written once; pass --out to name another file`,
      FIX_EXIT.usage,
    );
  }
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
  mkdirSync(dirname(options.out), { recursive: true });
  writeFileSync(options.out, `${JSON.stringify(criterion, null, 2)}\n`);
  const lines = [
    `criterion written to ${options.out} at ${criterion.writtenAt}`,
    `  holds if: ${before.name} mean <= ${(options.maxRatio * before.meanMs).toFixed(4)} ms (${options.maxRatio.toFixed(3)}x of ${ms(before.meanMs)})`,
    options.failRatio === undefined
      ? `  fails if: above that`
      : `  fails if: >= ${(options.failRatio * before.meanMs).toFixed(4)} ms (${options.failRatio.toFixed(3)}x); between is partial`,
  ];
  if (criterion.control !== undefined) {
    lines.push(
      `  control: ${criterion.control.before.name} at ${ms(criterion.control.before.meanMs)} must stay within +/-${(criterion.control.tolerance * 100).toFixed(0)}%`,
    );
  }
  return {
    exit: FIX_EXIT.ok,
    lines,
    data: { out: options.out, criterion },
  };
}

export function readCriterion(path: string): Criterion {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new RecordsError(
      `Could not read the criterion ${path}: ${error instanceof Error ? error.message : String(error)}`,
      FIX_EXIT.notFound,
    );
  }
  const parsed = Criterion.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new RecordsError(
      `${path} is not a criterion file: ${parsed.error.issues[0]?.message ?? "unknown shape"}`,
      FIX_EXIT.error,
    );
  }
  return parsed.data;
}

export function runCompare(options: CompareOptions): CommandResult {
  const criterion = readCriterion(options.criterion);
  const cases = readReport(options.after);
  const after = findCase(cases, criterion.before.name);
  const controlAfter =
    criterion.control === undefined
      ? undefined
      : cases.find((item) => item.name === criterion.control?.before.name);
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
