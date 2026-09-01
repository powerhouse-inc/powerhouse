import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BenchmarkEntry } from "../../bench/records/benchmark-schema.js";
import type { MachineEnvironment } from "../../bench/records/benchmark-schema.js";
import { parseFromVitestOptions } from "../../bench/records/from-vitest-options.js";
import {
  BENCH_TARGETS,
  buildMicroEntry,
  findTarget,
  sourceFilesFromVitest,
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
    conclusions: [],
    caveats: [],
    title: "",
    question: "",
    tags: [],
    tasks: [],
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

describe("buildMicroEntry", () => {
  it("produces an entry the store accepts once an id is allocated", () => {
    const entry = entryFor(findTarget("auth"));

    const parsed = BenchmarkEntry.parse({ ...entry, id: "B-001" });

    expect(parsed.kind).toBe("micro");
    expect(parsed.tier).toBe("micro");
  });

  it("never offers an id, which add-benchmark rejects", () => {
    expect(entryFor(findTarget("auth"))).not.toHaveProperty("id");
  });

  it("derives one conclusion and one spread per suite from the numbers", () => {
    const entry = entryFor(findTarget("auth"));
    const results = entry.results as { derived: { name: string }[] };

    expect(entry.conclusions).toEqual([
      "In auth policy evaluation (pure CPU), evaluateGrantStack: 10 grants is 4.57x slower than evaluateGrantStack: 2 grants",
      "In auth policy evaluation (pure CPU) > group principals, 10 grants, group of 1000 members is 55.53x slower than 10 grants, group absent from the map",
    ]);
    expect(results.derived).toHaveLength(2);
    expect(results.derived[0].name).toBe(
      "auth policy evaluation (pure CPU): spread",
    );
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
    const caveats = entryFor(target).caveats as string[];

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
});

describe("BENCH_TARGETS", () => {
  it("names every benchmark that exists", () => {
    expect(BENCH_TARGETS.map((target) => target.name)).toEqual([
      "auth",
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

  it("keeps the measurement defects visible as caveats rather than notes", () => {
    expect(findTarget("queue").caveats[0]).toContain("expect()");
    expect(findTarget("queue-only").caveats[0]).toContain("never drains");
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
