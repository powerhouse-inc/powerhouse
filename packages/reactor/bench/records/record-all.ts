import { BENCH_TARGETS } from "./from-vitest.js";
import type { BenchTarget } from "./from-vitest.js";

export const RECORD_ALL_EXIT = {
  ok: 0,
  someFailed: 1,
  dirtyTree: 2,
  usage: 64,
} as const;

export const RECORD_ALL_USAGE = `Runs the reactor benchmarks and appends each result to the record, one
benchmark at a time.

Usage:
  pnpm bench:record [benchmark...]

  benchmark      one or more of ${BENCH_TARGETS.map((t) => t.name).join(", ")}.
                 With none named, every one of them runs.

  --allow-dirty  record against a working tree with uncommitted changes
  --list         print the plan and exit without running anything

They run serially and never in parallel: these benchmarks share a machine, and
two of them competing for it measure each other. Recording is a separate step
from running - the runner writes its own JSON, and this converts and appends
it - so a benchmark you run yourself still records nothing.

A dirty tree is refused. Each record carries the commit it ran against, and on
a dirty tree that sha names code that did not run.

Expect this to take a while. sync alone is about nine minutes, and cache boots
PGlite inside every measured iteration.

Exit codes:
  0   every benchmark ran and was recorded
  1   at least one failed; the rest were still recorded
  2   the working tree is dirty
  64  bad arguments`;

export type RecordAllOptions = {
  /** In the table's own order, whatever order the caller named them in. */
  targets: BenchTarget[];
  allowDirty: boolean;
  listOnly: boolean;
};

/** Parses the caller's arguments, or throws with what is wrong. */
export function parseRecordAllOptions(argv: string[]): RecordAllOptions {
  const named: string[] = [];
  let allowDirty = false;
  let listOnly = false;

  for (const argument of argv) {
    if (argument === "--allow-dirty") {
      allowDirty = true;
      continue;
    }
    if (argument === "--list") {
      listOnly = true;
      continue;
    }
    if (argument.startsWith("--")) {
      throw new Error(`Unknown argument: ${argument}`);
    }
    if (named.includes(argument)) {
      throw new Error(`${argument} was named twice`);
    }
    named.push(argument);
  }

  for (const name of named) {
    if (!BENCH_TARGETS.some((target) => target.name === name)) {
      throw new Error(
        `Unknown benchmark: ${name}. One of ${BENCH_TARGETS.map((t) => t.name).join(", ")}`,
      );
    }
  }

  // Table order rather than argv order, so two callers asking for the same set
  // get the same run and the same reading of it.
  const targets =
    named.length === 0
      ? [...BENCH_TARGETS]
      : BENCH_TARGETS.filter((target) => named.includes(target.name));

  return { targets, allowDirty, listOnly };
}

export type TargetOutcome = {
  target: string;
  status: "recorded" | "failed";
  /** The B-id, when one was allocated. */
  id: string;
  seconds: number;
  detail: string;
};

/** A partial run has to be obvious, so the summary names what did not happen. */
export function summarise(outcomes: TargetOutcome[]): {
  lines: string[];
  exit: number;
} {
  const lines = [
    "",
    "| Benchmark | Result | Record | Seconds |",
    "|-----------|--------|--------|---------|",
  ];
  for (const outcome of outcomes) {
    const record = outcome.id === "" ? "-" : outcome.id;
    lines.push(
      `| ${outcome.target} | ${outcome.status} | ${record} | ${outcome.seconds.toFixed(1)} |`,
    );
  }

  const failed = outcomes.filter((outcome) => outcome.status === "failed");
  if (failed.length > 0) {
    lines.push("");
    for (const outcome of failed) {
      lines.push(`${outcome.target} failed: ${outcome.detail}`);
    }
    lines.push(
      "",
      `${outcomes.length - failed.length} of ${outcomes.length} recorded. The rest of the run stands; nothing was retried.`,
    );
  }

  return {
    lines,
    exit: failed.length > 0 ? RECORD_ALL_EXIT.someFailed : RECORD_ALL_EXIT.ok,
  };
}
