import { describe, expect, it } from "vitest";
import { z } from "zod";
import { BenchmarkEntry } from "../../bench/records/benchmark-schema.js";
import { TaskEntry } from "../../bench/records/task-schema.js";
import { concurrencyEntry, defectTask, gapTask } from "./records-fixtures.js";

function issuePaths(error: z.ZodError): string[] {
  return error.issues.map((issue) => issue.path.join("."));
}

describe("BenchmarkEntry", () => {
  it("accepts a full concurrency entry", () => {
    const parsed = BenchmarkEntry.parse(concurrencyEntry());

    expect(parsed.kind).toBe("concurrency");
    expect(parsed.results.cells).toHaveLength(2);
  });

  it("materialises defaults so the stored line is complete", () => {
    const entry = concurrencyEntry();
    const results = entry.results as Record<string, unknown>;
    const protocol = results.protocol as Record<string, unknown>;
    delete protocol.lockInstrument;
    delete results.derived;

    const parsed = BenchmarkEntry.parse(entry);

    expect(parsed.results.protocol.lockInstrument).toBe("none");
    expect(parsed.results.protocol.notes).toEqual([]);
    expect(parsed.results.derived).toEqual([]);
    expect(parsed.supersedes).toEqual([]);
    expect(parsed.tasks).toEqual([]);
    expect(parsed.tags).toEqual([]);
    expect(parsed.results.workload.backdatedActions).toBe(0);
  });

  it("names the path of a mistyped measurement", () => {
    const entry = concurrencyEntry();
    const results = entry.results as {
      cells: { runs: { wallMs: unknown }[] }[];
    };
    results.cells[0].runs[0].wallMs = "8421.5";

    const result = BenchmarkEntry.safeParse(entry);

    expect(result.success).toBe(false);
    expect(issuePaths(result.error!)).toContain(
      "results.cells.0.runs.0.wallMs",
    );
  });

  it("rejects a contention number with no arm to compare against", () => {
    const entry = concurrencyEntry();
    const results = entry.results as { cells: { arm: string }[] };
    results.cells[1].arm = "SHARED_GROUP";

    const result = BenchmarkEntry.safeParse(entry);

    expect(result.success).toBe(false);
    expect(z.prettifyError(result.error!)).toContain(
      "Needs SHARED_GROUP and DISJOINT_GROUPS at the same writer count",
    );
  });

  it("rejects a pairing that spans different writer counts", () => {
    const entry = concurrencyEntry();
    const results = entry.results as { cells: { writers: number }[] };
    results.cells[1].writers = 16;

    expect(BenchmarkEntry.safeParse(entry).success).toBe(false);
  });

  it("requires the retry counters the benchmark exists to measure", () => {
    const entry = concurrencyEntry();
    const results = entry.results as {
      cells: { runs: Record<string, unknown>[] }[];
    };
    delete results.cells[0].runs[0].appendConditionRetries;
    delete results.cells[0].runs[0].retryExhaustions;

    const result = BenchmarkEntry.safeParse(entry);

    expect(result.success).toBe(false);
    expect(issuePaths(result.error!)).toEqual(
      expect.arrayContaining([
        "results.cells.0.runs.0.appendConditionRetries",
        "results.cells.0.runs.0.retryExhaustions",
      ]),
    );
  });

  it("rejects a typo'd key rather than dropping it", () => {
    const entry = concurrencyEntry({ tier: "meso" });
    (entry as Record<string, unknown>).caveat = ["singular"];

    const result = BenchmarkEntry.safeParse(entry);

    expect(result.success).toBe(false);
    expect(z.prettifyError(result.error!)).toContain("caveat");
  });

  it("requires at least one conclusion but tolerates no caveats", () => {
    expect(
      BenchmarkEntry.safeParse(concurrencyEntry({ caveats: [] })).success,
    ).toBe(true);
    expect(
      BenchmarkEntry.safeParse(concurrencyEntry({ conclusions: [] })).success,
    ).toBe(false);
  });

  it("rejects an id that is not B-nnn", () => {
    const result = BenchmarkEntry.safeParse(concurrencyEntry({ id: "1" }));

    expect(result.success).toBe(false);
    expect(z.prettifyError(result.error!)).toContain("Ids look like B-001");
  });
});

describe("TaskEntry", () => {
  it("accepts a gap and a defect", () => {
    expect(TaskEntry.parse(gapTask()).kind).toBe("GAP");
    expect(TaskEntry.parse(defectTask()).kind).toBe("DEFECT");
  });

  it("defaults status to UNVERIFIED and evidence to empty", () => {
    const task = gapTask();
    delete (task as Record<string, unknown>).status;

    const parsed = TaskEntry.parse(task);

    expect(parsed.status).toBe("UNVERIFIED");
    expect(parsed.evidence).toEqual([]);
    expect(parsed.history[0].evidence).toEqual([]);
  });

  it("rejects a task whose status disagrees with its history head", () => {
    const result = TaskEntry.safeParse(gapTask({ status: "FIXED" }));

    expect(result.success).toBe(false);
    expect(z.prettifyError(result.error!)).toContain(
      "Status FIXED disagrees with the last history event (UNVERIFIED)",
    );
  });

  it("rejects history that runs backwards", () => {
    const result = TaskEntry.safeParse(
      gapTask({
        status: "VERIFIED",
        history: [
          {
            status: "UNVERIFIED",
            at: "2026-09-02T12:00:00.000Z",
            evidence: [],
          },
          { status: "VERIFIED", at: "2026-09-01T12:00:00.000Z", evidence: [] },
        ],
      }),
    );

    expect(result.success).toBe(false);
    expect(issuePaths(result.error!)).toContain("history.1.at");
  });

  it("allows a status to reopen", () => {
    const parsed = TaskEntry.parse(
      gapTask({
        status: "UNVERIFIED",
        history: [
          {
            status: "UNVERIFIED",
            at: "2026-09-01T12:00:00.000Z",
            evidence: [],
          },
          { status: "FIXED", at: "2026-09-02T12:00:00.000Z", evidence: [] },
          {
            status: "UNVERIFIED",
            at: "2026-09-03T12:00:00.000Z",
            evidence: [],
          },
        ],
      }),
    );

    expect(parsed.history).toHaveLength(3);
  });

  it("accepts a task whose history head is REFUTED", () => {
    const parsed = TaskEntry.parse(
      gapTask({
        status: "REFUTED",
        history: [
          {
            status: "UNVERIFIED",
            at: "2026-09-01T12:00:00.000Z",
            evidence: [],
          },
          {
            status: "REFUTED",
            at: "2026-09-02T12:00:00.000Z",
            evidence: ["B-001"],
            note: "an existing bench already answers the question",
          },
        ],
      }),
    );

    expect(parsed.status).toBe("REFUTED");
  });

  it("requires at least one history event", () => {
    expect(TaskEntry.safeParse(gapTask({ history: [] })).success).toBe(false);
  });

  it("rejects candidate fixes whose ranks tie or skip", () => {
    const task = defectTask();
    const details = task.details as { fixes: Record<string, unknown>[] };
    details.fixes.push({ ...details.fixes[0], rank: 1 });

    const result = TaskEntry.safeParse(task);

    expect(result.success).toBe(false);
    expect(z.prettifyError(result.error!)).toContain("no gaps or ties");
  });

  it("rejects an absolute path in a code reference", () => {
    const task = defectTask();
    const details = task.details as { sites: { file: string }[] };
    details.sites[0].file = "/Users/someone/store.ts";

    const result = TaskEntry.safeParse(task);

    expect(result.success).toBe(false);
    expect(z.prettifyError(result.error!)).toContain("repo-relative");
  });

  it("holds priority to the 1..5 band", () => {
    expect(TaskEntry.safeParse(gapTask({ priority: 0 })).success).toBe(false);
    expect(TaskEntry.safeParse(gapTask({ priority: 6 })).success).toBe(false);
    expect(TaskEntry.safeParse(gapTask({ priority: 5 })).success).toBe(true);
  });
});
