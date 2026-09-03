import { describe, expect, it } from "vitest";
import { BenchmarkEntry } from "../../bench/records/benchmark-schema.js";
import {
  formatBenchmark,
  formatGate,
  formatTask,
  gateExit,
  nextTask,
} from "../../bench/fix/fix-gate.js";
import type { GateReport } from "../../bench/fix/fix-gate.js";
import { FIX_EXIT } from "../../bench/fix/fix-options.js";
import { TaskEntry } from "../../bench/records/task-schema.js";
import { defectTask, microEntry } from "./records-fixtures.js";

const verified = TaskEntry.parse(
  defectTask({
    status: "VERIFIED",
    evidence: ["B-001"],
    history: [
      { status: "UNVERIFIED", at: "2026-09-01T12:00:00.000Z", evidence: [] },
      {
        status: "VERIFIED",
        at: "2026-09-01T13:00:00.000Z",
        by: "bench-verifier",
        note: "Ran the repro; fix rank 1 as written is inert.",
        evidence: ["B-001"],
      },
    ],
  }),
);

const ready: GateReport = {
  taskId: "T-002",
  selected: false,
  candidates: [],
  expect: "VERIFIED",
  verifyExit: 0,
  verifyLines: ["BENCHMARKS.jsonl 1 entries, TASKS.jsonl 1 entries"],
  dirty: [],
  task: verified,
  taskProblem: "",
  benchmarks: [BenchmarkEntry.parse(microEntry())],
  postgres: "reachable",
};

describe("gateExit", () => {
  it("passes a clean tree with a verified task", () => {
    expect(gateExit(ready)).toEqual({ exit: FIX_EXIT.ok, refusal: "" });
  });

  it("refuses in the order the command documents: records, task, tree, status", () => {
    expect(gateExit({ ...ready, verifyExit: 2, dirty: ["M x"] }).exit).toBe(
      FIX_EXIT.corruptFile,
    );
    expect(
      gateExit({
        ...ready,
        task: undefined,
        taskProblem: "No such entry: T-002",
        dirty: ["M x"],
      }),
    ).toEqual({ exit: FIX_EXIT.notFound, refusal: "No such entry: T-002" });
    expect(gateExit({ ...ready, dirty: ["M x"] }).exit).toBe(
      FIX_EXIT.dirtyTree,
    );
    expect(
      gateExit({ ...ready, task: { ...verified, status: "FIXED" } }),
    ).toEqual({
      exit: FIX_EXIT.wrongStatus,
      refusal: "T-002 is FIXED, not VERIFIED",
    });
  });
});

describe("nextTask", () => {
  const at = (
    id: string,
    status: string,
    priority: number,
    createdAt: string,
  ) =>
    TaskEntry.parse(
      defectTask({
        id,
        priority,
        createdAt,
        status: status as "VERIFIED",
        history: [
          { status: status as "VERIFIED", at: createdAt, evidence: [] },
        ],
      }),
    );
  const tasks = [
    at("T-001", "VERIFIED", 3, "2026-09-01T18:00:00.000Z"),
    at("T-003", "FIXED", 1, "2026-09-01T18:10:00.000Z"),
    at("T-006", "VERIFIED", 3, "2026-09-02T17:00:00.000Z"),
    at("T-008", "VERIFIED", 2, "2026-09-02T17:46:00.000Z"),
    at("T-009", "UNVERIFIED", 1, "2026-09-02T18:00:00.000Z"),
  ];

  it("takes the lowest priority number, then the oldest, in the expected status only", () => {
    expect(nextTask(tasks, "VERIFIED")?.id).toBe("T-008");
    expect(
      nextTask(
        tasks.filter((t) => t.id !== "T-008"),
        "VERIFIED",
      )?.id,
    ).toBe("T-001");
    expect(nextTask(tasks, "UNVERIFIED")?.id).toBe("T-009");
    expect(nextTask(tasks, "REFUTED")).toBeUndefined();
  });

  it("names the choice and the queue behind it, or the empty queue", () => {
    const chosen = nextTask(tasks, "VERIFIED");
    const lines = formatGate({
      ...ready,
      selected: true,
      candidates: tasks.filter((t) => t.status === "VERIFIED"),
      task: chosen,
      taskId: chosen?.id ?? "",
    });
    expect(lines).toContain(
      "next: T-008 chosen from 3 VERIFIED (then T-001 P3, T-006 P3)",
    );
    const empty = { ...ready, selected: true, task: undefined, taskId: "" };
    expect(gateExit(empty)).toEqual({
      exit: FIX_EXIT.notFound,
      refusal: "no task is VERIFIED; /bench-loop is what makes them",
    });
    expect(formatGate(empty)).toContain("next: none of 0 tasks is VERIFIED");
  });
});

describe("formatTask", () => {
  it("carries the sites, the repro, the ranked fixes and the last note", () => {
    const lines = formatTask(verified);
    expect(lines[0]).toBe("task T-002 DEFECT P2 area=storage status=VERIFIED");
    expect(lines).toContain(
      "    packages/reactor/src/storage/kysely/store.ts:291",
    );
    expect(lines).toContain(
      "  repro: Run the concurrency bench at 8 writers with pg_stat_statements on",
    );
    expect(
      lines.some((line) => line.startsWith("    1. [small] Prepare")),
    ).toBe(true);
    expect(lines).toContain("  last note (VERIFIED, bench-verifier):");
    expect(lines.at(-1)).toBe(
      "    Ran the repro; fix rank 1 as written is inert.",
    );
  });
});

describe("formatBenchmark", () => {
  it("lists every micro case with the fields a criterion needs", () => {
    const lines = formatBenchmark(BenchmarkEntry.parse(microEntry()));
    expect(lines[0]).toContain(
      "evidence B-001 (micro, recorded 2026-09-01T12:00:00.000Z at c9d01b3)",
    );
    expect(lines[1]).toBe("  auth policy evaluation (pure CPU)");
    expect(lines[2]).toMatch(
      /^ {4}evaluateGrantStack: 2 grants \| mean 0\.0000 ms \| hz 24445789\.66 \| rme 5\.59% \| n 12222895$/,
    );
  });
});

describe("formatGate", () => {
  it("ends with the verdict and names the refusal", () => {
    expect(formatGate(ready).at(-1)).toBe("gate: READY (T-002 is VERIFIED)");
    expect(formatGate({ ...ready, dirty: [" M a.ts", "?? b.ts"] }).at(-1)).toBe(
      "gate: REFUSED (exit 5): the working tree is dirty (2 paths); the fix diff has to stand alone",
    );
  });
});
