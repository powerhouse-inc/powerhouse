import { TASK_STATUSES } from "../records/task-schema.js";
import type { TaskStatus } from "../records/task-schema.js";

/**
 * 2, 4, 64 and 68 keep their bench:records meaning. The rest name the one
 * thing that stopped the fix line, so a caller can branch without parsing.
 */
export const FIX_EXIT = {
  ok: 0,
  partial: 1,
  corruptFile: 2,
  notFound: 4,
  dirtyTree: 5,
  wrongStatus: 6,
  stale: 7,
  red: 8,
  usage: 64,
  error: 68,
} as const;

export const FIX_USAGE = `Deterministic steps of the bench fix line. Each verb replaces a stretch of
reading, polling or re-parsing an agent would otherwise do a line at a time.

Usage:
  pnpm bench:fix <subcommand> [args]

  gate [T-id]                  records verify, tree cleanliness, the task with its
                               sites, repro, fixes and last note, the cases of every
                               cited benchmark, and whether Postgres answers on 5433;
                               with no id, the next task in the expected status:
                               lowest priority number first, then oldest
  sites <T-id>                 every details.sites[] entry with surrounding source,
                               whether the named symbol is still there, and its callers
  cases <results.json>         every case in a vitest bench results file
  criterion --before <results.json> --case <name> --max-ratio <r>
                               write the pass/fail thresholds and the before numbers
                               to a file, so they demonstrably predate the after-run
  criterion --case <name> (--max-ms <m> | --min-ms <m>)
  criterion --case <name> --over <name> (--max-growth <g> | --min-growth <g>)
                               a bound judged on the after-run alone, for a case no
                               before-run has (a GAP's new arm): an absolute mean, or
                               the case's mean over another case's in the same run
  compare --criterion <file> --after <results.json>
                               judge the after-run against the criterion file
  dist-check                   newest source against newest runtime JS in dist, per
                               workspace package
  ci                           the check-commit checklist against the working tree,
                               logs per step, a table and a coverage statement

  --dir <path>                 gate, sites: directory holding the record files
                               (default: bench)
  --expect <STATUS>            gate: the status the task must have (default: VERIFIED)
  --context <n>                sites: lines of source either side (default: 30)
  --callers <n>                sites: most callers listed per symbol (default: 25)
  --fail-ratio <r>             criterion: at or above this the fix missed; between
                               max and fail is partial (default: none, so above max
                               is a miss)
  --fail-at <v>                criterion: the miss line for a bound, beyond the
                               threshold in the failing direction (default: none)
  --control <name>             criterion: a case the fix must not move; needs
                               --before
  --control-tolerance <f>      criterion: how far the control may move (default: 0.10)
  --out <path>                 criterion: where to write (default:
                               bench/results/criterion.json); ci: the log directory
  --marker <text>              dist-check: text that must appear in the runtime dist
  --package <name>             dist-check: restrict to one workspace package
  --changed <path>             ci: use these paths instead of asking git (repeatable)
  --integration                ci: also run pnpm test:integration
  --json                       machine-readable result on stdout

Statuses: ${TASK_STATUSES.join(", ")}.

Exit codes:
  0   ok, or the criterion was met
  1   the criterion was partially met, or the comparison is inconclusive
  2   a record file does not parse or does not verify
  4   no such task, benchmark or case
  5   the working tree is dirty
  6   the task does not have the expected status
  7   a dist is stale, or the marker is missing from it
  8   a check went red, or the criterion was missed
  64  bad arguments
  68  the command failed`;

export const FIX_SUBCOMMANDS = [
  "gate",
  "sites",
  "cases",
  "criterion",
  "compare",
  "dist-check",
  "ci",
] as const;
export type FixSubcommand = (typeof FIX_SUBCOMMANDS)[number];

export type GateOptions = {
  subcommand: "gate";
  /** Empty means pick the next task in the expected status. */
  taskId: string;
  dir: string;
  expect: TaskStatus;
  json: boolean;
};

export type SitesOptions = {
  subcommand: "sites";
  taskId: string;
  dir: string;
  context: number;
  callers: number;
};

export type CasesOptions = {
  subcommand: "cases";
  path: string;
};

export type RatioCriterionOptions = {
  subcommand: "criterion";
  mode: "ratio";
  before: string;
  caseName: string;
  maxRatio: number;
  /** Undefined means anything above maxRatio is a miss. */
  failRatio: number | undefined;
  /** Empty means no control case. */
  control: string;
  controlTolerance: number;
  out: string;
};

export const BOUND_DIRECTIONS = ["at-most", "at-least"] as const;
export type BoundDirection = (typeof BOUND_DIRECTIONS)[number];

export type BoundCriterionOptions = {
  subcommand: "criterion";
  mode: "bound";
  /** Empty means no before-run; only a control needs one. */
  before: string;
  caseName: string;
  /** Empty means the bound is on the case's absolute mean in ms. */
  over: string;
  direction: BoundDirection;
  threshold: number;
  /** Undefined means anything on the wrong side of threshold is a miss. */
  failAt: number | undefined;
  control: string;
  controlTolerance: number;
  out: string;
};

export type CriterionOptions = RatioCriterionOptions | BoundCriterionOptions;

export type CompareOptions = {
  subcommand: "compare";
  criterion: string;
  after: string;
  json: boolean;
};

export type DistCheckOptions = {
  subcommand: "dist-check";
  marker: string;
  pkg: string;
  json: boolean;
};

export type CiOptions = {
  subcommand: "ci";
  integration: boolean;
  changed: string[];
  /** Empty means a fresh directory under the OS temp dir. */
  out: string;
  json: boolean;
};

export type FixOptions =
  | GateOptions
  | SitesOptions
  | CasesOptions
  | CriterionOptions
  | CompareOptions
  | DistCheckOptions
  | CiOptions;

const VALUE_FLAGS = [
  "--dir",
  "--expect",
  "--context",
  "--callers",
  "--before",
  "--case",
  "--max-ratio",
  "--fail-ratio",
  "--control",
  "--control-tolerance",
  "--max-ms",
  "--min-ms",
  "--max-growth",
  "--min-growth",
  "--over",
  "--fail-at",
  "--out",
  "--criterion",
  "--after",
  "--marker",
  "--package",
  "--changed",
] as const;

type ParsedArgv = {
  positionals: string[];
  values: Map<string, string>;
  changed: string[];
  integration: boolean;
  json: boolean;
};

function splitArgv(argv: string[]): ParsedArgv {
  const parsed: ParsedArgv = {
    positionals: [],
    values: new Map(),
    changed: [],
    integration: false,
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      parsed.json = true;
      continue;
    }
    if (arg === "--integration") {
      parsed.integration = true;
      continue;
    }
    if ((VALUE_FLAGS as readonly string[]).includes(arg)) {
      const value = argv.at(index + 1);
      if (value === undefined) {
        throw new Error(`${arg} needs a value`);
      }
      if (arg === "--changed") {
        parsed.changed.push(value);
      } else if (parsed.values.has(arg)) {
        throw new Error(`${arg} was given twice`);
      } else {
        parsed.values.set(arg, value);
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("--")) {
      throw new Error(`Unknown argument: ${arg}`);
    }
    parsed.positionals.push(arg);
  }
  return parsed;
}

function taskIdFrom(
  parsed: ParsedArgv,
  subcommand: string,
  optional = false,
): string {
  const id = parsed.positionals.at(1);
  if (id === undefined) {
    if (optional) {
      return "";
    }
    throw new Error(`${subcommand} needs a task id, like T-007`);
  }
  if (!/^T-\d{3,}$/.test(id)) {
    throw new Error(`Ids look like T-007, got ${id}`);
  }
  return id;
}

function required(parsed: ParsedArgv, flag: string): string {
  const value = parsed.values.get(flag);
  if (value === undefined) {
    throw new Error(`${flag} is required`);
  }
  return value;
}

function positiveNumber(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${flag} must be a positive number, got ${raw}`);
  }
  return value;
}

function positiveInt(flag: string, raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${flag} must be a positive integer, got ${raw}`);
  }
  return value;
}

function rejectUnused(parsed: ParsedArgv, allowed: readonly string[]): void {
  for (const flag of parsed.values.keys()) {
    if (!allowed.includes(flag)) {
      throw new Error(
        `${flag} does not apply to ${parsed.positionals.at(0) ?? ""}`,
      );
    }
  }
  if (parsed.changed.length > 0 && !allowed.includes("--changed")) {
    throw new Error(
      `--changed does not apply to ${parsed.positionals.at(0) ?? ""}`,
    );
  }
  if (parsed.integration && !allowed.includes("--integration")) {
    throw new Error(
      `--integration does not apply to ${parsed.positionals.at(0) ?? ""}`,
    );
  }
}

const BOUND_FLAGS = [
  "--max-ms",
  "--min-ms",
  "--max-growth",
  "--min-growth",
] as const;

function parseCriterion(parsed: ParsedArgv): CriterionOptions {
  const tolerance = parsed.values.get("--control-tolerance");
  const control = parsed.values.get("--control") ?? "";
  const before = parsed.values.get("--before") ?? "";
  const shared = {
    subcommand: "criterion" as const,
    caseName: required(parsed, "--case"),
    control,
    controlTolerance:
      tolerance === undefined
        ? 0.1
        : positiveNumber("--control-tolerance", tolerance),
    out: parsed.values.get("--out") ?? "bench/results/criterion.json",
  };
  const bounds = BOUND_FLAGS.filter((flag) => parsed.values.has(flag));
  const ratio = parsed.values.get("--max-ratio");

  if (bounds.length === 0) {
    if (ratio === undefined) {
      throw new Error(
        `--max-ratio is required, or one of ${BOUND_FLAGS.join(", ")} for a bound on the after-run alone`,
      );
    }
    for (const flag of ["--over", "--fail-at"]) {
      if (parsed.values.has(flag)) {
        throw new Error(`${flag} applies to a bound, not to --max-ratio`);
      }
    }
    const failRatio = parsed.values.get("--fail-ratio");
    const options: RatioCriterionOptions = {
      ...shared,
      mode: "ratio",
      before: required(parsed, "--before"),
      maxRatio: positiveNumber("--max-ratio", ratio),
      failRatio:
        failRatio === undefined
          ? undefined
          : positiveNumber("--fail-ratio", failRatio),
    };
    if (
      options.failRatio !== undefined &&
      options.failRatio <= options.maxRatio
    ) {
      throw new Error("--fail-ratio must be above --max-ratio");
    }
    return options;
  }

  if (bounds.length > 1 || ratio !== undefined) {
    throw new Error(
      `Give one threshold: --max-ratio or one of ${BOUND_FLAGS.join(", ")}`,
    );
  }
  if (parsed.values.has("--fail-ratio")) {
    throw new Error(
      "--fail-ratio applies to --max-ratio; a bound uses --fail-at",
    );
  }
  const flag = bounds[0];
  const growth = flag === "--max-growth" || flag === "--min-growth";
  const over = parsed.values.get("--over") ?? "";
  if (growth && over === "") {
    throw new Error(
      `${flag} needs --over, the case the growth is measured from`,
    );
  }
  if (!growth && over !== "") {
    throw new Error(`--over needs --max-growth or --min-growth, not ${flag}`);
  }
  if (control !== "" && before === "") {
    throw new Error(
      "--control needs --before, which holds the control's before number",
    );
  }
  const direction: BoundDirection = flag.startsWith("--max")
    ? "at-most"
    : "at-least";
  const threshold = positiveNumber(flag, required(parsed, flag));
  const rawFailAt = parsed.values.get("--fail-at");
  const failAt =
    rawFailAt === undefined
      ? undefined
      : positiveNumber("--fail-at", rawFailAt);
  if (failAt !== undefined && direction === "at-most" && failAt <= threshold) {
    throw new Error(`--fail-at must be above ${flag}`);
  }
  if (failAt !== undefined && direction === "at-least" && failAt >= threshold) {
    throw new Error(`--fail-at must be below ${flag}`);
  }
  return {
    ...shared,
    mode: "bound",
    before,
    over,
    direction,
    threshold,
    failAt,
  };
}

export function parseFixOptions(argv: string[]): FixOptions {
  const parsed = splitArgv(argv);
  const named = parsed.positionals.at(0);
  if (named === undefined) {
    throw new Error("A subcommand is required");
  }
  if (!(FIX_SUBCOMMANDS as readonly string[]).includes(named)) {
    throw new Error(`Unknown subcommand: ${named}`);
  }
  const subcommand = named as FixSubcommand;

  switch (subcommand) {
    case "gate": {
      rejectUnused(parsed, ["--dir", "--expect"]);
      const expect = parsed.values.get("--expect") ?? "VERIFIED";
      if (!(TASK_STATUSES as readonly string[]).includes(expect)) {
        throw new Error(
          `--expect must be one of ${TASK_STATUSES.join(", ")}, got ${expect}`,
        );
      }
      return {
        subcommand,
        taskId: taskIdFrom(parsed, subcommand, true),
        dir: parsed.values.get("--dir") ?? "bench",
        expect: expect as TaskStatus,
        json: parsed.json,
      };
    }
    case "sites": {
      rejectUnused(parsed, ["--dir", "--context", "--callers"]);
      const context = parsed.values.get("--context");
      const callers = parsed.values.get("--callers");
      return {
        subcommand,
        taskId: taskIdFrom(parsed, subcommand),
        dir: parsed.values.get("--dir") ?? "bench",
        context: context === undefined ? 30 : positiveInt("--context", context),
        callers: callers === undefined ? 25 : positiveInt("--callers", callers),
      };
    }
    case "cases": {
      rejectUnused(parsed, []);
      const path = parsed.positionals.at(1);
      if (path === undefined) {
        throw new Error("cases needs the path of a vitest bench results file");
      }
      return { subcommand, path };
    }
    case "criterion": {
      rejectUnused(parsed, [
        "--before",
        "--case",
        "--max-ratio",
        "--fail-ratio",
        "--max-ms",
        "--min-ms",
        "--max-growth",
        "--min-growth",
        "--over",
        "--fail-at",
        "--control",
        "--control-tolerance",
        "--out",
      ]);
      return parseCriterion(parsed);
    }
    case "compare": {
      rejectUnused(parsed, ["--criterion", "--after"]);
      return {
        subcommand,
        criterion: required(parsed, "--criterion"),
        after: required(parsed, "--after"),
        json: parsed.json,
      };
    }
    case "dist-check": {
      rejectUnused(parsed, ["--marker", "--package"]);
      return {
        subcommand,
        marker: parsed.values.get("--marker") ?? "",
        pkg: parsed.values.get("--package") ?? "",
        json: parsed.json,
      };
    }
    case "ci": {
      rejectUnused(parsed, ["--out", "--changed", "--integration"]);
      return {
        subcommand,
        integration: parsed.integration,
        changed: parsed.changed,
        out: parsed.values.get("--out") ?? "",
        json: parsed.json,
      };
    }
  }
}
