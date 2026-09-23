import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { z } from "zod";
import type {
  BenchmarkTier,
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
  /** Which tier its cases sit in: a stubbed call site is not a stored one. */
  tier: BenchmarkTier;
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
  /**
   * The units this target's case names state their workload size in. A spread
   * pairs only cases that state the same count in every one of them.
   */
  sizeUnits: SizeUnit[];
  /** Case-name fragments one mechanism apart; a lone one is compared to nothing. */
  spreadChains: string[][];
};

/** A unit a case name can state its workload size in, as `<n>[ ][adjective ]<word>`. */
export type SizeUnit = {
  /** Every spelling a case name uses, matched whole and case-insensitively. */
  words: string[];
  /** What a spread says it held fixed: `at 100 <label>`. */
  label: string;
  /** What a suite with no pair says it could not hold fixed. */
  noun: string;
};

const OPERATION_COUNT: SizeUnit = {
  words: ["operations", "operation", "ops"],
  label: "operations",
  noun: "operation count",
};

/** An injected subscriber wait, which prices the timer rather than emit's dispatch. */
const DELAY_MS: SizeUnit = {
  words: ["ms delay"],
  label: "ms delay",
  noun: "delay",
};

/** How auth-scope.bench.ts names the size of each case. */
const AUTH_SIZE_UNITS: SizeUnit[] = [
  { words: ["grants", "grant"], label: "grants", noun: "grant count" },
  { words: ["members", "member"], label: "members", noun: "member count" },
  { words: ["nodes", "node"], label: "nodes", noun: "node count" },
  {
    words: ["referencer(s)", "referencers", "referencer"],
    label: "referencer(s)",
    noun: "referencer count",
  },
  {
    words: ["group(s)", "groups"],
    label: "group(s)",
    noun: "group count",
  },
];

/** Marks a case as a reference cost rather than a point on the sweep. */
export const REFERENCE_CASE_MARKER = "[reference]";

const SPLIT_LEGS = ["draft", "plain"];
const SPLIT_COUNTS = [100, 500, 1000, 2000];
const SPLIT_BASELINES = [
  "real body (fidelity reference)",
  "no body: create() + base reducer only",
];

/** The split baselines the suite now marks; renaming keeps their series joined. */
function splitBaselineRenames(): Record<string, string> {
  const renames: Record<string, string> = {};
  for (const leg of SPLIT_LEGS) {
    for (const count of SPLIT_COUNTS) {
      for (const baseline of SPLIT_BASELINES) {
        const former = `${leg} leg ${String(count)} ops: ${baseline}`;
        renames[former] = `${former} ${REFERENCE_CASE_MARKER}`;
      }
    }
  }
  return renames;
}

/** The LRU legs now name the count they hold fixed, so their series is joined. */
const LRU_RENAMES: Record<string, string> = {
  "LRU eviction (filling cache to capacity)":
    "LRU eviction (filling cache to capacity) over 12 documents, capacity 6",
  "LRU access pattern (updating access order)":
    "LRU access pattern (updating access order) over 12 documents, capacity 12",
};

function cacheRenames(): Record<string, string> {
  return { ...splitBaselineRenames(), ...LRU_RENAMES };
}

/** A sync scenario states its document count beside its operation count. */
const DOCUMENT_COUNT: SizeUnit = {
  words: ["documents", "document"],
  label: "documents",
  noun: "document count",
};

/** The processor's per-call wait, which sets how much a delivery pass can overlap. */
const PROCESSOR_DELAY_MS: SizeUnit = {
  words: ["ms processor"],
  label: "ms processor",
  noun: "processor delay",
};

const AUTH_SPREAD_CHAINS: string[][] = [
  ["(cap), match first", "(cap), match last", "(cap), denied"],
  ["administered from the top", "administered from the bottom"],
  ["administered from the top", "shadow walk before an anyone allow"],
  [
    "L0_CLEAN",
    "L0_POLICIED",
    "L1_DOCUMENT_DECISIONS",
    "L2_AUTH_ENFORCEMENT",
    "L3_AUTH_GROUPS",
    "L4_AUTH_CONDITIONS",
  ],
];

const EVENTS_SPREAD_CHAINS: string[][] = [
  [
    "1 sync subscriber",
    "5 sync subscribers",
    "10 sync subscribers",
    "25 sync subscribers",
    "50 sync subscribers",
    "100 sync subscribers",
  ],
  ["1 async subscriber", "5 async subscribers", "10 async subscribers"],
  [
    "10 subscribers (90% sync, 10% async)",
    "10 subscribers (70% sync, 30% async)",
    "10 subscribers (50% sync, 50% async)",
    "10 subscribers (30% sync, 70% async)",
    "10 subscribers (10% sync, 90% async)",
  ],
  [
    "10 subscribers (50% sync, 50% async)",
    "25 subscribers (50% sync, 50% async)",
    "50 subscribers (50% sync, 50% async)",
  ],
  [
    "Subscribe and unsubscribe (single)",
    "Subscribe and unsubscribe (batch of 10)",
    "Subscribe and unsubscribe (batch of 100)",
  ],
];

/** The decomposition legs nest, and the split's four bodies are two switches. */
const CACHE_SPREAD_CHAINS: string[][] = [
  [
    "input validation only",
    "reducer body on plain state",
    "instrumented cold-miss replay",
  ],
  [
    "mirrored body: push only",
    "mirrored body: reads + push, no sort",
    "mirrored body: reads + push + sort",
  ],
  [
    "mirrored body: push only",
    "mirrored body: push + sort, no reads",
    "mirrored body: reads + push + sort",
  ],
  [
    "filter the draft, assign unfrozen",
    "read base, filter, assign unfrozen",
    "read base, filter, assign frozen",
  ],
  ["Cache hit (exact revision match)", "Cache hit (latest revision)"],
  [
    "Cache hit (exact revision match)",
    "Cache hit with multiple revisions in ring buffer",
  ],
];

const QUEUE_SPREAD_CHAINS: string[][] = [
  ["bulk enqueue throughput"],
  ["dequeueNext fairness under contention"],
  ["dependency scan with long chains"],
  ["retry loop churn"],
];

const QUEUE_ONLY_SPREAD_CHAINS: string[][] = [
  ["rapid-fire enqueue across documents (disparate payloads)"],
  ["conflicting operations on same document"],
  ["mixed payload sizes with dequeueNext"],
  ["queue hint dependency resolution"],
  ["queue hint complex DAG resolution"],
  ["queue hint dynamic nested DAG resolution"],
];

export const BENCH_TARGETS: BenchTarget[] = [
  {
    name: "auth",
    recordScript: "bench:auth:record",
    resultsFile: "auth-scope.json",
    sourceFiles: ["bench/auth-scope.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:auth:record",
    storage: "stubbed",
    tier: "micro",
    title: "auth-scope microbenchmarks",
    question: "auth evaluation cost per step, isolated from storage",
    caveats: [],
    renames: {},
    stampsFile: "",
    stampedCase: "",
    sizeUnits: AUTH_SIZE_UNITS,
    spreadChains: AUTH_SPREAD_CHAINS,
  },
  {
    name: "auth-storage",
    recordScript: "bench:auth-storage:record",
    resultsFile: "auth-gate-storage.json",
    sourceFiles: ["bench/auth-gate-storage.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:auth-storage:record",
    storage: "pglite",
    tier: "meso",
    title: "auth-gate cost against real storage",
    question:
      "what the admission gate and the read gate cost against a real store, and how the group-roster walk scales with referencer count",
    caveats: [
      "The referencer walk probes at REFERENCER_PROBE_CONCURRENCY, but PGlite serializes every query, so these numbers price the walk without the concurrency a Postgres pool would give it",
      "The admission-gate cases vary the write cache between warm and cold at one grant count; the group fan-out axis is absent, because rebuilding a group stream needs a group document model this package does not register",
      "The pure-CPU anchor case is copied from the micro suite unchanged and touches no storage: it is there to compare machines between the two records, not to measure this one",
    ],
    renames: {},
    stampsFile: "",
    stampedCase: "",
    sizeUnits: [OPERATION_COUNT],
    spreadChains: [],
  },
  {
    name: "events",
    recordScript: "bench:events:record",
    resultsFile: "event-bus.json",
    sourceFiles: ["bench/event-bus.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:events:record",
    storage: "stubbed",
    tier: "micro",
    title: "event-bus microbenchmarks",
    question: "emit cost by subscriber count, filter shape, and payload size",
    caveats: [],
    renames: {
      "50 subscribers (50% sync, 50% yield to macrotask via setImmediate)":
        "50 subscribers (50% sync, 50% yield to macrotask via setImmediate) [reference]",
    },
    stampsFile: "",
    stampedCase: "",
    sizeUnits: [OPERATION_COUNT, DELAY_MS],
    spreadChains: EVENTS_SPREAD_CHAINS,
  },
  {
    name: "queue",
    recordScript: "bench:queue:record",
    resultsFile: "queue-perf.json",
    sourceFiles: ["bench/queue-perf.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:queue:record",
    storage: "stubbed",
    tier: "micro",
    title: "queue throughput microbenchmarks",
    question: "queue cost per job at realistic batch sizes",
    caveats: [
      "Every case includes expect() assertion overhead alongside queue work",
    ],
    renames: {},
    stampsFile: "",
    stampedCase: "",
    sizeUnits: [OPERATION_COUNT],
    spreadChains: QUEUE_SPREAD_CHAINS,
  },
  {
    name: "queue-only",
    recordScript: "bench:queue-only:record",
    resultsFile: "queue-only.json",
    sourceFiles: ["bench/queue-only.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:queue-only:record",
    storage: "stubbed",
    tier: "micro",
    title: "queue microbenchmarks without an executor",
    question: "enqueue and dequeue cost with nothing draining",
    caveats: [
      "The two DAG cases enqueue dependents before their dependencies across sub-queues — valid per the queue contract, but not a shape any reactor producer emits, since executeBatch and loadBatch topologically sort first",
    ],
    renames: {},
    stampsFile: "",
    stampedCase: "",
    sizeUnits: [OPERATION_COUNT],
    spreadChains: QUEUE_ONLY_SPREAD_CHAINS,
  },
  {
    name: "cache",
    recordScript: "bench:cache:record",
    resultsFile: "write-cache.json",
    sourceFiles: ["bench/write-cache.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:cache:record",
    storage: "pglite",
    tier: "micro",
    title: "write-cache microbenchmarks",
    question: "write-cache hit and miss cost against PGlite",
    caveats: [
      "The no-cache baseline compares a cold rebuild against a manual replay — both are a replay, so that pair reads about 1x by construction rather than what the cache is worth",
      "The two keyframe cases are floored by a 100ms drain sleep for fire-and-forget keyframe writes to land, so their difference isn't persistence overhead",
    ],
    renames: cacheRenames(),
    stampsFile: "write-cache-stamps.json",
    stampedCase: "instrumented cold-miss replay",
    sizeUnits: [OPERATION_COUNT],
    spreadChains: CACHE_SPREAD_CHAINS,
  },
  {
    name: "processors",
    recordScript: "bench:processors:record",
    resultsFile: "processor-delivery.json",
    sourceFiles: ["bench/processor-delivery.bench.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:processors:record",
    storage: "pglite",
    tier: "meso",
    title: "processor delivery under concurrent batches",
    question:
      "cost of the processor manager's post-ready pass when many documents' batches arrive at once",
    caveats: [
      "Drives ProcessorManager.indexOperations directly over pre-built batches, so the executor and coordinator are not on the path",
      "The processor waits on a 2ms timer per call, so the figure is dominated by how many calls the manager lets overlap, not by processor work",
    ],
    renames: {},
    stampsFile: "",
    stampedCase: "",
    sizeUnits: [DOCUMENT_COUNT, PROCESSOR_DELAY_MS],
    spreadChains: [],
  },
  {
    name: "sync",
    recordScript: "bench:sync:record",
    resultsFile: "",
    sourceFiles: ["bench/two-reactor-sync.ts"],
    command: "pnpm --filter @powerhousedao/reactor bench:sync:record",
    storage: "pglite",
    tier: "micro",
    title: "two-reactor sync workloads",
    question: "convergence time between two reactors",
    caveats: [
      "Every scenario registers remotes before any write, with both sides writing live — none measures a reactor joining late and catching up",
    ],
    renames: {},
    stampsFile: "",
    stampedCase: "",
    sizeUnits: [OPERATION_COUNT, DOCUMENT_COUNT],
    spreadChains: [],
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

/** The split's per-node slopes, by the name each is recorded under. */
const SPLIT_SLOPE_NAMES = {
  collisionScanUsPerNode: "collision scans per node",
  sortUsPerNode: "sorted-insert comparator per node",
  touchUsPerNode: "residue the buckets leave per node",
  floorUsPerNode: "copy, freeze and assignment floor per node",
  wrapperUsPerNode: "create() and base reducer per node",
  fullUsPerNode: "mirrored body per node",
} as const;
type SplitSlopeKey = keyof typeof SPLIT_SLOPE_NAMES;

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
      name: `${split.leg} leg: ${SPLIT_SLOPE_NAMES.collisionScanUsPerNode}`,
      value: round4(split.collisionScanUsPerNode),
      unit: "us",
      note: `The existence find and handleTargetNameCollisions, as the full mirrored body minus the no-reads variant, ${over}`,
    },
    {
      name: `${split.leg} leg: ${SPLIT_SLOPE_NAMES.sortUsPerNode}`,
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
      name: `${split.leg} leg: ${SPLIT_SLOPE_NAMES.touchUsPerNode}`,
      value: round4(split.touchUsPerNode),
      unit: "us",
      note: `What full-minus-no-reads and full-minus-no-sort leave between the push-only floor and the full mirrored body; on the draft leg that is child drafts and finalize, and the plain leg has no draft for it to be, ${over}`,
    },
    {
      name: `${split.leg} leg: ${SPLIT_SLOPE_NAMES.floorUsPerNode}`,
      value: round4(split.floorUsPerNode),
      unit: "us",
      note: `The push-only variant, which still reads the list, copies it twice, freezes it and assigns it once, ${over}`,
    },
    {
      name: `${split.leg} leg: ${SPLIT_SLOPE_NAMES.wrapperUsPerNode}`,
      value: round4(split.wrapperUsPerNode),
      unit: "us",
      note: `The no-body baseline, which is the wrapper the reducer body does not induce, ${over}`,
    },
    {
      name: `${split.leg} leg: ${SPLIT_SLOPE_NAMES.fullUsPerNode}`,
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

/**
 * A slope that rounds to zero at four decimals is below what the four-point
 * regression resolves, and a JSON zero cannot say so: -0 prints as 0.
 */
function unresolvedSlopeCaveats(split: MirrorSplitReading): string[] {
  const keys = Object.keys(SPLIT_SLOPE_NAMES) as SplitSlopeKey[];
  return keys
    .filter((key) => split[key] !== 0 && round4(split[key]) === 0)
    .map(
      (key) =>
        `${split.leg} leg: ${SPLIT_SLOPE_NAMES[key]} reads 0 but its slope through ${split.counts.map(String).join("/")} ops was ${split[key].toExponential(2)}us${split[key] < 0 ? ", a negative per-node cost" : ""}; that is below the 0.0001us this reading resolves, so it says the cost is too small to measure here, not that it was measured at zero`,
    );
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
    caveats.push(...unresolvedSlopeCaveats(entry));

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

  const derived = [
    ...input.suites.flatMap((suite) => suiteSpreads(suite, input.target)),
    ...input.derived,
  ];
  const conclusions = [
    ...input.suites.flatMap((suite) => suiteConclusions(suite, input.target)),
    ...input.conclusions,
  ];
  const caveats = [
    ...input.target.caveats,
    ...earnedCaveats(input.suites),
    ...input.caveats,
  ];

  return {
    kind: "micro",
    tier: input.target.tier,
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

/** Cases of one suite that ran the same stated size on one leg. */
type WorkloadGroup = {
  /** Empty when the cases state no size of their own. */
  size: string;
  /** Empty when the cases name no leg of their own. */
  leg: string;
  cases: MicroCase[];
};

/** The cases a suite's spread may pair, and the reference costs it may not. */
type SuiteSplit = {
  sweep: MicroCase[];
  references: MicroCase[];
};

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One unit's count as a case name states it, or undefined when it states none. */
function statedCount(name: string, unit: SizeUnit): number | undefined {
  const words = [...unit.words]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join("|");
  const match = new RegExp(
    `(\\d+)\\s*(?:[a-z]+\\s+)?(?:${words})(?!\\w)`,
    "i",
  ).exec(name);
  return match === null ? undefined : Number(match[1]);
}

/**
 * The size a case name states in the target's units, or empty when it states
 * none. A case name is the only place the harness says how much work the case
 * did, so it is the only thing a spread can hold fixed.
 */
function statedSize(name: string, units: SizeUnit[]): string {
  return units
    .map((unit) => ({ unit, count: statedCount(name, unit) }))
    .filter((stated) => stated.count !== undefined)
    .map((stated) => `${String(stated.count)} ${stated.unit.label}`)
    .join(", ");
}

/** What a suite with no pair could not hold fixed, in the target's own words. */
function sizeNoun(units: SizeUnit[]): string {
  const nouns = units.map((unit) => unit.noun);
  return nouns.length < 2
    ? nouns.join("")
    : `${nouns.slice(0, -1).join(", ")} or ${nouns[nouns.length - 1]}`;
}

function isReferenceCase(name: string): boolean {
  return name.trimEnd().endsWith(REFERENCE_CASE_MARKER);
}

/** A pair against a case on another mechanism prices that mechanism and reads as the sweep's range; a suite of nothing but markers separates nothing, so it is its own sweep. */
function splitReferences(suite: MicroSuite): SuiteSplit {
  const sweep = suite.cases.filter((entry) => !isReferenceCase(entry.name));
  if (sweep.length === 0) {
    return { sweep: suite.cases, references: [] };
  }
  return {
    sweep,
    references: suite.cases.filter((entry) => isReferenceCase(entry.name)),
  };
}

/** A pair across two legs prices the leg as much as what the sweep varies. */
function statedLeg(name: string): string {
  return SPLIT_CASE.exec(name)?.[1] ?? "";
}

/** Cases stating no count at all are one set, the suite's own construction; once any case states one, a case stating none is comparable to nothing. */
function workloadGroups(
  cases: MicroCase[],
  units: SizeUnit[],
): WorkloadGroup[] {
  const tagged = cases.map((entry) => ({
    entry,
    size: statedSize(entry.name, units),
    leg: statedLeg(entry.name),
  }));
  if (tagged.every((item) => item.size === "")) {
    return [{ size: "", leg: "", cases }];
  }

  const groups: WorkloadGroup[] = [];
  const byWorkload = new Map<string, WorkloadGroup>();
  for (const item of tagged) {
    const workload = `${item.size} ${item.leg}`;
    const existing = byWorkload.get(workload);
    if (item.size !== "" && existing !== undefined) {
      existing.cases.push(item.entry);
      continue;
    }
    const group: WorkloadGroup = {
      size: item.size,
      leg: item.leg,
      cases: [item.entry],
    };
    if (item.size !== "") {
      byWorkload.set(workload, group);
    }
    groups.push(group);
  }
  return groups;
}

/** What a group held fixed, which its spread has to say it held fixed. */
function heldFixed(group: WorkloadGroup): string {
  return group.leg === ""
    ? group.size
    : `${group.size} on the ${group.leg} leg`;
}

/** What each case states about its own workload, for a note that has to say why. */
function statedCounts(cases: MicroCase[], units: SizeUnit[]): string {
  return cases
    .map((entry) => {
      const size = statedSize(entry.name, units);
      return size === ""
        ? `${entry.name}: no stated count`
        : `${entry.name}: ${size}`;
    })
    .join("; ");
}

/**
 * One spread per set of sweep cases that ran the same stated size, rather
 * than one fastest-over-slowest for the suite. A pair that differs in workload
 * size prices the size as much as the mechanism, and a pair that crosses into a
 * reference case prices that mechanism; either ratio reads as though it priced
 * the sweep alone. A suite that holds one size throughout keeps the single
 * `<label>: spread` it has always filed.
 */
function suiteSpreads(suite: MicroSuite, target: BenchTarget): DerivedRatio[] {
  const label = suiteLabel(suite.fullName);
  const units = target.sizeUnits;
  const { sweep } = splitReferences(suite);
  const groups = workloadGroups(sweep, units);
  const paired = pairGroups(label, groups, target.spreadChains);

  if (paired.length === 0) {
    return [
      {
        name: `${label}: comparable pairs`,
        value: 0,
        unit: "count",
        note: `No two cases ran the same stated ${sizeNoun(units)} (${statedCounts(sweep, units)}), so a fastest-over-slowest ratio here would price the size rather than the mechanism`,
      },
    ];
  }

  if (paired.every((item) => item.pairs.length === 0)) {
    return [
      {
        name: `${label}: comparable pairs`,
        value: 0,
        unit: "count",
        note: `Every case is declared a workload of its own (${sweep.map((entry) => entry.name).join("; ")}), so no ratio between them isolates a mechanism`,
      },
    ];
  }

  return paired.flatMap(({ group, pairs }) =>
    pairs.map((pair) => spreadReading(label, groups.length, group, pair)),
  );
}

function spreadReading(
  label: string,
  groupCount: number,
  group: WorkloadGroup,
  pair: SpreadPair,
): DerivedRatio {
  const reading = pair.step === "" ? "spread" : pair.step;
  const at = heldFixed(group);
  const ratio = `${pair.over.name} over ${pair.under.name}`;
  return {
    name:
      groupCount === 1
        ? `${label}: ${reading}`
        : `${label}: ${reading} at ${at}`,
    value: round(pair.over.hz / pair.under.hz),
    unit: "x",
    note: groupCount === 1 ? ratio : `${ratio}, both at ${at}`,
  };
}

/** Two cases a spread divides, and the declared step between them. */
type SpreadPair = {
  over: MicroCase;
  under: MicroCase;
  /** Empty for the fastest over the slowest of a group of two. */
  step: string;
};

type PairedGroup = {
  group: WorkloadGroup;
  pairs: SpreadPair[];
};

function whereHeld(label: string, group: WorkloadGroup): string {
  return group.size === "" ? label : `${label} at ${heldFixed(group)}`;
}

function namesFragment(name: string, fragment: string): boolean {
  return new RegExp(
    `(?<![A-Za-z0-9])${escapeRegExp(fragment)}(?![A-Za-z0-9])`,
  ).test(name);
}

function fragmentCase(
  label: string,
  group: WorkloadGroup,
  fragment: string,
): MicroCase | undefined {
  const matches = group.cases.filter((entry) =>
    namesFragment(entry.name, fragment),
  );
  if (matches.length > 1) {
    throw new Error(
      `${whereHeld(label, group)}: the spread chain fragment "${fragment}" names ${String(matches.length)} cases (${matches.map((entry) => entry.name).join("; ")}), so no step can say which one it pairs`,
    );
  }
  return matches[0];
}

/** A group of three or more pairs only what the target declares, or nothing. */
function groupPairs(
  label: string,
  group: WorkloadGroup,
  chains: string[][],
): SpreadPair[] {
  if (group.cases.length <= 2) {
    return [
      {
        over: extreme(group.cases, (a, b) => a.hz > b.hz),
        under: extreme(group.cases, (a, b) => a.hz < b.hz),
        step: "",
      },
    ];
  }

  const pairs: SpreadPair[] = [];
  const placed = new Set<MicroCase>();
  for (const chain of chains) {
    const links = chain.map((fragment) => ({
      fragment,
      entry: fragmentCase(label, group, fragment),
    }));
    if (links.length === 1 && links[0].entry !== undefined) {
      placed.add(links[0].entry);
    }
    for (let index = 1; index < links.length; index++) {
      const from = links[index - 1];
      const to = links[index];
      if (from.entry === undefined || to.entry === undefined) {
        continue;
      }
      pairs.push({
        over: from.entry,
        under: to.entry,
        step: `${from.fragment} vs ${to.fragment}`,
      });
      placed.add(from.entry);
      placed.add(to.entry);
    }
  }

  const unplaced = group.cases.filter((entry) => !placed.has(entry));
  if (unplaced.length > 0) {
    throw new Error(
      `${whereHeld(label, group)} has ${String(group.cases.length)} comparable cases, so its fastest over its slowest would drop every case between them, and ${unplaced.map((entry) => entry.name).join("; ")} sit on no declared step. Add the adjacent steps to the target's spreadChains, or mark the extras ${REFERENCE_CASE_MARKER}`,
    );
  }
  return pairs;
}

function pairGroups(
  label: string,
  groups: WorkloadGroup[],
  chains: string[][],
): PairedGroup[] {
  return groups
    .filter((group) => group.cases.length > 1)
    .map((group) => ({ group, pairs: groupPairs(label, group, chains) }));
}

/**
 * Restates a measured ratio rather than claiming anything about why. Something
 * has to fill `conclusions`, which is min(1), and model prose must not be what
 * fills it. A suite with no two cases at one size gets a sentence that says so:
 * the alternative is a headline that reads as a mechanism and is an op count.
 */
function suiteConclusions(suite: MicroSuite, target: BenchTarget): string[] {
  const label = suiteLabel(suite.fullName);
  const units = target.sizeUnits;
  const { sweep, references } = splitReferences(suite);
  const groups = workloadGroups(sweep, units);
  const paired = pairGroups(label, groups, target.spreadChains);
  const held = references.map(
    (entry) =>
      `In ${label}, ${entry.name} ran at ${round(entry.hz)} ops/sec, held out of the spread as a reference cost on another mechanism`,
  );
  const rates = sweep
    .map((entry) => `${entry.name} at ${round(entry.hz)} ops/sec`)
    .join(", ");

  if (paired.length === 0) {
    if (sweep.length === 1) {
      return [
        `In ${label}, ${sweep[0].name} ran at ${round(sweep[0].hz)} ops/sec`,
        ...held,
      ];
    }
    return [
      `In ${label}, no two cases ran the same stated ${sizeNoun(units)}, so the suite has no spread that isolates the mechanism: ${rates}`,
      ...held,
    ];
  }

  if (paired.every((item) => item.pairs.length === 0)) {
    return [
      `In ${label}, every case is declared a workload of its own, so the suite has no spread that isolates a mechanism: ${rates}`,
      ...held,
    ];
  }

  const spreads = paired.flatMap(({ group, pairs }) =>
    pairs.map((pair) => {
      const at = groups.length === 1 ? "" : ` at ${heldFixed(group)}`;
      const ratio = round(pair.over.hz / pair.under.hz);
      return pair.step === ""
        ? `In ${label}${at}, ${pair.under.name} is ${ratio}x slower than ${pair.over.name}`
        : `In ${label}${at}, ${pair.over.name} runs at ${ratio}x the rate of ${pair.under.name}`;
    }),
  );
  return [...spreads, ...held];
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
  const rounded = Number(value.toFixed(4));
  return Object.is(rounded, -0) ? 0 : rounded;
}
