import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import {
  buildMicroEntry,
  findTarget,
  suitesFromVitest,
  VitestBenchReport,
} from "./from-vitest.js";
import type { BenchTarget } from "./from-vitest.js";
import {
  FROM_VITEST_USAGE,
  parseFromVitestOptions,
} from "./from-vitest-options.js";
import type { FromVitestOptions } from "./from-vitest-options.js";
import {
  dirtyPaths,
  readMachineEnvironment,
  readPackageVersion,
} from "./machine-environment.js";

const RESULTS_DIRECTORY = "bench/results";
/** Resolved against the working directory, which pnpm sets to the package. */
const PACKAGE_DIRECTORY = ".";
/** Outputs of a recording, so they do not make the tree dirty for the next one. */
const RECORD_FILES = ["bench/BENCHMARKS.jsonl", "bench/TASKS.jsonl"];
const USAGE_EXIT = 64;
const ERROR_EXIT = 68;

function resolveReport(options: FromVitestOptions): {
  target: BenchTarget;
  path: string;
} {
  const target = findTarget(basename(options.target));
  const path = options.target.includes("/")
    ? options.target
    : join(RESULTS_DIRECTORY, target.resultsFile);
  return { target, path };
}

function readReport(path: string): VitestBenchReport {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `Could not read ${path}: ${error instanceof Error ? error.message : String(error)}. Run the benchmark's :record script first.`,
      { cause: error },
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `${path} is not JSON: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error },
    );
  }

  const parsed = VitestBenchReport.safeParse(value);
  if (!parsed.success) {
    throw new Error(
      `${path} is not a vitest bench report:\n${z.prettifyError(parsed.error)}`,
    );
  }
  return parsed.data;
}

function main(): void {
  let options: FromVitestOptions;
  try {
    options = parseFromVitestOptions(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    console.error(`\n${FROM_VITEST_USAGE}`);
    process.exit(USAGE_EXIT);
  }

  try {
    const { target, path } = resolveReport(options);
    if (!options.allowDirty) {
      const dirty = dirtyPaths(PACKAGE_DIRECTORY, RECORD_FILES);
      if (dirty.length > 0) {
        throw new Error(
          `The package has uncommitted changes, so the sha this record would carry describes code that did not run:\n${dirty.join("\n")}\nCommit, stash, or pass --allow-dirty and say so in a caveat.`,
        );
      }
    }

    const report = readReport(path);
    process.stderr.write(`Converting ${path}\n`);

    const entry = buildMicroEntry({
      target,
      runner: "vitest-bench",
      runnerVersion: readPackageVersion("vitest"),
      suites: suitesFromVitest(report, target.renames),
      environment: readMachineEnvironment(target.storage),
      recordedAt: new Date().toISOString(),
      derived: [],
      conclusions: options.conclusions,
      caveats: options.caveats,
      title: options.title,
      question: options.question,
      tags: options.tags,
      tasks: options.tasks,
      supersedes: options.supersedes,
    });

    process.stdout.write(`${JSON.stringify(entry)}\n`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(ERROR_EXIT);
  }
}

main();
