import { describe, expect, it } from "vitest";
import {
  findCase,
  flattenReport,
  formatComparison,
  judge,
  verdictExit,
} from "../../bench/fix/fix-bench.js";
import type { Criterion, FlatCase } from "../../bench/fix/fix-bench.js";
import type { VitestBenchReport } from "../../bench/records/from-vitest.js";
import { FIX_EXIT } from "../../bench/fix/fix-options.js";

function benchmark(name: string, mean: number, id: string) {
  return {
    id,
    name,
    rank: 1,
    rme: 0.5,
    totalTime: mean * 10,
    min: mean,
    max: mean,
    hz: 1000 / mean,
    mean,
    sampleCount: 10,
    median: mean,
  };
}

const report: VitestBenchReport = {
  files: [
    {
      filepath: "bench/write-cache.bench.ts",
      groups: [
        {
          fullName: "bench/write-cache.bench.ts > Cold Miss",
          benchmarks: [
            benchmark("Cold miss rebuild (100 operations)", 16, "a"),
            benchmark("Cold miss rebuild (1000 operations)", 856, "b"),
          ],
        },
        {
          fullName: "bench/write-cache.bench.ts > Baseline",
          benchmarks: [
            benchmark(
              "No-cache baseline: manual rebuild (1000 operations)",
              858,
              "c",
            ),
          ],
        },
      ],
    },
  ],
};

const cases = flattenReport(report);

function flat(name: string, meanMs: number): FlatCase {
  return {
    suite: "s",
    name,
    meanMs,
    hz: 1000 / meanMs,
    rmePct: 0.5,
    sampleCount: 10,
  };
}

const criterion: Criterion = {
  writtenAt: "2026-09-03T12:00:00.000Z",
  beforePath: "before.json",
  before: flat("cold", 856),
  maxRatio: 0.65,
  failRatio: 0.9,
  control: { before: flat("control", 858), tolerance: 0.1 },
};

const later = new Date("2026-09-03T12:30:00.000Z");

describe("flattenReport", () => {
  it("keeps every case with its suite label and vitest's units", () => {
    expect(cases.map((item) => [item.suite, item.name, item.meanMs])).toEqual([
      ["Cold Miss", "Cold miss rebuild (100 operations)", 16],
      ["Cold Miss", "Cold miss rebuild (1000 operations)", 856],
      ["Baseline", "No-cache baseline: manual rebuild (1000 operations)", 858],
    ]);
  });
});

describe("findCase", () => {
  it("takes an exact name, then a qualified one, then a unique substring", () => {
    expect(findCase(cases, "Cold miss rebuild (1000 operations)").meanMs).toBe(
      856,
    );
    expect(
      findCase(
        cases,
        "Baseline :: No-cache baseline: manual rebuild (1000 operations)",
      ).meanMs,
    ).toBe(858);
    expect(findCase(cases, "no-cache").meanMs).toBe(858);
  });

  it("refuses an ambiguous or unknown name and lists what it saw", () => {
    expect(() => findCase(cases, "1000 operations")).toThrow("is ambiguous");
    expect(() => findCase(cases, "warm")).toThrow("No case matches warm");
  });
});

describe("judge", () => {
  it("meets the criterion at or under the threshold with the control steady", () => {
    const result = judge(
      criterion,
      flat("cold", 463),
      flat("control", 833),
      later,
    );
    expect(result.verdict).toBe("met");
    expect(result.ratio).toBeCloseTo(0.541, 3);
    expect(result.reasons.at(-1)).toContain("held at 0.971x");
  });

  it("is partial between the threshold and the miss line, missed at or past it", () => {
    expect(
      judge(criterion, flat("cold", 700), flat("control", 858), later).verdict,
    ).toBe("partial");
    expect(
      judge(criterion, flat("cold", 800), flat("control", 858), later).verdict,
    ).toBe("missed");
    const strict: Criterion = {
      ...criterion,
      failRatio: undefined,
      control: undefined,
    };
    expect(judge(strict, flat("cold", 700), undefined, later).verdict).toBe(
      "missed",
    );
  });

  it("is inconclusive when the after-run predates the criterion or the control moved", () => {
    const early = new Date("2026-09-03T11:00:00.000Z");
    const predates = judge(
      criterion,
      flat("cold", 463),
      flat("control", 858),
      early,
    );
    expect(predates.verdict).toBe("inconclusive");
    expect(predates.reasons.join(" ")).toContain("predates the criterion");

    const moved = judge(
      criterion,
      flat("cold", 463),
      flat("control", 600),
      later,
    );
    expect(moved.verdict).toBe("inconclusive");
    expect(moved.reasons.join(" ")).toContain("moved 0.699x");

    const missing = judge(criterion, flat("cold", 463), undefined, later);
    expect(missing.verdict).toBe("inconclusive");
  });

  it("maps verdicts to the exit codes the command documents", () => {
    expect(verdictExit("met")).toBe(FIX_EXIT.ok);
    expect(verdictExit("partial")).toBe(FIX_EXIT.partial);
    expect(verdictExit("inconclusive")).toBe(FIX_EXIT.partial);
    expect(verdictExit("missed")).toBe(FIX_EXIT.red);
  });

  it("prints the criterion, both numbers and the verdict", () => {
    const result = judge(
      criterion,
      flat("cold", 463),
      flat("control", 833),
      later,
    );
    const lines = formatComparison(criterion, result, "after.json");
    expect(lines[0]).toContain("criterion written 2026-09-03T12:00:00.000Z");
    expect(lines.some((line) => line.startsWith("ratio: 0.541x"))).toBe(true);
    expect(lines.at(-1)).toBe("verdict: MET");
  });
});
