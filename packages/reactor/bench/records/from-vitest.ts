import { relative } from "node:path";
import { z } from "zod";
import type {
  DerivedRatio,
  MachineEnvironment,
  MicroCase,
  MicroSuite,
  StorageEngine,
} from "./benchmark-schema.js";

/**
 * What each benchmark is, in the one place that has to agree with
 * package.json. The adapter cannot infer a storage engine or a question from a
 * results file, and asking the caller to pass them would put a model on the
 * path of a field that belongs to the benchmark, not to the run.
 */
export type BenchTarget = {
  /** What a caller names it: `pnpm bench:records:from-vitest <this>`. */
  name: string;
  /** The package.json script that runs it. Recording is wired here, not by hand. */
  recordScript: string;
  resultsFile: string;
  sourceFiles: string[];
  command: string;
  storage: StorageEngine;
  title: string;
  question: string;
  /**
   * Attached to every record of this target. These are properties of the
   * apparatus, so a run cannot claim more than the harness supports.
   */
  caveats: string[];
  /**
   * Case renames, old name to new. The converter stamps each renamed case
   * with `continues`, so the record itself says which line it belongs to.
   */
  renames: Record<string, string>;
};

export const BENCH_TARGETS: BenchTarget[] = [
  {
    name: "auth",
    recordScript: "bench:auth:record",
    resultsFile: "auth-scope.json",
    sourceFiles: ["bench/auth-scope.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:auth:record",
    storage: "stubbed",
    title: "auth-scope microbenchmarks",
    question: "auth evaluation cost per step, isolated from storage",
    caveats: [],
    renames: {},
  },
  {
    name: "events",
    recordScript: "bench:events:record",
    resultsFile: "event-bus.json",
    sourceFiles: ["bench/event-bus.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:events:record",
    storage: "stubbed",
    title: "event-bus microbenchmarks",
    question: "emit cost by subscriber count, filter shape, and payload size",
    caveats: [],
    renames: {},
  },
  {
    name: "queue",
    recordScript: "bench:queue:record",
    resultsFile: "queue-perf.json",
    sourceFiles: ["bench/queue-perf.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:queue:record",
    storage: "stubbed",
    title: "queue throughput microbenchmarks",
    question: "queue cost per job at realistic batch sizes",
    caveats: [
      "Every case includes expect() assertion overhead alongside queue work",
    ],
    renames: {},
  },
  {
    name: "queue-only",
    recordScript: "bench:queue-only:record",
    resultsFile: "queue-only.json",
    sourceFiles: ["bench/queue-only.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:queue-only:record",
    storage: "stubbed",
    title: "queue microbenchmarks without an executor",
    question: "enqueue and dequeue cost with nothing draining",
    caveats: [
      "The two DAG cases enqueue dependents before their dependencies across sub-queues — valid per the queue contract, but not a shape any reactor producer emits, since executeBatch and loadBatch topologically sort first",
    ],
    renames: {},
  },
  {
    name: "cache",
    recordScript: "bench:cache:record",
    resultsFile: "write-cache.json",
    sourceFiles: ["bench/write-cache.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:cache:record",
    storage: "pglite",
    title: "write-cache microbenchmarks",
    question: "write-cache hit and miss cost against PGlite",
    caveats: [
      "The no-cache baseline compares a cold rebuild against a manual replay — both are a replay, so that pair reads about 1x by construction rather than what the cache is worth",
      "The two keyframe cases are floored by a 100ms drain sleep for fire-and-forget keyframe writes to land, so their difference isn't persistence overhead",
    ],
    renames: {},
  },
  {
    name: "sync",
    recordScript: "bench:sync:record",
    resultsFile: "",
    sourceFiles: ["bench/two-reactor-sync.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:sync:record",
    storage: "pglite",
    title: "two-reactor sync workloads",
    question: "convergence time between two reactors",
    caveats: [
      "Every scenario registers remotes before any write, with both sides writing live — none measures a reactor joining late and catching up",
    ],
    renames: {},
  },
];

export function findTarget(name: string): BenchTarget {
  const target = BENCH_TARGETS.find(
    (candidate) => candidate.name === name || candidate.resultsFile === name,
  );
  if (target === undefined) {
    throw new Error(
      `Unknown benchmark: ${name}. One of ${BENCH_TARGETS.map((entry) => entry.name).join(", ")}`,
    );
  }
  return target;
}

/**
 * Only the keys the adapter reads. Unknown ones are dropped rather than
 * rejected: a vitest upgrade that adds a field should not stop a recording.
 */
const VitestBenchmark = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  rank: z.number(),
  rme: z.number(),
  totalTime: z.number(),
  min: z.number(),
  max: z.number(),
  hz: z.number(),
  mean: z.number(),
  p75: z.number().optional(),
  p99: z.number().optional(),
  p999: z.number().optional(),
  sampleCount: z.number(),
  median: z.number(),
});

const VitestGroup = z.object({
  fullName: z.string().min(1),
  benchmarks: z.array(VitestBenchmark),
});

const VitestFile = z.object({
  filepath: z.string().min(1),
  groups: z.array(VitestGroup),
});

export const VitestBenchReport = z.object({
  files: z.array(VitestFile).min(1),
});
export type VitestBenchReport = z.infer<typeof VitestBenchReport>;

/** One tinybench task, which carries no rank, name or median of its own. */
export type TinybenchTask = {
  name: string;
  /** The case's earlier name, or empty when it never changed. */
  continues: string;
  samples: number[];
  rme: number;
  totalTime: number;
  min: number;
  max: number;
  hz: number;
  mean: number;
  p75: number;
  p99: number;
  p999: number;
};

export type MicroEntryInput = {
  target: BenchTarget;
  runner: "vitest-bench" | "tinybench";
  runnerVersion: string;
  suites: MicroSuite[];
  environment: MachineEnvironment;
  recordedAt: string;
  /** Appended to what the numbers earn; never a substitute for it. */
  conclusions: string[];
  caveats: string[];
  /** Measured by the harness itself; appended after the suite spreads. */
  derived: DerivedRatio[];
  /** Empty means the target's own. */
  title: string;
  question: string;
  tags: string[];
  tasks: string[];
};

/**
 * Renames every field to its unit-suffixed form. Vitest reports milliseconds
 * throughout and ops/sec for hz, so this is a rename and nothing else: the
 * moment it starts computing a duration it becomes a place numbers can be
 * invented.
 */
export function suitesFromVitest(
  report: VitestBenchReport,
  renames: Record<string, string> = {},
): MicroSuite[] {
  const formerly = new Map(
    Object.entries(renames).map(([from, to]) => [to, from]),
  );
  const suites: MicroSuite[] = [];
  for (const file of report.files) {
    for (const group of file.groups) {
      if (group.benchmarks.length === 0) {
        continue;
      }
      suites.push({
        fullName: group.fullName,
        cases: group.benchmarks.map((benchmark) => {
          const converted: MicroCase = {
            name: benchmark.name,
            rank: benchmark.rank,
            hz: benchmark.hz,
            meanMs: benchmark.mean,
            medianMs: benchmark.median,
            minMs: benchmark.min,
            maxMs: benchmark.max,
            rmePct: benchmark.rme,
            sampleCount: benchmark.sampleCount,
            totalTimeMs: benchmark.totalTime,
            vitestId: benchmark.id,
          };
          if (benchmark.p75 !== undefined) {
            converted.p75Ms = benchmark.p75;
          }
          if (benchmark.p99 !== undefined) {
            converted.p99Ms = benchmark.p99;
          }
          if (benchmark.p999 !== undefined) {
            converted.p999Ms = benchmark.p999;
          }
          const previous = formerly.get(benchmark.name);
          if (previous !== undefined) {
            converted.continues = previous;
          }
          return converted;
        }),
      });
    }
  }
  return suites;
}

export function sourceFilesFromVitest(
  report: VitestBenchReport,
  cwd: string,
): string[] {
  return report.files.map((file) => relative(cwd, file.filepath));
}

/**
 * Tinybench has no rank, no sampleCount and no median: those are vitest's
 * additions. Rank comes from sorting on hz, and the median from the samples
 * tinybench does keep.
 */
export function suitesFromTinybench(
  fullName: string,
  tasks: TinybenchTask[],
): MicroSuite[] {
  const byHz = [...tasks].sort((a, b) => b.hz - a.hz);
  return [
    {
      fullName,
      cases: byHz.map((task, index) => ({
        name: task.name,
        rank: index + 1,
        hz: task.hz,
        meanMs: task.mean,
        medianMs: median(task.samples),
        minMs: task.min,
        maxMs: task.max,
        p75Ms: task.p75,
        p99Ms: task.p99,
        p999Ms: task.p999,
        rmePct: task.rme,
        sampleCount: task.samples.length,
        totalTimeMs: task.totalTime,
        ...(task.continues === "" ? {} : { continues: task.continues }),
      })),
    },
  ];
}

/**
 * The candidate entry, without an id: the CLI allocates that, and offering one
 * is rejected.
 */
export function buildMicroEntry(
  input: MicroEntryInput,
): Record<string, unknown> {
  const derived = [...input.suites.map(suiteSpread), ...input.derived];
  const conclusions = [
    ...input.suites.map(suiteConclusion),
    ...input.conclusions,
  ];
  const caveats = [
    ...input.target.caveats,
    ...earnedCaveats(input.suites),
    ...input.caveats,
  ];

  return {
    kind: "micro",
    tier: "micro",
    title: input.title === "" ? input.target.title : input.title,
    question: input.question === "" ? input.target.question : input.question,
    command: input.target.command,
    recordedAt: input.recordedAt,
    environment: input.environment,
    conclusions,
    caveats,
    tasks: input.tasks,
    tags: input.tags,
    results: {
      runner: input.runner,
      runnerVersion: input.runnerVersion,
      sourceFiles: input.target.sourceFiles,
      suites: input.suites,
      protocol: {
        repetitions: 1,
        interleaved: false,
        notes: [
          "One invocation of the runner; the iteration counts are per case and live in sampleCount",
        ],
      },
      derived,
    },
  };
}

/** The short name a human would use, without the file that qualifies it. */
export function suiteLabel(fullName: string): string {
  const parts = fullName.split(" > ");
  return parts.length > 1 ? parts.slice(1).join(" > ") : fullName;
}

function suiteSpread(suite: MicroSuite): DerivedRatio {
  const fastest = extreme(suite, (a, b) => a.hz > b.hz);
  const slowest = extreme(suite, (a, b) => a.hz < b.hz);
  return {
    name: `${suiteLabel(suite.fullName)}: spread`,
    value: round(fastest.hz / slowest.hz),
    unit: "x",
    note: `${fastest.name} over ${slowest.name}`,
  };
}

/**
 * Restates a measured ratio rather than claiming anything about why. Something
 * has to fill `conclusions`, which is min(1), and model prose must not be what
 * fills it.
 */
function suiteConclusion(suite: MicroSuite): string {
  const label = suiteLabel(suite.fullName);
  if (suite.cases.length === 1) {
    return `In ${label}, ${suite.cases[0].name} ran at ${round(suite.cases[0].hz)} ops/sec`;
  }
  const fastest = extreme(suite, (a, b) => a.hz > b.hz);
  const slowest = extreme(suite, (a, b) => a.hz < b.hz);
  return `In ${label}, ${slowest.name} is ${round(fastest.hz / slowest.hz)}x slower than ${fastest.name}`;
}

/** What the numbers themselves say about how far to trust them. */
function earnedCaveats(suites: MicroSuite[]): string[] {
  const caveats: string[] = [];
  for (const suite of suites) {
    const label = suiteLabel(suite.fullName);
    for (const entry of suite.cases) {
      if (entry.rmePct > 5) {
        caveats.push(
          `${label} / ${entry.name}: rme ${round(entry.rmePct)}%, so the run measured noise as much as the system`,
        );
      }
      if (entry.sampleCount < 100) {
        caveats.push(
          `${label} / ${entry.name}: ${entry.sampleCount} samples, too few for the spread to mean much`,
        );
      }
    }
  }
  return caveats;
}

function extreme(
  suite: MicroSuite,
  better: (a: MicroCase, b: MicroCase) => boolean,
): MicroCase {
  return suite.cases.reduce((best, entry) =>
    better(entry, best) ? entry : best,
  );
}

function median(samples: number[]): number {
  if (samples.length === 0) {
    return 0;
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round(value: number): number {
  return Number(value.toFixed(2));
}
