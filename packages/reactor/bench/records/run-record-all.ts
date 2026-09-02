import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import {
  buildMicroEntry,
  suitesFromVitest,
  VitestBenchReport,
} from "./from-vitest.js";
import type { BenchTarget } from "./from-vitest.js";
import { RecordsError } from "./jsonl-store.js";
import {
  dirtyPaths,
  readMachineEnvironment,
  readPackageVersion,
} from "./machine-environment.js";
import {
  parseRecordAllOptions,
  RECORD_ALL_EXIT,
  RECORD_ALL_USAGE,
  summarise,
} from "./record-all.js";
import type { RecordAllOptions, TargetOutcome } from "./record-all.js";
import { runRecordsCommand } from "./records-commands.js";

const RESULTS_DIRECTORY = "bench/results";
const RECORDS_DIRECTORY = "bench";
/** Resolved against the working directory, which pnpm sets to the package. */
const PACKAGE_DIRECTORY = ".";
/** Outputs of a recording, so they do not make the tree dirty for the next one. */
const RECORD_FILES = ["bench/BENCHMARKS.jsonl", "bench/TASKS.jsonl"];

/**
 * Runs one benchmark in its own process. Serial by construction: nothing here
 * is concurrent, because these benchmarks share a machine and two of them
 * competing for it measure each other.
 *
 * vitest output goes straight to the terminal rather than being captured - it
 * is long enough to overrun a pipe buffer, and the JSON file is the real
 * output anyway.
 */
function runBenchmark(target: BenchTarget, capture: boolean): string {
  const result = spawnSync("pnpm", ["run", target.recordScript], {
    stdio: capture ? ["inherit", "pipe", "inherit"] : "inherit",
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });

  if (result.error !== undefined) {
    throw new Error(
      `Could not start ${target.recordScript}: ${result.error.message}`,
    );
  }
  if (result.status !== 0) {
    throw new Error(
      `${target.recordScript} exited ${String(result.status)}${result.signal === null ? "" : ` on ${result.signal}`}`,
    );
  }
  return capture ? result.stdout : "";
}

/**
 * pnpm writes its own lines around a script, so the entry is found rather than
 * assumed to be the whole of stdout.
 */
function parseEmittedEntry(stdout: string): Record<string, unknown> {
  const line = stdout
    .split("\n")
    .map((candidate) => candidate.trim())
    .find((candidate) => candidate.startsWith("{"));
  if (line === undefined) {
    throw new Error("The benchmark printed no JSON object on stdout");
  }
  return JSON.parse(line) as Record<string, unknown>;
}

function convertVitestReport(target: BenchTarget): Record<string, unknown> {
  const path = join(RESULTS_DIRECTORY, target.resultsFile);

  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `${target.recordScript} left no report at ${path}: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const parsed = VitestBenchReport.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `${path} is not a vitest bench report:\n${z.prettifyError(parsed.error)}`,
    );
  }

  return buildMicroEntry({
    target,
    runner: "vitest-bench",
    runnerVersion: readPackageVersion("vitest"),
    suites: suitesFromVitest(parsed.data),
    environment: readMachineEnvironment(target.storage),
    recordedAt: new Date().toISOString(),
    derived: [],
    conclusions: [],
    caveats: [],
    title: "",
    question: "",
    tags: [],
    tasks: [],
  });
}

/** Through the same command the CLI runs: same validation, same lock, same
 * whole-file reread. There is one writer, and this is not a second one. */
function append(entry: Record<string, unknown>): string {
  const result = runRecordsCommand(
    {
      subcommand: "add-benchmark",
      input: "-",
      dir: RECORDS_DIRECTORY,
      id: "",
      dryRun: false,
      json: false,
    },
    {
      readInput: () => JSON.stringify(entry),
      now: () => new Date().toISOString(),
    },
  );

  process.stdout.write(`${result.lines.join("\n")}\n`);
  return String(result.data.id);
}

function recordOne(target: BenchTarget): string {
  // The sync bench drives tinybench directly and emits its own entry; the
  // vitest ones write a report this converts.
  if (target.resultsFile === "") {
    const stdout = runBenchmark(target, true);
    return append(parseEmittedEntry(stdout));
  }

  runBenchmark(target, false);
  return append(convertVitestReport(target));
}

function main(): void {
  let options: RecordAllOptions;
  try {
    options = parseRecordAllOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${RECORD_ALL_USAGE}`);
    process.exit(RECORD_ALL_EXIT.usage);
  }

  const plan = options.targets.map((target) => target.name).join(", ");
  if (options.listOnly) {
    process.stdout.write(`${plan}\n`);
    process.exit(RECORD_ALL_EXIT.ok);
  }

  // Once, up front. A refusal is worth having in the first second rather than
  // twenty minutes in.
  if (!options.allowDirty) {
    const dirty = dirtyPaths(PACKAGE_DIRECTORY, RECORD_FILES);
    if (dirty.length > 0) {
      console.error(
        `The package has uncommitted changes, so the sha these records would carry describes code that did not run:\n${dirty.join("\n")}\nCommit, stash, or pass --allow-dirty and say so in a caveat.`,
      );
      process.exit(RECORD_ALL_EXIT.dirtyTree);
    }
  }

  process.stdout.write(`Recording ${options.targets.length}: ${plan}\n`);

  const outcomes: TargetOutcome[] = [];
  for (const target of options.targets) {
    const started = Date.now();
    process.stdout.write(`\n=== ${target.name} (${target.recordScript}) ===\n`);

    try {
      const id = recordOne(target);
      outcomes.push({
        target: target.name,
        status: "recorded",
        id,
        seconds: (Date.now() - started) / 1000,
        detail: "",
      });
    } catch (error) {
      const detail =
        error instanceof RecordsError || error instanceof Error
          ? error.message
          : String(error);
      process.stderr.write(`${target.name} failed: ${detail}\n`);
      outcomes.push({
        target: target.name,
        status: "failed",
        id: "",
        seconds: (Date.now() - started) / 1000,
        detail,
      });
    }
  }

  const summary = summarise(outcomes);
  process.stdout.write(`${summary.lines.join("\n")}\n`);
  process.exit(summary.exit);
}

main();
