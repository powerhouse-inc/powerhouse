import { BenchmarkEntry } from "../records/benchmark-schema.js";
import type { BenchmarkEntry as Benchmark } from "../records/benchmark-schema.js";
import { suiteLabel } from "../records/from-vitest.js";
import { RecordsError } from "../records/jsonl-store.js";
import { runRecordsCommand } from "../records/records-commands.js";
import type { CommandIo, CommandResult } from "../records/records-commands.js";
import { TaskEntry } from "../records/task-schema.js";
import type { CodeRef, TaskEntry as Task } from "../records/task-schema.js";
import { FIX_EXIT } from "./fix-options.js";
import type { GateOptions } from "./fix-options.js";
import {
  git,
  nonEmptyLines,
  POSTGRES_PORT,
  probePort,
  repoRoot,
} from "./repo.js";

export type GateReport = {
  taskId: string;
  expect: string;
  verifyExit: number;
  verifyLines: string[];
  dirty: string[];
  task: Task | undefined;
  taskProblem: string;
  benchmarks: Benchmark[];
  postgres: "reachable" | "unreachable";
};

const RECORDS_IO: CommandIo = {
  readInput: () => {
    throw new Error("gate never reads an entry");
  },
  now: () => new Date().toISOString(),
};

/** Every check runs and reports; the first refusal in this order decides the exit. */
export function gateExit(report: GateReport): {
  exit: number;
  refusal: string;
} {
  if (report.verifyExit !== 0) {
    return {
      exit: FIX_EXIT.corruptFile,
      refusal: "a record file does not verify; print it, do not repair",
    };
  }
  if (report.task === undefined) {
    return { exit: FIX_EXIT.notFound, refusal: report.taskProblem };
  }
  if (report.dirty.length > 0) {
    return {
      exit: FIX_EXIT.dirtyTree,
      refusal: `the working tree is dirty (${String(report.dirty.length)} paths); the fix diff has to stand alone`,
    };
  }
  if (report.task.status !== report.expect) {
    return {
      exit: FIX_EXIT.wrongStatus,
      refusal: `${report.taskId} is ${report.task.status}, not ${report.expect}`,
    };
  }
  return { exit: FIX_EXIT.ok, refusal: "" };
}

function describeSite(site: CodeRef): string {
  return `${site.file}${site.line === undefined ? "" : `:${String(site.line)}`}${site.symbol === undefined ? "" : ` ${site.symbol}`}`;
}

export function formatBenchmark(entry: Benchmark): string[] {
  const lines = [
    `evidence ${entry.id} (${entry.kind}, recorded ${entry.recordedAt} at ${entry.environment.reactorSha}): ${entry.title}`,
  ];
  if (entry.kind !== "micro") {
    lines.push(
      `  concurrency payload; pnpm bench:records show ${entry.id} for the numbers`,
    );
    return lines;
  }
  for (const suite of entry.results.suites) {
    lines.push(`  ${suiteLabel(suite.fullName)}`);
    for (const item of suite.cases) {
      lines.push(
        `    ${item.name} | mean ${item.meanMs.toFixed(4)} ms | hz ${item.hz.toFixed(2)} | rme ${item.rmePct.toFixed(2)}% | n ${String(item.sampleCount)}`,
      );
    }
  }
  return lines;
}

export function formatTask(task: Task): string[] {
  const lines = [
    `task ${task.id} ${task.kind} P${String(task.priority)} area=${task.area} status=${task.status}`,
    `  title: ${task.title}`,
    `  evidence: ${task.evidence.length > 0 ? task.evidence.join(", ") : "none"}`,
  ];
  if (task.kind === "DEFECT") {
    lines.push("  sites:");
    lines.push(
      ...task.details.sites.map((site) => `    ${describeSite(site)}`),
    );
    lines.push(`  repro: ${task.details.repro}`);
    lines.push(`  observed: ${task.details.observed}`);
    lines.push(`  expected: ${task.details.expected}`);
    if (task.details.magnitude !== undefined) {
      lines.push(`  magnitude: ${task.details.magnitude}`);
    }
    lines.push("  fixes:");
    for (const fix of task.details.fixes) {
      lines.push(
        `    ${String(fix.rank)}. [${fix.cost}] ${fix.summary} -> ${fix.expectedEffect}${fix.risk === undefined ? "" : ` (risk: ${fix.risk})`}`,
      );
    }
  } else if (task.kind === "HARNESS") {
    lines.push("  sites:");
    lines.push(
      ...task.details.sites.map((site) => `    ${describeSite(site)}`),
    );
    lines.push(`  defect: ${task.details.defect}`);
    lines.push(`  bias: ${task.details.biasDirection}`);
    lines.push(
      `  invalidates: ${task.details.invalidates.length > 0 ? task.details.invalidates.join(", ") : "none"}`,
    );
    lines.push(`  remedy: ${task.details.remedy}`);
  } else {
    lines.push(`  question: ${task.details.question}`);
    lines.push(`  experiment: ${task.details.experiment}`);
    lines.push(`  why it matters: ${task.details.whyItMatters}`);
  }
  lines.push("  history:");
  for (const event of task.history) {
    lines.push(
      `    ${event.at} ${event.status}${event.by === undefined ? "" : ` by ${event.by}`}${event.commit === undefined ? "" : ` at ${event.commit}`}${event.evidence.length > 0 ? ` [${event.evidence.join(", ")}]` : ""}`,
    );
  }
  const last = task.history.at(-1);
  if (last?.note !== undefined) {
    lines.push(
      `  last note (${last.status}${last.by === undefined ? "" : `, ${last.by}`}):`,
    );
    lines.push(`    ${last.note}`);
  }
  return lines;
}

export function formatGate(report: GateReport): string[] {
  const lines: string[] = [];
  if (report.verifyExit === 0) {
    lines.push(`records: ${report.verifyLines.join("; ")}`);
  } else {
    lines.push(`records: FAILED (exit ${String(report.verifyExit)})`);
    lines.push(...report.verifyLines.map((line) => `  ${line}`));
  }
  if (report.dirty.length === 0) {
    lines.push("tree: clean");
  } else {
    lines.push("tree: DIRTY");
    lines.push(...report.dirty.map((path) => `  ${path}`));
  }
  if (report.task === undefined) {
    lines.push(`task: ${report.taskProblem}`);
  } else {
    lines.push(...formatTask(report.task));
  }
  for (const entry of report.benchmarks) {
    lines.push(...formatBenchmark(entry));
  }
  lines.push(`postgres ${String(POSTGRES_PORT)}: ${report.postgres}`);
  const verdict = gateExit(report);
  lines.push(
    verdict.exit === FIX_EXIT.ok
      ? `gate: READY (${report.taskId} is ${report.expect})`
      : `gate: REFUSED (exit ${String(verdict.exit)}): ${verdict.refusal}`,
  );
  return lines;
}

function showEntry(id: string, dir: string): Record<string, unknown> {
  return runRecordsCommand(
    { subcommand: "show", id, dir, json: true },
    RECORDS_IO,
  ).data;
}

function citedBenchmarks(task: Task): string[] {
  const ids = new Set<string>(task.evidence);
  for (const event of task.history) {
    for (const id of event.evidence) {
      ids.add(id);
    }
  }
  return [...ids].sort();
}

export async function runGate(options: GateOptions): Promise<CommandResult> {
  const root = repoRoot();
  const verify = runRecordsCommand(
    { subcommand: "verify", target: "all", dir: options.dir, json: false },
    RECORDS_IO,
  );
  const reachable = await probePort("localhost", POSTGRES_PORT, 1500);

  const report: GateReport = {
    taskId: options.taskId,
    expect: options.expect,
    verifyExit: verify.exit,
    verifyLines: verify.lines,
    dirty: nonEmptyLines(git(["status", "--porcelain"], root).stdout),
    task: undefined,
    taskProblem: "",
    benchmarks: [],
    postgres: reachable ? "reachable" : "unreachable",
  };

  if (verify.exit === 0) {
    try {
      report.task = TaskEntry.parse(showEntry(options.taskId, options.dir));
    } catch (error) {
      if (!(error instanceof RecordsError)) {
        throw error;
      }
      report.taskProblem = error.message;
    }
  }

  if (report.task !== undefined) {
    for (const id of citedBenchmarks(report.task)) {
      report.benchmarks.push(BenchmarkEntry.parse(showEntry(id, options.dir)));
    }
  }

  const verdict = gateExit(report);
  return {
    exit: verdict.exit,
    lines: formatGate(report),
    data: {
      taskId: report.taskId,
      expect: report.expect,
      verifyExit: report.verifyExit,
      dirty: report.dirty,
      status: report.task?.status ?? null,
      task: report.task ?? null,
      benchmarks: report.benchmarks,
      postgres: report.postgres,
      refusal: verdict.refusal,
    },
  };
}
