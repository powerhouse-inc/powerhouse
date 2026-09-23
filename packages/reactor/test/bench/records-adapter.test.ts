import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BenchmarkEntry,
  MicroSuite,
} from "../../bench/records/benchmark-schema.js";
import type { MachineEnvironment } from "../../bench/records/benchmark-schema.js";
import { parseFromVitestOptions } from "../../bench/records/from-vitest-options.js";
import {
  BENCH_TARGETS,
  buildMicroEntry,
  findTarget,
  sourceFilesFromVitest,
  stampReadings,
  suiteLabel,
  suitesFromTinybench,
  suitesFromVitest,
  VitestBenchReport,
} from "../../bench/records/from-vitest.js";
import type {
  BenchTarget,
  TinybenchTask,
} from "../../bench/records/from-vitest.js";

const FIXTURE = join(
  import.meta.dirname,
  "fixtures",
  "auth-scope-trimmed.json",
);

const ENVIRONMENT: MachineEnvironment = {
  host: "mac-studio-m2",
  os: "darwin 24.6.0",
  cpu: "Apple M2 Max",
  cores: 12,
  node: "v22.14.0",
  reactorSha: "c9d01b3",
  storage: "stubbed",
};

function report(): VitestBenchReport {
  return VitestBenchReport.parse(
    JSON.parse(readFileSync(FIXTURE, "utf8")) as unknown,
  );
}

function entryFor(
  target: BenchTarget,
  overrides: Partial<Parameters<typeof buildMicroEntry>[0]> = {},
): Record<string, unknown> {
  return buildMicroEntry({
    target,
    runner: "vitest-bench",
    runnerVersion: "4.1.1",
    suites: suitesFromVitest(report()),
    environment: ENVIRONMENT,
    recordedAt: "2026-09-01T12:00:00.000Z",
    derived: [],
    conclusions: [],
    caveats: [],
    title: "",
    question: "",
    tags: [],
    tasks: [],
    supersedes: [],
    ...overrides,
  });
}

describe("suitesFromVitest", () => {
  it("renames every field to its unit-suffixed form without touching the value", () => {
    const raw = report().files[0].groups[0].benchmarks[0];
    const converted = suitesFromVitest(report())[0].cases[0];

    expect(converted).toEqual({
      name: raw.name,
      rank: raw.rank,
      hz: raw.hz,
      meanMs: raw.mean,
      medianMs: raw.median,
      minMs: raw.min,
      maxMs: raw.max,
      rmePct: raw.rme,
      sampleCount: raw.sampleCount,
      totalTimeMs: raw.totalTime,
      vitestId: raw.id,
      p75Ms: raw.p75,
      p99Ms: raw.p99,
      p999Ms: raw.p999,
    });
  });

  it("stamps a renamed case with the name it continues", () => {
    const current = report().files[0].groups[0].benchmarks[0].name;
    const suites = suitesFromVitest(report(), { "the old name": current });
    expect(suites[0].cases[0].continues).toBe("the old name");
    expect(suites[0].cases[1]?.continues).toBeUndefined();
  });

  it("keeps one suite per group, nested groups included", () => {
    const suites = suitesFromVitest(report());

    expect(suites.map((suite) => suite.fullName)).toEqual([
      "bench/auth-scope.bench.ts > auth policy evaluation (pure CPU)",
      "bench/auth-scope.bench.ts > auth policy evaluation (pure CPU) > group principals",
    ]);
  });

  it("drops a group that ran no cases rather than emitting an empty suite", () => {
    const empty = report();
    empty.files[0].groups[0].benchmarks = [];

    expect(suitesFromVitest(empty)).toHaveLength(1);
  });

  it("makes the source path relative to where the run happened", () => {
    expect(sourceFilesFromVitest(report(), "/repo/packages/reactor")).toEqual([
      "bench/auth-scope.bench.ts",
    ]);
  });

  it("tolerates a vitest version that adds a field", () => {
    const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      files: { groups: { benchmarks: Record<string, unknown>[] }[] }[];
    };
    raw.files[0].groups[0].benchmarks[0].newKeyFromAnUpgrade = 1;

    expect(VitestBenchReport.safeParse(raw).success).toBe(true);
  });

  it("rejects a report missing a number the payload requires", () => {
    const raw = JSON.parse(readFileSync(FIXTURE, "utf8")) as {
      files: { groups: { benchmarks: Record<string, unknown>[] }[] }[];
    };
    delete raw.files[0].groups[0].benchmarks[0].median;

    expect(VitestBenchReport.safeParse(raw).success).toBe(false);
  });
});

describe("suitesFromTinybench", () => {
  const task = (
    name: string,
    hz: number,
    samples: number[],
  ): TinybenchTask => ({
    name,
    continues: "",
    samples,
    rme: 1.5,
    totalTime: 10000,
    min: Math.min(...samples),
    max: Math.max(...samples),
    hz,
    mean: samples.reduce((a, b) => a + b, 0) / samples.length,
    p75: 0,
    p99: 0,
    p999: 0,
  });

  it("synthesizes the rank, median and sample count vitest would have added", () => {
    const suites = suitesFromTinybench("two-reactor sync", [
      task("slow", 2, [500, 400, 600]),
      task("fast", 10, [100, 90, 110, 130]),
    ]);

    expect(suites[0].cases.map((entry) => [entry.name, entry.rank])).toEqual([
      ["fast", 1],
      ["slow", 2],
    ]);
    expect(suites[0].cases[0].medianMs).toBe(105);
    expect(suites[0].cases[0].sampleCount).toBe(4);
    expect(suites[0].cases[1].medianMs).toBe(500);
  });

  it("carries a renamed case's earlier name, and nothing for one never renamed", () => {
    const renamed = {
      ...task("slow (writes to convergence)", 2, [500, 400, 600]),
      continues: "slow",
    };
    const suites = suitesFromTinybench("two-reactor sync", [
      renamed,
      task("fast", 10, [100, 90, 110, 130]),
    ]);
    expect(suites[0].cases[1].continues).toBe("slow");
    expect("continues" in suites[0].cases[0]).toBe(false);
    expect(() => MicroSuite.parse(suites[0])).not.toThrow();
  });

  it("produces something the payload accepts", () => {
    const entry = entryFor(findTarget("sync"), {
      runner: "tinybench",
      runnerVersion: "2.9.0",
      suites: suitesFromTinybench("two-reactor sync", [
        task("slow", 2, [500, 400, 600]),
        task("fast", 10, [100, 90, 110, 130]),
      ]),
    });

    expect(BenchmarkEntry.safeParse({ ...entry, id: "B-001" }).success).toBe(
      true,
    );
  });
});

/**
 * A suite whose case names state their own operation counts, which is what the
 * recorder groups on before it takes a fastest and a slowest.
 */
function sizedSuite(fullName: string, rates: [string, number][]): MicroSuite {
  const ranked = [...rates].sort((a, b) => b[1] - a[1]);
  return {
    fullName,
    cases: ranked.map(([name, hz], index) => ({
      name,
      rank: index + 1,
      hz,
      meanMs: 1000 / hz,
      medianMs: 1000 / hz,
      minMs: 1000 / hz,
      maxMs: 1000 / hz,
      rmePct: 1,
      sampleCount: 200,
      totalTimeMs: 1000,
    })),
  };
}

describe("buildMicroEntry", () => {
  it("produces an entry the store accepts once an id is allocated", () => {
    const entry = entryFor(findTarget("auth"));

    const parsed = BenchmarkEntry.parse({ ...entry, id: "B-001" });

    expect(parsed.kind).toBe("micro");
    expect(parsed.tier).toBe("micro");
  });

  it("takes the tier from the target, so a stored call site is not filed as micro", () => {
    expect(entryFor(findTarget("auth-storage")).tier).toBe("meso");
  });

  it("never offers an id, which add-benchmark rejects", () => {
    expect(entryFor(findTarget("auth"))).not.toHaveProperty("id");
  });

  it("derives one conclusion and one reading per suite from the numbers", () => {
    const entry = entryFor(findTarget("auth"));
    const results = entry.results as { derived: { name: string }[] };

    expect(entry.conclusions).toHaveLength(2);
    expect(results.derived.map((reading) => reading.name)).toEqual([
      "auth policy evaluation (pure CPU): comparable pairs",
      "auth policy evaluation (pure CPU) > group principals: comparable pairs",
    ]);
  });

  it("holds the grant count an auth case names fixed", () => {
    const suites = [
      sizedSuite("bench/auth-scope.bench.ts > auth scope write validation", [
        ["retention: 10 grants, administered from the top", 17000000],
        ["retention: 100 grants, administered from the top", 3800000],
        ["retention: 10 grants, shadow walk before an anyone allow", 680000],
        ["retention: 100 grants, shadow walk before an anyone allow", 55000],
      ]),
    ];

    const results = entryFor(findTarget("auth"), { suites }).results as {
      derived: { name: string; value: number; note: string }[];
    };

    expect(
      results.derived.map((reading) => [reading.name, reading.value]),
    ).toEqual([
      ["auth scope write validation: spread at 10 grants", 25],
      ["auth scope write validation: spread at 100 grants", 69.09],
    ]);
  });

  it("pairs no auth cases that differ in any stated size", () => {
    const suites = [
      sizedSuite("bench/auth-scope.bench.ts > conditions", [
        ["evaluateGrantStack: 100 grants x 100 condition nodes", 4700],
        ["evaluateGrantStack: 100 conditional grants, no context", 6400000],
        ["1 referencer(s), reader outside the audience", 270000],
        ["5 distinct group(s)", 200000],
      ]),
    ];

    const entry = entryFor(findTarget("auth"), { suites });
    const results = entry.results as {
      derived: { name: string; value: number; note: string }[];
    };

    expect(results.derived).toHaveLength(1);
    expect(results.derived[0]).toMatchObject({
      name: "conditions: comparable pairs",
      value: 0,
    });
    for (const stated of [
      "evaluateGrantStack: 100 grants x 100 condition nodes: 100 grants, 100 nodes",
      "evaluateGrantStack: 100 conditional grants, no context: 100 grants",
      "1 referencer(s), reader outside the audience: 1 referencer(s)",
      "5 distinct group(s): 5 group(s)",
    ]) {
      expect(results.derived[0].note).toContain(stated);
    }
  });

  it("appends the caller's claims rather than replacing what was measured", () => {
    const entry = entryFor(findTarget("auth"), {
      conclusions: ["group lookup dominates once the roster passes 1000"],
    });

    expect(entry.conclusions).toHaveLength(3);
    expect((entry.conclusions as string[]).at(-1)).toBe(
      "group lookup dominates once the roster passes 1000",
    );
  });

  it("earns a caveat from a case whose margin of error is large", () => {
    const caveats = entryFor(findTarget("auth")).caveats as string[];

    expect(caveats).toContain(
      "auth policy evaluation (pure CPU) / evaluateGrantStack: 2 grants: rme 5.59%, so the run measured noise as much as the system",
    );
  });

  it("earns a caveat from a case with too few samples to mean much", () => {
    const suites = suitesFromVitest(report());
    suites[0].cases[0].sampleCount = 12;

    const caveats = entryFor(findTarget("auth"), { suites })
      .caveats as string[];

    expect(caveats).toContain(
      "auth policy evaluation (pure CPU) / evaluateGrantStack: 2 grants: 12 samples, too few for the spread to mean much",
    );
  });

  it("attaches the harness caveats a target always carries", () => {
    // Pinned against the target table rather than a literal, because a caveat
    // that outlives the defect it describes discredits sound numbers - which
    // is exactly what happened when the cache bench was fixed and this test
    // went on asserting the old text.
    const target = findTarget("cache");
    const caveats = entryFor(target, {
      derived: [{ name: "a harness reading", value: 1, unit: "us" }],
    }).caveats as string[];

    expect(target.caveats.length).toBeGreaterThan(0);
    expect(caveats.slice(0, target.caveats.length)).toEqual(target.caveats);
  });

  it("puts the target's own caveats before the ones the numbers earned", () => {
    const target = findTarget("auth");
    const caveats = entryFor(target, {
      caveats: ["something the caller added"],
    }).caveats as string[];

    expect(caveats.at(-1)).toBe("something the caller added");
  });

  it("records one invocation, because that is what a run is", () => {
    const results = entryFor(findTarget("auth")).results as {
      protocol: { repetitions: number; interleaved: boolean };
    };

    expect(results.protocol).toMatchObject({
      repetitions: 1,
      interleaved: false,
    });
  });

  it("reports a single-case suite without inventing a comparison", () => {
    const suites = suitesFromVitest(report());
    suites[0].cases = [suites[0].cases[0]];

    const entry = entryFor(findTarget("auth"), { suites });

    expect((entry.conclusions as string[])[0]).toContain("ran at");
  });

  it("gives a suite one spread per operation count its case names state", () => {
    const suites = [
      sizedSuite("bench/write-cache.bench.ts > vs No-Cache", [
        ["No-cache baseline: manual rebuild (100 operations)", 100],
        ["With cache: rebuild (100 operations)", 150],
        ["No-cache baseline: manual rebuild (1000 operations)", 2],
        ["With cache: rebuild (1000 operations)", 13],
      ]),
    ];

    const entry = entryFor(findTarget("queue"), { suites });
    const results = entry.results as {
      derived: { name: string; value: number; unit: string; note: string }[];
    };

    expect(results.derived).toEqual([
      {
        name: "vs No-Cache: spread at 100 operations",
        value: 1.5,
        unit: "x",
        note: "With cache: rebuild (100 operations) over No-cache baseline: manual rebuild (100 operations), both at 100 operations",
      },
      {
        name: "vs No-Cache: spread at 1000 operations",
        value: 6.5,
        unit: "x",
        note: "With cache: rebuild (1000 operations) over No-cache baseline: manual rebuild (1000 operations), both at 1000 operations",
      },
    ]);
    expect(entry.conclusions).toEqual([
      "In vs No-Cache at 100 operations, No-cache baseline: manual rebuild (100 operations) is 1.5x slower than With cache: rebuild (100 operations)",
      "In vs No-Cache at 1000 operations, No-cache baseline: manual rebuild (1000 operations) is 6.5x slower than With cache: rebuild (1000 operations)",
    ]);
  });

  it("says so rather than ranking cases that ran different amounts of work", () => {
    const suites = [
      sizedSuite("bench/write-cache.bench.ts > Warm Miss", [
        ["Warm miss rebuild (10 incremental operations)", 600],
        ["Warm miss rebuild (50 incremental operations)", 200],
        ["Warm miss with nearby cached revision", 900],
      ]),
    ];

    const entry = entryFor(findTarget("queue"), { suites });
    const results = entry.results as {
      derived: { name: string; value: number; unit: string }[];
    };

    expect(results.derived).toHaveLength(1);
    expect(results.derived[0]).toMatchObject({
      name: "Warm Miss: comparable pairs",
      value: 0,
      unit: "count",
    });
    expect((entry.conclusions as string[])[0]).toContain(
      "no two cases ran the same stated operation count",
    );
    expect((entry.conclusions as string[])[0]).not.toContain("x slower");
  });

  it("keeps the one spread a suite that holds its workload fixed has filed", () => {
    const suites = [
      sizedSuite("bench/write-cache.bench.ts > Decomposition (100 ops)", [
        ["cold miss 100 ops: instrumented cold-miss replay", 150],
        ["cold miss 100 ops: input validation only", 285],
      ]),
    ];

    const results = entryFor(findTarget("queue"), { suites }).results as {
      derived: { name: string; note: string }[];
    };

    expect(results.derived).toHaveLength(1);
    expect(results.derived[0].name).toBe("Decomposition (100 ops): spread");
    expect(results.derived[0].note).toBe(
      "cold miss 100 ops: input validation only over cold miss 100 ops: instrumented cold-miss replay",
    );
  });

  it("holds a reference case out of the spread it would otherwise headline", () => {
    const suites = [
      sizedSuite("bench/event-bus.bench.ts > Mixed", [
        ["10 subscribers (90% sync, 10% async)", 1600000],
        ["25 subscribers (50% sync, 50% async)", 590000],
        ["50 subscribers (50% sync, 50% async)", 320000],
        [
          "50 subscribers (50% sync, 50% yield via setImmediate) [reference]",
          2900,
        ],
      ]),
    ];

    const entry = entryFor(findTarget("queue"), { suites });
    const results = entry.results as {
      derived: { name: string; value: number; unit: string; note: string }[];
    };

    expect(results.derived).toEqual([
      {
        name: "Mixed: spread",
        value: 5,
        unit: "x",
        note: "10 subscribers (90% sync, 10% async) over 50 subscribers (50% sync, 50% async)",
      },
    ]);
    expect(entry.conclusions).toEqual([
      "In Mixed, 50 subscribers (50% sync, 50% async) is 5x slower than 10 subscribers (90% sync, 10% async)",
      "In Mixed, 50 subscribers (50% sync, 50% yield via setImmediate) [reference] ran at 2900 ops/sec, held out of the spread as a reference cost on another mechanism",
    ]);
  });

  it("treats a suite of nothing but reference cases as its own sweep", () => {
    const suites = [
      sizedSuite("bench/event-bus.bench.ts > All Reference", [
        ["fast [reference]", 400],
        ["slow [reference]", 100],
      ]),
    ];

    const results = entryFor(findTarget("queue"), { suites }).results as {
      derived: { name: string; value: number }[];
    };

    expect(results.derived).toEqual([
      expect.objectContaining({ name: "All Reference: spread", value: 4 }),
    ]);
  });

  it("holds the leg a case names fixed, as well as the operation count", () => {
    const suites = [
      sizedSuite("bench/write-cache.bench.ts > Read/Write Split", [
        ["draft leg 100 ops: mirrored body: reads + push + sort", 1900],
        ["draft leg 100 ops: mirrored body: push only", 3200],
        ["plain leg 100 ops: mirrored body: reads + push + sort", 5100],
        ["plain leg 100 ops: mirrored body: push only", 89000],
      ]),
    ];

    const entry = entryFor(findTarget("queue"), { suites });
    const results = entry.results as {
      derived: { name: string; value: number; note: string }[];
    };

    expect(
      results.derived.map((reading) => [reading.name, reading.value]),
    ).toEqual([
      ["Read/Write Split: spread at 100 operations on the plain leg", 17.45],
      ["Read/Write Split: spread at 100 operations on the draft leg", 1.68],
    ]);
    expect(results.derived[0].note).toBe(
      "plain leg 100 ops: mirrored body: push only over plain leg 100 ops: mirrored body: reads + push + sort, both at 100 operations on the plain leg",
    );
    expect((entry.conclusions as string[])[1]).toBe(
      "In Read/Write Split at 100 operations on the draft leg, draft leg 100 ops: mirrored body: reads + push + sort is 1.68x slower than draft leg 100 ops: mirrored body: push only",
    );
  });

  it("stamps the split baselines with the names they continue", () => {
    const renamed = findTarget("cache").renames;

    expect(
      renamed["draft leg 100 ops: no body: create() + base reducer only"],
    ).toBe(
      "draft leg 100 ops: no body: create() + base reducer only [reference]",
    );
    expect(renamed["plain leg 2000 ops: real body (fidelity reference)"]).toBe(
      "plain leg 2000 ops: real body (fidelity reference) [reference]",
    );
  });

  it("stamps the macrotask reference case with the name it continues", () => {
    const renamed = findTarget("events").renames;

    expect(
      renamed[
        "50 subscribers (50% sync, 50% yield to macrotask via setImmediate)"
      ],
    ).toBe(
      "50 subscribers (50% sync, 50% yield to macrotask via setImmediate) [reference]",
    );
  });
});

/**
 * A sidecar reading, in the shape write-cache.bench.ts files. Built here rather
 * than checked in as a file so a change to the bench's payload breaks the test
 * that asserts the recorder reads it.
 */
function reading(label: string, overrides: Record<string, unknown> = {}) {
  return {
    label,
    wallCalls: 100,
    bodyCalls: 100,
    wallMs: 8,
    bodyMs: 6,
    wallUsPerCall: 80,
    bodyUsPerWallCall: 60,
    outsideUsPerWallCall: 20,
    bodyUsPerBodyCall: 60,
    bodySharePct: 75,
    ...overrides,
  };
}

/** One leg's split, in the shape write-cache.bench.ts files it. */
function split(leg: string, overrides: Record<string, unknown> = {}) {
  return {
    leg,
    counts: [100, 1000],
    fullUsPerNode: 0.04,
    collisionScanUsPerNode: 0.01,
    sortUsPerNode: 0.028,
    touchUsPerNode: 0.001,
    floorUsPerNode: 0.001,
    wrapperUsPerNode: 0.0002,
    stampedBodyUsPerNode: 0.038,
    realBodyUsPerNode: 0.04,
    collisionScanSharePct: 25,
    sortSharePct: 70,
    touchSharePct: 2.5,
    floorSharePct: 2.5,
    scanPlusSortSharePct: 95,
    mirrorOverRealSlope: 0.95,
    ...overrides,
  };
}

/** One split leg's cases, which the sidecar's split has to pair with. */
function splitSuite(leg: string, sampleCount: number): MicroSuite {
  return {
    fullName: "bench/write-cache.bench.ts > Read/Write Split",
    cases: [100, 1000].map((count, index) => ({
      name: `${leg} leg ${String(count)} ops: mirrored body: reads + push + sort`,
      rank: index + 1,
      hz: 10,
      meanMs: 100,
      medianMs: 100,
      minMs: 90,
      maxMs: 110,
      rmePct: 1,
      sampleCount,
      totalTimeMs: 2000,
    })),
  };
}

function stampedSuites(
  labels: string[],
  legs: string[] = ["plain"],
  sampleCount = 400,
): MicroSuite[] {
  return [
    ...labels.map((label) => ({
      fullName: `bench/write-cache.bench.ts > Decomposition (${label})`,
      cases: [
        {
          name: `${label}: instrumented cold-miss replay`,
          rank: 1,
          hz: 10,
          meanMs: 100,
          medianMs: 100,
          minMs: 90,
          maxMs: 110,
          rmePct: 1,
          sampleCount: 20,
          totalTimeMs: 2000,
        },
      ],
    })),
    ...legs.map((leg) => splitSuite(leg, sampleCount)),
  ];
}

/** Writes a sidecar into a throwaway results directory and returns its path. */
function withSidecar(stamps: unknown[], splits: unknown[] = [split("plain")]) {
  const directory = mkdtempSync(join(tmpdir(), "bench-stamps-"));
  writeFileSync(
    join(directory, "write-cache-stamps.json"),
    JSON.stringify({ version: 2, stamps, splits }),
  );
  return directory;
}

describe("stampReadings", () => {
  it("carries a figure no case mean can hold into the entry", () => {
    // The defect this exists for: the decomposition reached stdout and the
    // record cited it anyway, so a reader had nothing to check.
    const directory = withSidecar([reading("cold miss 100 ops")]);

    const { derived } = stampReadings(
      findTarget("cache"),
      directory,
      stampedSuites(["cold miss 100 ops"]),
    );

    expect(
      derived.filter((item) => item.name.startsWith("cold miss 100 ops")),
    ).toEqual([
      {
        name: "cold miss 100 ops: module.reducer wall",
        value: 80,
        unit: "us",
        note: "Wall time of one module.reducer call, over 100 module.reducer calls totalling 8ms",
      },
      {
        name: "cold miss 100 ops: reducer body in draft",
        value: 60,
        unit: "us",
        note: "The custom reducer body, measured inside the mutative draft, per module.reducer call. 6ms over 100 state-reducer calls, or 60us each",
      },
      {
        name: "cold miss 100 ops: create() draft+finalize+base",
        value: 20,
        unit: "us",
        note: "Wall minus body per module.reducer call: everything create() and the base reducer do around the body, over 100 module.reducer calls totalling 8ms",
      },
      {
        name: "cold miss 100 ops: reducer body share",
        value: 75,
        unit: "pct",
        note: "Share of module.reducer wall time spent inside the custom reducer body",
      },
    ]);
  });

  it("reads nothing for a benchmark whose case means say it all", () => {
    expect(stampReadings(findTarget("auth"), "nowhere", [])).toEqual({
      derived: [],
      conclusions: [],
      caveats: [],
    });
  });

  it("refuses to record a stamped benchmark whose sidecar is absent", () => {
    expect(() =>
      stampReadings(
        findTarget("cache"),
        join(tmpdir(), "bench-stamps-absent"),
        stampedSuites(["cold miss 100 ops"]),
      ),
    ).toThrow("Run bench:cache:record first");
  });

  it("refuses a run whose stamped case filed no reading", () => {
    const directory = withSidecar([reading("cold miss 100 ops")]);

    expect(() =>
      stampReadings(
        findTarget("cache"),
        directory,
        stampedSuites(["cold miss 100 ops", "cold miss 2000 ops"]),
      ),
    ).toThrow("cold miss 2000 ops: instrumented cold-miss replay");
  });

  it("refuses a sidecar that outlived the suite that wrote it", () => {
    // Stale readings are worse than none: they describe code that did not run.
    const directory = withSidecar([
      reading("cold miss 100 ops"),
      reading("cold miss 5000 ops"),
    ]);

    expect(() =>
      stampReadings(
        findTarget("cache"),
        directory,
        stampedSuites(["cold miss 100 ops"]),
      ),
    ).toThrow("Readings with no case in the report");
  });

  it("earns a caveat when one wall call drove many body calls", () => {
    // Then the two per-call means have different denominators and comparing
    // them is the arithmetic that used to print a negative create() share.
    const directory = withSidecar([
      reading("cold miss 100 ops", { bodyCalls: 400 }),
    ]);

    const { caveats } = stampReadings(
      findTarget("cache"),
      directory,
      stampedSuites(["cold miss 100 ops"]),
    );

    expect(caveats).toEqual([
      "cold miss 100 ops: 100 module.reducer calls drove 400 state-reducer calls, so the body figure per module.reducer call aggregates more than one invocation and the two per-call means are not comparable",
    ]);
  });

  it("carries the plain leg's scan-and-sort split into the entry", () => {
    // T-025: the subtraction was in the case means and in stdout, and nowhere
    // a reader of the record could find it.
    const directory = withSidecar([reading("cold miss 100 ops")]);

    const { derived, conclusions } = stampReadings(
      findTarget("cache"),
      directory,
      stampedSuites(["cold miss 100 ops"]),
    );

    expect(
      derived
        .filter((item) => item.name.startsWith("plain leg: "))
        .map((item) => [item.name, item.value, item.unit]),
    ).toEqual([
      ["plain leg: collision scans per node", 0.01, "us"],
      ["plain leg: sorted-insert comparator per node", 0.028, "us"],
      ["plain leg: scan + sort share of the mirrored body", 95, "pct"],
      ["plain leg: residue the buckets leave per node", 0.001, "us"],
      ["plain leg: copy, freeze and assignment floor per node", 0.001, "us"],
      ["plain leg: create() and base reducer per node", 0.0002, "us"],
      ["plain leg: mirrored body per node", 0.04, "us"],
      ["plain leg: mirror over real body slope", 0.95, "x"],
    ]);
    expect(conclusions).toEqual([
      "In the plain leg, the add-node reducer body costs 0.04us per node, of which the two collision scans are 0.01us (25%) and the sorted-insert comparator 0.028us (70%), together 95% of it; the copy, freeze and assignment floor is 0.001us (2.5%) and the residue the two buckets leave 0.001us (2.5%)",
    ]);
  });

  it("refuses a run whose split leg filed no split", () => {
    const directory = withSidecar([reading("cold miss 100 ops")]);

    expect(() =>
      stampReadings(
        findTarget("cache"),
        directory,
        stampedSuites(["cold miss 100 ops"], ["plain", "draft"]),
      ),
    ).toThrow("Legs that filed no split: draft");
  });

  it("refuses a split for a leg the report never ran", () => {
    const directory = withSidecar(
      [reading("cold miss 100 ops")],
      [split("plain"), split("draft")],
    );

    expect(() =>
      stampReadings(
        findTarget("cache"),
        directory,
        stampedSuites(["cold miss 100 ops"]),
      ),
    ).toThrow("Splits with no leg in the report: draft");
  });

  it("earns a caveat when the slope rests on a thin case", () => {
    // The 2000-op arms run ten iterations by construction, so the far end of
    // the subtraction is the one a reader should distrust first.
    const directory = withSidecar([reading("cold miss 100 ops")]);

    const { caveats } = stampReadings(
      findTarget("cache"),
      directory,
      stampedSuites(["cold miss 100 ops"], ["plain"], 19),
    );

    expect(caveats).toEqual([
      "plain leg: the split is a slope through 100/1000 ops and the thinnest case behind it carries 19 samples, so the large-count end of the subtraction is the one to distrust",
    ]);
  });

  it("keeps a stamped target from being recorded without its readings", () => {
    expect(() => entryFor(findTarget("cache"))).toThrow("would drop it");
  });
});

describe("BENCH_TARGETS", () => {
  it("names every benchmark that exists", () => {
    expect(BENCH_TARGETS.map((target) => target.name)).toEqual([
      "auth",
      "auth-storage",
      "events",
      "queue",
      "queue-only",
      "cache",
      "sync",
    ]);
  });

  it("resolves a target by name or by the file the runner wrote", () => {
    expect(findTarget("auth").name).toBe("auth");
    expect(findTarget("auth-scope.json").name).toBe("auth");
    expect(() => findTarget("nope")).toThrow("Unknown benchmark: nope");
  });

  it("keeps a known harness limit visible as a caveat rather than a note", () => {
    // Structural rather than textual. Pinning the wording made this test fail
    // twice for a good reason - the defect it described got fixed - which is
    // noise standing between a repair and a green suite.
    const withKnownLimits = ["queue", "queue-only", "cache", "sync"];

    for (const name of withKnownLimits) {
      expect(findTarget(name).caveats.length, name).toBeGreaterThan(0);
      for (const caveat of findTarget(name).caveats) {
        expect(caveat.length, name).toBeGreaterThan(40);
      }
    }
  });

  it("claims no limit for a benchmark that has none", () => {
    // A caveat nobody can point at a mechanism for is noise in every record
    // that carries it.
    expect(findTarget("auth").caveats).toEqual([]);
    expect(findTarget("events").caveats).toEqual([]);
  });
});

describe("suiteLabel", () => {
  it("drops the file that qualifies a suite name", () => {
    expect(suiteLabel("bench/a.bench.ts > outer > inner")).toBe(
      "outer > inner",
    );
    expect(suiteLabel("no separator")).toBe("no separator");
  });
});

describe("parseFromVitestOptions", () => {
  it("takes the benchmark as the one positional", () => {
    expect(parseFromVitestOptions(["auth"])).toMatchObject({ target: "auth" });
    expect(() => parseFromVitestOptions([])).toThrow(
      "A benchmark name or a results path is required",
    );
    expect(() => parseFromVitestOptions(["auth", "events"])).toThrow(
      "Only one benchmark at a time",
    );
  });

  it("collects the repeatable flags", () => {
    expect(
      parseFromVitestOptions([
        "auth",
        "--conclusion",
        "one",
        "--conclusion",
        "two",
        "--caveat",
        "a limit",
        "--tag",
        "auth",
        "--task",
        "T-001",
      ]),
    ).toMatchObject({
      conclusions: ["one", "two"],
      caveats: ["a limit"],
      tags: ["auth"],
      tasks: ["T-001"],
    });
  });

  it("refuses a flag it does not know rather than ignoring it", () => {
    expect(() => parseFromVitestOptions(["auth", "--id", "B-001"])).toThrow(
      "Unknown argument: --id",
    );
    expect(() => parseFromVitestOptions(["auth", "--title"])).toThrow(
      "Missing value for --title",
    );
  });

  it("makes recording against a dirty tree an explicit request", () => {
    expect(parseFromVitestOptions(["auth"]).allowDirty).toBe(false);
    expect(parseFromVitestOptions(["auth", "--allow-dirty"]).allowDirty).toBe(
      true,
    );
  });
});
