import { basename } from "node:path";
import { test } from "vitest";
import type { BenchRunOptions } from "vitest";

export type BenchOptions = BenchRunOptions;

/** tinybench 2's defaults, which every recorded baseline ran under. */
const DEFAULTS: BenchRunOptions = {
  time: 500,
  iterations: 10,
  warmupTime: 100,
  warmupIterations: 5,
};

/** Each case writes its result under this directory, relative to the package. */
const SAVE_DIRECTORY = process.env.BENCH_SAVE ?? "";
/** Each case runs beside the result a BENCH_SAVE run wrote for it. */
const COMPARE_DIRECTORY = process.env.BENCH_COMPARE ?? "";

function definedOnly(options: BenchRunOptions): BenchRunOptions {
  return Object.fromEntries(
    Object.entries(options).filter(([, value]) => value !== undefined),
  );
}

function resultPath(directory: string, file: string, fullName: string): string {
  const slug = fullName.replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return `${directory}/${basename(file, ".bench.ts")}/${slug}.json`;
}

// One case as one test: its describe path is the suite, its name the case.
// `throws` is forced so a task that fails in warmup fails its test.
export function bench(
  name: string,
  fn: () => unknown,
  options: BenchRunOptions = {},
): void {
  const runOptions: BenchRunOptions = {
    ...DEFAULTS,
    ...definedOnly(options),
    throws: true,
  };

  // No test timeout: the case's own time and iteration budget bound it.
  test(name, { timeout: 0 }, async ({ bench: vitestBench, task }) => {
    const file = task.file.filepath;
    const writeResult =
      SAVE_DIRECTORY === ""
        ? undefined
        : resultPath(SAVE_DIRECTORY, file, task.fullName);
    const current = vitestBench(name, { writeResult }, fn);

    if (COMPARE_DIRECTORY === "") {
      await current.run(runOptions);
      return;
    }

    const baseline = resultPath(COMPARE_DIRECTORY, file, task.fullName);
    await vitestBench.compare(
      current,
      vitestBench.from(`${name} [baseline]`, baseline),
      runOptions,
    );
  });
}
