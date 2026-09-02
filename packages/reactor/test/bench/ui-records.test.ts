import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { BenchmarkEntry } from "../../bench/records/benchmark-schema.js";
import { TaskEntry } from "../../bench/records/task-schema.js";
import {
  annotateCommits,
  caseTags,
  chartRows,
  indexRecords,
  parseJsonl,
  referenceProblems,
  rowMatchesCase,
  sameCommit,
  seriesTable,
  seriesTasks,
  siteSha,
  taskEvents,
  taskLint,
  taskMarkers,
  xLabel,
  type Benchmark,
  type Task,
} from "../../bench/ui/records.js";
import { defectTask, gapTask, microEntry } from "./records-fixtures.js";

const benchDir = join(import.meta.dirname, "../../bench");

function bench(overrides: Record<string, unknown>): Benchmark {
  return BenchmarkEntry.parse(microEntry(overrides as Partial<Benchmark>));
}

function task(
  base: (o?: Partial<Task>) => Record<string, unknown>,
  overrides: Record<string, unknown>,
): Task {
  return TaskEntry.parse(base(overrides as Partial<Task>));
}

const baseEnvironment = bench({}).environment;

const runOne = bench({
  id: "B-001",
  recordedAt: "2026-09-01T12:00:00.000Z",
  environment: { ...baseEnvironment, reactorSha: "aaaaaaa" },
});
const runTwo = bench({
  id: "B-002",
  recordedAt: "2026-09-01T13:00:00.000Z",
  environment: { ...baseEnvironment, reactorSha: "bbbbbbb" },
});
const otherMachine = bench({
  id: "B-003",
  recordedAt: "2026-09-01T14:00:00.000Z",
  environment: {
    ...baseEnvironment,
    host: "ci-runner",
    reactorSha: "ccccccc",
  },
});
const otherSeries = bench({
  id: "B-004",
  title: "event-bus microbenchmarks",
  recordedAt: "2026-09-01T11:00:00.000Z",
});

const defect = task(defectTask, {
  id: "T-001",
  evidence: ["B-001"],
  tags: ["topic:one"],
  status: "VERIFIED",
  history: [
    { status: "UNVERIFIED", at: "2026-09-01T12:30:00.000Z" },
    {
      status: "VERIFIED",
      at: "2026-09-01T12:45:00.000Z",
      by: "bench-verifier",
      evidence: ["B-002"],
    },
  ],
});
const harness = task(defectTask, {
  id: "T-002",
  kind: "HARNESS",
  evidence: ["B-001"],
  tags: ["topic:two"],
  details: {
    sites: [{ file: "packages/reactor/bench/x.bench.ts", line: 3 }],
    defect: "timer inside the label",
    invalidates: ["B-001"],
    biasDirection: "overestimate",
    remedy: "name the delay",
  },
});
const gap = task(gapTask, { id: "T-003", tags: [] });

describe("parseJsonl", () => {
  it("keeps good lines and reports bad ones by line number", () => {
    const text = '{"id":"B-001"}\n\nnot json\n{"id":"B-002"}\n';
    const { entries, badLines } = parseJsonl(text);
    expect(entries.map((e) => (e as { id: string }).id)).toEqual([
      "B-001",
      "B-002",
    ]);
    expect(badLines).toHaveLength(1);
    expect(badLines[0].line).toBe(3);
  });

  it("parses the real record files without a bad line", () => {
    for (const name of ["BENCHMARKS.jsonl", "TASKS.jsonl"]) {
      const { badLines } = parseJsonl(
        readFileSync(join(benchDir, name), "utf8"),
      );
      expect(badLines).toEqual([]);
    }
  });
});

describe("indexRecords", () => {
  const index = indexRecords(
    [otherSeries, otherMachine, runTwo, runOne],
    [defect, harness, gap],
  );

  it("groups by title and sorts each series by recordedAt", () => {
    expect([...index.series.keys()].sort()).toEqual([
      "auth-scope microbenchmarks",
      "event-bus microbenchmarks",
    ]);
    expect(
      index.series.get("auth-scope microbenchmarks")?.map((b) => b.id),
    ).toEqual(["B-001", "B-002", "B-003"]);
  });

  it("joins tasks to benchmarks from the task side, including history evidence", () => {
    expect(index.tasksForBenchmark.get("B-001")?.map((t) => t.id)).toEqual([
      "T-001",
      "T-002",
    ]);
    expect(index.tasksForBenchmark.get("B-002")?.map((t) => t.id)).toEqual([
      "T-001",
    ]);
    expect(index.tasksForBenchmark.has("B-004")).toBe(false);
  });

  it("records HARNESS invalidation", () => {
    expect(index.invalidatedBy.get("B-001")?.map((t) => t.id)).toEqual([
      "T-002",
    ]);
    expect(index.invalidatedBy.has("B-002")).toBe(false);
  });

  it("marks an environment break where the fingerprint changes", () => {
    expect([...index.envBreaks]).toEqual(["B-003"]);
  });

  it("resolves a task's site sha from its first cited record", () => {
    expect(siteSha(defect, index)).toBe("aaaaaaa");
    expect(siteSha(gap, index)).toBeUndefined();
  });
});

describe("seriesTable and chartRows", () => {
  it("keys columns by suite and case, one row per record", () => {
    const table = seriesTable([runOne, runTwo]);
    expect(table.keys).toEqual([
      "bench/auth-scope.bench.ts > auth policy evaluation (pure CPU) > evaluateGrantStack: 2 grants",
      "bench/auth-scope.bench.ts > auth policy evaluation (pure CPU) > evaluateGrantStack: 64 grants",
    ]);
    expect(table.rows.map((r) => r.bench.id)).toEqual(["B-001", "B-002"]);
    expect(table.rows[0].values.get(table.keys[1])?.rank).toBe(2);
  });

  it("flattens the chosen metric with an rme interval", () => {
    const rows = chartRows([runOne], "meanMs");
    expect(rows).toHaveLength(2);
    const [first] = rows;
    expect(first.x).toBe(xLabel(runOne));
    expect(first.suite).toBe("auth policy evaluation (pure CPU)");
    expect(first.value).toBeCloseTo(4.09068397462774e-5, 12);
    expect(first.hi).toBeGreaterThan(first.value);
    expect(first.lo).toBeLessThan(first.value);
    expect(first.lo).toBeGreaterThanOrEqual(0);
  });

  it("drops cases missing the metric, and non-positive values on a log axis", () => {
    expect(chartRows([runOne], "p99Ms")).toHaveLength(1);
    const zeroed = bench({
      results: {
        ...(microEntry().results as object),
        suites: [
          {
            fullName: "bench/x.bench.ts > s",
            cases: [
              {
                name: "floor",
                rank: 1,
                hz: 1,
                meanMs: 0,
                medianMs: 0,
                minMs: 0,
                maxMs: 0,
                rmePct: 0,
                sampleCount: 1,
                totalTimeMs: 1,
              },
            ],
          },
        ],
        derived: [],
      },
    });
    expect(chartRows([zeroed], "meanMs")).toHaveLength(1);
    expect(chartRows([zeroed], "meanMs", { log: true })).toHaveLength(0);
  });
});

describe("taskLint", () => {
  it("passes a well-formed task", () => {
    expect(taskLint(harness)).toEqual([]);
  });

  it("flags a non-HARNESS task without evidence and a missing topic tag", () => {
    expect(taskLint(gap)).toEqual(["no evidence", "0 topic: tags"]);
  });

  it("flags FIXED or COMMITTED claimed by a bench agent", () => {
    const fixed = task(defectTask, {
      id: "T-009",
      evidence: ["B-001"],
      tags: ["topic:x"],
      status: "FIXED",
      history: [
        { status: "UNVERIFIED", at: "2026-09-01T12:00:00.000Z" },
        {
          status: "FIXED",
          at: "2026-09-01T12:01:00.000Z",
          by: "bench-analyst",
        },
      ],
    });
    expect(taskLint(fixed)).toEqual(["FIXED by bench-analyst"]);
  });
});

describe("taskEvents and referenceProblems", () => {
  it("flattens history in time order with the task's kind attached", () => {
    const events = taskEvents([defect, gap]);
    expect(events.map((e) => `${e.taskId}:${e.status}`)).toEqual([
      "T-003:UNVERIFIED",
      "T-001:UNVERIFIED",
      "T-001:VERIFIED",
    ]);
    expect(events[2].by).toBe("bench-verifier");
    expect(events[2].kind).toBe("DEFECT");
  });

  it("reports an id that appears twice", () => {
    const twin = bench({ id: "B-001", recordedAt: "2026-09-01T15:00:00.000Z" });
    const index = indexRecords([runOne, twin], []);
    expect(referenceProblems(index, [runOne, twin], [])).toEqual([
      "B-001 appears more than once; the last one wins",
    ]);
  });

  it("reports references to ids that are not in the files", () => {
    const dangling = task(defectTask, {
      id: "T-010",
      evidence: ["B-999"],
      tags: ["topic:x"],
    });
    const index = indexRecords([runOne], [dangling]);
    expect(referenceProblems(index, [runOne], [dangling])).toEqual([
      "T-010.evidence references unknown B-999",
    ]);
    expect(
      referenceProblems(indexRecords([runOne], [harness]), [runOne], [harness]),
    ).toEqual([]);
  });
});

describe("tasks against a series", () => {
  const fixed = task(defectTask, {
    id: "T-020",
    evidence: ["B-001"],
    tags: ["topic:x", "case:evaluateGrantStack: 64 grants"],
    status: "FIXED",
    history: [
      { status: "UNVERIFIED", at: "2026-09-01T12:10:00.000Z" },
      {
        status: "FIXED",
        at: "2026-09-01T12:30:00.000Z",
        by: "benjamin",
        commit: "abc1234abc12",
      },
    ],
  });
  const records = [runOne, runTwo, otherMachine];
  const index = indexRecords(records, [fixed, defect]);

  it("reads case tags and matches rows by name or suite > name", () => {
    expect(caseTags(fixed)).toEqual(["evaluateGrantStack: 64 grants"]);
    expect(caseTags(defect)).toEqual([]);
    const row = {
      suite: "auth policy",
      caseName: "evaluateGrantStack: 64 grants",
    };
    expect(rowMatchesCase(row, "evaluateGrantStack: 64 grants")).toBe(true);
    expect(
      rowMatchesCase(row, "auth policy > evaluateGrantStack: 64 grants"),
    ).toBe(true);
    expect(rowMatchesCase(row, "other")).toBe(false);
  });

  it("matches short and full shas either way round", () => {
    expect(sameCommit("abc1234", "abc1234abc12")).toBe(true);
    expect(sameCommit("abc1234abc12", "abc1234")).toBe(true);
    expect(sameCommit("abc1234", "abd1234")).toBe(false);
    expect(sameCommit(undefined, "abc")).toBe(false);
  });

  it("annotates commits with explicit fixes and site-overlap inferences", () => {
    const commits = [
      {
        sha: "abc1234ab",
        fullSha: "abc1234abc12abc1234abc12abc1234abc12abc1",
        subject: "fix",
        files: ["packages/reactor/src/storage/kysely/store.ts"],
      },
      {
        sha: "def5678de",
        subject: "touch",
        files: ["packages/reactor/src/storage/kysely/store.ts"],
      },
      { sha: "111111111", subject: "unrelated", files: ["README.md"] },
    ];
    const annotated = annotateCommits(commits, [fixed, defect]);
    expect(annotated.map((c) => [c.fixes, c.touches])).toEqual([
      [["T-020"], ["T-001"]],
      [[], ["T-020", "T-001"]],
      [[], []],
    ]);
  });

  it("places a fix on the first run whose gap holds the commit", () => {
    const gaps = new Map([
      ["B-002", [{ sha: "0000000", subject: "noise" }]],
      ["B-003", [{ sha: "abc1234ab", subject: "fix" }]],
    ]);
    const [entry] = seriesTasks(records, index, gaps).filter(
      (e) => e.task.id === "T-020",
    );
    expect(entry.foundIn).toEqual(["B-001"]);
    expect(entry.cases).toEqual(["evaluateGrantStack: 64 grants"]);
    expect(entry.fixes).toEqual([
      expect.objectContaining({
        status: "FIXED",
        commit: "abc1234abc12",
        landedBefore: { recordId: "B-003", by: "commit" },
      }),
    ]);
  });

  it("reports no run yet when every gap is known and none holds the commit", () => {
    const gaps = new Map([
      ["B-002", [{ sha: "0000000", subject: "noise" }]],
      ["B-003", []],
    ]);
    const [entry] = seriesTasks(records, index, gaps).filter(
      (e) => e.task.id === "T-020",
    );
    expect(entry.fixes[0].landedBefore).toBeUndefined();
  });

  it("falls back to time order when gaps are unknown", () => {
    const [entry] = seriesTasks(records, index).filter(
      (e) => e.task.id === "T-020",
    );
    expect(entry.fixes[0].landedBefore).toEqual({
      recordId: "B-002",
      by: "time",
    });
  });

  it("emits found and fixed markers at the right runs", () => {
    const gaps = new Map([["B-003", [{ sha: "abc1234ab", subject: "fix" }]]]);
    const markers = taskMarkers(seriesTasks(records, index, gaps), records);
    expect(markers.map((m) => [m.taskId, m.role, m.x.split(" ")[0]])).toEqual([
      ["T-020", "found", "B-001"],
      ["T-020", "fixed", "B-003"],
      ["T-001", "found", "B-001"],
      ["T-001", "found", "B-002"],
    ]);
  });
});
