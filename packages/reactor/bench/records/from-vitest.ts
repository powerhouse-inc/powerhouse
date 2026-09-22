import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
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
  /**
   * The sidecar the benchmark writes into the results directory, or empty when
   * every figure it measures fits in a case mean. A target that names one
   * cannot be recorded without it: the whole point of the file is that the
   * reading would otherwise reach stdout and no further.
   */
  stampsFile: string;
  /**
   * The case-name suffix the instrumented leg carries. Each stamp label has to
   * pair with `<label>: <this>`, which is what turns a stale or dropped
   * sidecar into an error rather than a quietly incomplete record.
   */
  stampedCase: string;
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
    stampsFile: "",
    stampedCase: "",
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
    stampsFile: "",
    stampedCase: "",
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
    stampsFile: "",
    stampedCase: "",
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
    stampsFile: "",
    stampedCase: "",
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
    stampsFile: "write-cache-stamps.json",
    stampedCase: "instrumented cold-miss replay",
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
    stampsFile: "",
    stampedCase: "",
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
 * One label's in-situ decomposition, as the benchmark filed it. Nothing here
 * is optional: a sidecar missing a field is a harness that changed shape, and
 * guessing at the gap would put an invented number in the record.
 */
const ReplayStampReading = z.strictObject({
  label: z.string().min(1),
  wallCalls: z.number().positive(),
  bodyCalls: z.number().positive(),
  wallMs: z.number().nonnegative(),
  bodyMs: z.number().nonnegative(),
  wallUsPerCall: z.number().nonnegative(),
  bodyUsPerWallCall: z.number().nonnegative(),
  outsideUsPerWallCall: z.number(),
  bodyUsPerBodyCall: z.number().nonnegative(),
  bodySharePct: z.number(),
});

/** One leg's per-node split, as the benchmark subtracted it. */
const MirrorSplitReading = z.strictObject({
  leg: z.string().min(1),
  counts: z.array(z.number().positive()).min(2),
  fullUsPerNode: z.number(),
  collisionScanUsPerNode: z.number(),
  sortUsPerNode: z.number(),
  touchUsPerNode: z.number(),
  floorUsPerNode: z.number(),
  wrapperUsPerNode: z.number(),
  stampedBodyUsPerNode: z.number(),
  realBodyUsPerNode: z.number(),
  collisionScanSharePct: z.number(),
  sortSharePct: z.number(),
  touchSharePct: z.number(),
  floorSharePct: z.number(),
  scanPlusSortSharePct: z.number(),
  mirrorOverRealSlope: z.number(),
});
type MirrorSplitReading = z.infer<typeof MirrorSplitReading>;

export const ReplayStampsFile = z.strictObject({
  version: z.literal(2),
  stamps: z.array(ReplayStampReading).min(1),
  splits: z.array(MirrorSplitReading).min(1),
});
export type ReplayStampsFile = z.infer<typeof ReplayStampsFile>;

/** What a sidecar contributes: readings, what they say, and their limits. */
export type StampReadings = {
  derived: DerivedRatio[];
  conclusions: string[];
  caveats: string[];
};

/** Case names in the report that belong to the target's instrumented leg. */
function stampedCaseNames(target: BenchTarget, suites: MicroSuite[]): string[] {
  const suffix = `: ${target.stampedCase}`;
  return suites
    .flatMap((suite) => suite.cases.map((entry) => entry.name))
    .filter((name) => name.endsWith(suffix));
}

const SPLIT_CASE = /^(.+?) leg \d+ ops: /;

/** Cases of one split leg, which name the leg and the size they ran. */
function splitLegCases(leg: string, suites: MicroSuite[]): MicroCase[] {
  return suites
    .flatMap((suite) => suite.cases)
    .filter((entry) => SPLIT_CASE.exec(entry.name)?.[1] === leg);
}

/** Legs the report varied, whether or not the sidecar split any of them. */
function splitLegsInReport(suites: MicroSuite[]): string[] {
  const legs = new Set<string>();
  for (const suite of suites) {
    for (const entry of suite.cases) {
      const match = SPLIT_CASE.exec(entry.name);
      if (match !== null) {
        legs.add(match[1]);
      }
    }
  }
  return [...legs];
}

/** The buckets a leg's slope splits into, and the ratio bounding them. */
function splitDerived(split: MirrorSplitReading): DerivedRatio[] {
  const over = `over ${split.counts.map(String).join("/")} ops, per node on the list`;

  return [
    {
      name: `${split.leg} leg: collision scans per node`,
      value: round4(split.collisionScanUsPerNode),
      unit: "us",
      note: `The existence find and handleTargetNameCollisions, as the full mirrored body minus the no-reads variant, ${over}`,
    },
    {
      name: `${split.leg} leg: sorted-insert comparator per node`,
      value: round4(split.sortUsPerNode),
      unit: "us",
      note: `The localeCompare pass in insertNodeSorted, as the full mirrored body minus the no-sort variant, ${over}`,
    },
    {
      name: `${split.leg} leg: scan + sort share of the mirrored body`,
      value: round(split.scanPlusSortSharePct),
      unit: "pct",
      note: `Both buckets over the full mirrored body slope of ${round4(split.fullUsPerNode)}us per node`,
    },
    {
      name: `${split.leg} leg: residue the buckets leave per node`,
      value: round4(split.touchUsPerNode),
      unit: "us",
      note: `What full-minus-no-reads and full-minus-no-sort leave between the push-only floor and the full mirrored body; on the draft leg that is child drafts and finalize, and the plain leg has no draft for it to be, ${over}`,
    },
    {
      name: `${split.leg} leg: copy, freeze and assignment floor per node`,
      value: round4(split.floorUsPerNode),
      unit: "us",
      note: `The push-only variant, which still reads the list, copies it twice, freezes it and assigns it once, ${over}`,
    },
    {
      name: `${split.leg} leg: create() and base reducer per node`,
      value: round4(split.wrapperUsPerNode),
      unit: "us",
      note: `The no-body baseline, which is the wrapper the reducer body does not induce, ${over}`,
    },
    {
      name: `${split.leg} leg: mirrored body per node`,
      value: round4(split.fullUsPerNode),
      unit: "us",
      note: `The full mirrored body slope the buckets sum to, ${over}`,
    },
    {
      name: `${split.leg} leg: mirror over real body slope`,
      value: round4(split.mirrorOverRealSlope),
      unit: "x",
      note: `The mirror's stamped read+write slope of ${round4(split.stampedBodyUsPerNode)}us per node over the real reducer body's ${round4(split.realBodyUsPerNode)}us; the mirror represents the body only as far as this reads 1x`,
    },
  ];
}

/** The split in a sentence, which is the reading a later reader will quote. */
function splitConclusion(split: MirrorSplitReading): string {
  return `In the ${split.leg} leg, the add-node reducer body costs ${round4(split.fullUsPerNode)}us per node, of which the two collision scans are ${round4(split.collisionScanUsPerNode)}us (${round(split.collisionScanSharePct)}%) and the sorted-insert comparator ${round4(split.sortUsPerNode)}us (${round(split.sortSharePct)}%), together ${round(split.scanPlusSortSharePct)}% of it; the copy, freeze and assignment floor is ${round4(split.floorUsPerNode)}us (${round(split.floorSharePct)}%) and the residue the two buckets leave ${round4(split.touchUsPerNode)}us (${round(split.touchSharePct)}%)`;
}

/**
 * Folds a benchmark's sidecar into readings the entry carries.
 *
 * A case mean is the wall time of a whole measured function, so a benchmark
 * that times a sub-interval of one call has nowhere in the vitest report to
 * put it. Reading the file here is what keeps that measurement in the record
 * instead of in a scrollback buffer.
 *
 * Both directions of the label/case check are errors. A stamped case with no
 * reading means the run dropped what it was recorded to show; a reading with
 * no case means the sidecar outlived the suite that wrote it, and its numbers
 * describe code that did not run.
 */
export function stampReadings(
  target: BenchTarget,
  resultsDirectory: string,
  suites: MicroSuite[],
): StampReadings {
  const cases = stampedCaseNames(target, suites);

  if (target.stampsFile === "") {
    return { derived: [], conclusions: [], caveats: [] };
  }

  const path = join(resultsDirectory, target.stampsFile);
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(
      `${target.name} files a decomposition at ${path} that a case mean cannot carry, and it is not there: ${error instanceof Error ? error.message : String(error)}. Run ${target.recordScript} first; recording without it would drop the measurement.`,
      { cause: error },
    );
  }

  const parsed = ReplayStampsFile.safeParse(JSON.parse(raw) as unknown);
  if (!parsed.success) {
    throw new Error(
      `${path} is not a stamps file:\n${z.prettifyError(parsed.error)}`,
    );
  }

  const filed = new Set(
    parsed.data.stamps.map((stamp) => `${stamp.label}: ${target.stampedCase}`),
  );
  const unstamped = cases.filter((name) => !filed.has(name));
  const stale = [...filed].filter((name) => !cases.includes(name));

  if (unstamped.length > 0 || stale.length > 0) {
    throw new Error(
      [
        `${path} does not describe the run in ${target.resultsFile}.`,
        ...(unstamped.length > 0
          ? [`Cases that filed no reading: ${unstamped.join(", ")}`]
          : []),
        ...(stale.length > 0
          ? [`Readings with no case in the report: ${stale.join(", ")}`]
          : []),
        `Re-run ${target.recordScript} so both come from one run.`,
      ].join("\n"),
    );
  }

  const legs = splitLegsInReport(suites);
  const split = parsed.data.splits.map((entry) => entry.leg);
  const unsplit = legs.filter((leg) => !split.includes(leg));
  const staleSplits = split.filter((leg) => !legs.includes(leg));

  if (unsplit.length > 0 || staleSplits.length > 0) {
    throw new Error(
      [
        `${path} does not split the legs the run in ${target.resultsFile} varied.`,
        ...(unsplit.length > 0
          ? [`Legs that filed no split: ${unsplit.join(", ")}`]
          : []),
        ...(staleSplits.length > 0
          ? [`Splits with no leg in the report: ${staleSplits.join(", ")}`]
          : []),
        `Re-run ${target.recordScript} so both come from one run.`,
      ].join("\n"),
    );
  }

  const derived: DerivedRatio[] = [];
  const conclusions: string[] = [];
  const caveats: string[] = [];

  for (const stamp of parsed.data.stamps) {
    const calls = `over ${stamp.wallCalls} module.reducer calls totalling ${round(stamp.wallMs)}ms`;

    derived.push(
      {
        name: `${stamp.label}: module.reducer wall`,
        value: round4(stamp.wallUsPerCall),
        unit: "us",
        note: `Wall time of one module.reducer call, ${calls}`,
      },
      {
        name: `${stamp.label}: reducer body in draft`,
        value: round4(stamp.bodyUsPerWallCall),
        unit: "us",
        note: `The custom reducer body, measured inside the mutative draft, per module.reducer call. ${round(stamp.bodyMs)}ms over ${stamp.bodyCalls} state-reducer calls, or ${round4(stamp.bodyUsPerBodyCall)}us each`,
      },
      {
        name: `${stamp.label}: create() draft+finalize+base`,
        value: round4(stamp.outsideUsPerWallCall),
        unit: "us",
        note: `Wall minus body per module.reducer call: everything create() and the base reducer do around the body, ${calls}`,
      },
      {
        name: `${stamp.label}: reducer body share`,
        value: round(stamp.bodySharePct),
        unit: "pct",
        note: "Share of module.reducer wall time spent inside the custom reducer body",
      },
    );

    if (stamp.wallCalls !== stamp.bodyCalls) {
      caveats.push(
        `${stamp.label}: ${stamp.wallCalls} module.reducer calls drove ${stamp.bodyCalls} state-reducer calls, so the body figure per module.reducer call aggregates more than one invocation and the two per-call means are not comparable`,
      );
    }
  }

  for (const entry of parsed.data.splits) {
    derived.push(...splitDerived(entry));
    conclusions.push(splitConclusion(entry));

    const thinnest = splitLegCases(entry.leg, suites).reduce(
      (fewest, item) => Math.min(fewest, item.sampleCount),
      Number.POSITIVE_INFINITY,
    );

    if (thinnest < 100) {
      caveats.push(
        `${entry.leg} leg: the split is a slope through ${entry.counts.map(String).join("/")} ops and the thinnest case behind it carries ${String(thinnest)} samples, so the large-count end of the subtraction is the one to distrust`,
      );
    }
  }

  return { derived, conclusions, caveats };
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
  /**
   * Records this run replaces. A harness fix changes what the numbers mean, so
   * the entry it invalidates stops being a comparable baseline and says so.
   */
  supersedes: string[];
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
  // A target whose harness measures more than case means has to carry those
  // readings, and every caller builds its own input. Refusing here is what
  // stops a third one from quietly recording the vitest half on its own.
  if (input.target.stampsFile !== "" && input.derived.length === 0) {
    throw new Error(
      `${input.target.name} files a decomposition its case means cannot carry, so an entry with no derived readings would drop it. Pass stampReadings(target, resultsDirectory, suites).`,
    );
  }

  const derived = [...input.suites.flatMap(suiteSpreads), ...input.derived];
  const conclusions = [
    ...input.suites.flatMap(suiteConclusions),
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
    supersedes: input.supersedes,
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

/** Cases of one suite that ran the same stated operation count. */
type WorkloadGroup = {
  /** 0 when the cases state no count of their own. */
  operations: number;
  cases: MicroCase[];
};

/**
 * The operation count a case name states, or 0 when it states none. A case
 * name is the only place the harness says how much work the case did, so it is
 * the only thing a spread can hold fixed.
 */
function statedOperationCount(name: string): number {
  const match = /(\d+)\s+(?:[a-z]+\s+)?(?:operations?|ops)\b/i.exec(name);
  return match === null ? 0 : Number(match[1]);
}

/**
 * Splits a suite into the sets whose cases are comparable to each other. A
 * suite where no case states a count is one set, because holding the workload
 * fixed is then the suite's own construction. Once any case states one, a case
 * that states none is comparable to nothing and stands alone.
 */
function workloadGroups(suite: MicroSuite): WorkloadGroup[] {
  const tagged = suite.cases.map((entry) => ({
    entry,
    operations: statedOperationCount(entry.name),
  }));
  if (tagged.every((item) => item.operations === 0)) {
    return [{ operations: 0, cases: suite.cases }];
  }

  const groups: WorkloadGroup[] = [];
  const byCount = new Map<number, WorkloadGroup>();
  for (const item of tagged) {
    const existing = byCount.get(item.operations);
    if (item.operations !== 0 && existing !== undefined) {
      existing.cases.push(item.entry);
      continue;
    }
    const group: WorkloadGroup = {
      operations: item.operations,
      cases: [item.entry],
    };
    if (item.operations !== 0) {
      byCount.set(item.operations, group);
    }
    groups.push(group);
  }
  return groups;
}

/** What each case states about its own workload, for a note that has to say why. */
function statedCounts(suite: MicroSuite): string {
  return suite.cases
    .map((entry) => {
      const operations = statedOperationCount(entry.name);
      return operations === 0
        ? `${entry.name}: no stated count`
        : `${entry.name}: ${String(operations)}`;
    })
    .join("; ");
}

/**
 * One spread per set of cases that ran the same stated operation count, rather
 * than one fastest-over-slowest for the suite. A pair that differs in workload
 * size prices the size as much as the mechanism, and the ratio reads as though
 * it priced the mechanism alone. A suite that holds one size throughout keeps
 * the single `<label>: spread` it has always filed.
 */
function suiteSpreads(suite: MicroSuite): DerivedRatio[] {
  const label = suiteLabel(suite.fullName);
  const groups = workloadGroups(suite);
  const comparable = groups.filter((group) => group.cases.length > 1);

  if (comparable.length === 0) {
    return [
      {
        name: `${label}: comparable pairs`,
        value: 0,
        unit: "count",
        note: `No two cases ran the same stated operation count (${statedCounts(suite)}), so a fastest-over-slowest ratio here would price the operation count rather than the mechanism`,
      },
    ];
  }

  return comparable.map((group) => {
    const fastest = extreme(group.cases, (a, b) => a.hz > b.hz);
    const slowest = extreme(group.cases, (a, b) => a.hz < b.hz);
    const at = `${String(group.operations)} operations`;
    return {
      name:
        groups.length === 1 ? `${label}: spread` : `${label}: spread at ${at}`,
      value: round(fastest.hz / slowest.hz),
      unit: "x",
      note:
        groups.length === 1
          ? `${fastest.name} over ${slowest.name}`
          : `${fastest.name} over ${slowest.name}, both at ${at}`,
    };
  });
}

/**
 * Restates a measured ratio rather than claiming anything about why. Something
 * has to fill `conclusions`, which is min(1), and model prose must not be what
 * fills it. A suite with no two cases at one size gets a sentence that says so:
 * the alternative is a headline that reads as a mechanism and is an op count.
 */
function suiteConclusions(suite: MicroSuite): string[] {
  const label = suiteLabel(suite.fullName);
  const groups = workloadGroups(suite);
  const comparable = groups.filter((group) => group.cases.length > 1);

  if (comparable.length === 0) {
    if (suite.cases.length === 1) {
      return [
        `In ${label}, ${suite.cases[0].name} ran at ${round(suite.cases[0].hz)} ops/sec`,
      ];
    }
    const rates = suite.cases
      .map((entry) => `${entry.name} at ${round(entry.hz)} ops/sec`)
      .join(", ");
    return [
      `In ${label}, no two cases ran the same stated operation count, so the suite has no spread that isolates the mechanism: ${rates}`,
    ];
  }

  return comparable.map((group) => {
    const fastest = extreme(group.cases, (a, b) => a.hz > b.hz);
    const slowest = extreme(group.cases, (a, b) => a.hz < b.hz);
    const at =
      groups.length === 1 ? "" : ` at ${String(group.operations)} operations`;
    return `In ${label}${at}, ${slowest.name} is ${round(fastest.hz / slowest.hz)}x slower than ${fastest.name}`;
  });
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
  cases: MicroCase[],
  better: (a: MicroCase, b: MicroCase) => boolean,
): MicroCase {
  return cases.reduce((best, entry) => (better(entry, best) ? entry : best));
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

/** Per-call figures live in microseconds, where two decimals lose the signal. */
function round4(value: number): number {
  return Number(value.toFixed(4));
}
