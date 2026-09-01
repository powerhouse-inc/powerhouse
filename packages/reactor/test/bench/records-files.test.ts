import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import { RecordsError } from "../../bench/records/jsonl-store.js";
import type { CommandResult } from "../../bench/records/records-commands.js";
import { runRecordsCommand } from "../../bench/records/records-commands.js";
import { parseRecordsOptions } from "../../bench/records/records-options.js";
import {
  concurrencyEntry,
  defectTask,
  gapTask,
  microEntry,
} from "./records-fixtures.js";

const NOW = "2026-09-05T09:00:00.000Z";

let directory = "";

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), "records-files-"));
});

function withoutId(entry: Record<string, unknown>): Record<string, unknown> {
  const { id: _id, ...rest } = entry;
  return rest;
}

function run(argv: string[], input: unknown = {}): CommandResult {
  const options = parseRecordsOptions([...argv, "--dir", directory]);
  return runRecordsCommand(options, {
    readInput: () => JSON.stringify(input),
    now: () => NOW,
  });
}

function failure(argv: string[], input: unknown = {}): RecordsError {
  try {
    run(argv, input);
  } catch (error) {
    if (error instanceof RecordsError) {
      return error;
    }
    throw error;
  }
  throw new Error("Expected the command to fail");
}

function tasksFile(): string {
  return readFileSync(join(directory, "TASKS.jsonl"), "utf8");
}

function readTask(index: number): Record<string, unknown> {
  return JSON.parse(tasksFile().split("\n")[index]) as Record<string, unknown>;
}

describe("add-task", () => {
  it("synthesizes the id, createdAt and the opening history event", () => {
    const task = withoutId(gapTask());
    delete task.createdAt;
    delete task.status;
    delete task.history;

    const result = run(["add-task", "-"], task);

    expect(result.exit).toBe(0);
    expect(result.lines[0]).toContain("T-001 appended to");
    expect(readTask(0)).toMatchObject({
      id: "T-001",
      createdAt: NOW,
      status: "UNVERIFIED",
      history: [{ status: "UNVERIFIED", at: NOW, evidence: [] }],
    });
  });

  it("allocates ids in sequence across invocations", () => {
    run(["add-task", "-"], withoutId(gapTask()));
    const second = run(["add-task", "-"], withoutId(defectTask()));

    expect(second.lines[0]).toContain("T-002");
    expect(tasksFile().trimEnd().split("\n")).toHaveLength(2);
  });

  it("honours an explicit id and refuses one already taken", () => {
    run(["add-task", "-", "--id", "T-007"], withoutId(gapTask()));

    expect(readTask(0).id).toBe("T-007");
    expect(
      failure(["add-task", "-", "--id", "T-007"], withoutId(gapTask()))
        .exitCode,
    ).toBe(3);
    expect(run(["add-task", "-"], withoutId(gapTask())).lines[0]).toContain(
      "T-008",
    );
  });

  it("refuses an entry that carries its own id", () => {
    const error = failure(["add-task", "-"], gapTask());

    expect(error.exitCode).toBe(1);
    expect(error.message).toContain("Pass --id to choose one");
  });

  it("rejects input that is not one JSON object", () => {
    expect(failure(["add-task", "-"], [gapTask()]).exitCode).toBe(1);
    expect(failure(["add-task", "-"], [gapTask()]).message).toContain(
      "exactly one JSON object",
    );
  });

  it("validates the completed entry, so only whole entries reach the file", () => {
    const task = withoutId(gapTask());
    delete task.priority;

    const error = failure(["add-task", "-"], task);

    expect(error.exitCode).toBe(1);
    expect(error.message).toContain("priority");
    expect(readdirSync(directory)).toEqual([]);
  });
});

describe("add-benchmark", () => {
  it("appends a concurrency entry and summarises it", () => {
    const result = run(["add-benchmark", "-"], withoutId(concurrencyEntry()));

    expect(result.lines[0]).toContain("B-001 appended to");
    expect(result.lines[0]).toContain(
      "(concurrency, meso tier, 2 cells, 3 reps)",
    );
  });

  it("writes the schema output, so defaults are materialised on disk", () => {
    run(["add-benchmark", "-"], withoutId(concurrencyEntry()));

    const line = readFileSync(
      join(directory, "BENCHMARKS.jsonl"),
      "utf8",
    ).trimEnd();
    const stored = JSON.parse(line) as Record<string, unknown>;

    expect(stored).toMatchObject({ supersedes: [], tags: [] });
  });

  it("summarises a micro entry in the units it was measured in", () => {
    const result = run(["add-benchmark", "-"], withoutId(microEntry()));

    expect(result.lines[0]).toContain(
      "(micro, micro tier, 1 suites, 2 cases, vitest-bench)",
    );
  });

  it("keeps the two kinds in one file and one id sequence", () => {
    run(["add-benchmark", "-"], withoutId(concurrencyEntry()));
    const second = run(["add-benchmark", "-"], withoutId(microEntry()));

    expect(second.data.id).toBe("B-002");
    expect(run(["verify"]).exit).toBe(0);
  });

  it("reports a dry run without writing anything", () => {
    const result = run(
      ["add-benchmark", "-", "--dry-run"],
      withoutId(concurrencyEntry()),
    );

    expect(result.lines[0]).toContain("B-001 would be appended to");
    expect(result.data.dryRun).toBe(true);
    expect(readdirSync(directory)).toEqual([]);
  });
});

describe("set-status", () => {
  beforeEach(() => {
    run(["add-task", "-"], withoutId(gapTask()));
  });

  it("appends a history event and rewrites the line in place", () => {
    const result = run([
      "set-status",
      "T-001",
      "VERIFIED",
      "--note",
      "reproduced",
      "--by",
      "bj",
      "--at",
      "2026-09-06T09:00:00.000Z",
    ]);

    expect(result.lines[0]).toBe(
      "T-001 UNVERIFIED -> VERIFIED (history now 2 events)",
    );
    expect(tasksFile().trimEnd().split("\n")).toHaveLength(1);
    expect(readTask(0)).toMatchObject({
      status: "VERIFIED",
      history: [
        { status: "UNVERIFIED" },
        {
          status: "VERIFIED",
          at: "2026-09-06T09:00:00.000Z",
          note: "reproduced",
          by: "bj",
        },
      ],
    });
  });

  it("keeps the file greppable by status", () => {
    run(["set-status", "T-001", "VERIFIED"]);

    expect(tasksFile()).toContain('"status":"VERIFIED"');
  });

  it("records the run that justified the change", () => {
    run(["add-benchmark", "-"], withoutId(concurrencyEntry()));

    run(["set-status", "T-001", "FIXED", "--evidence", "B-001"]);

    expect(readTask(0)).toMatchObject({
      history: [{}, { status: "FIXED", evidence: ["B-001"] }],
    });
    expect(run(["verify"]).exit).toBe(0);
  });

  it("allows a status to reopen", () => {
    run(["set-status", "T-001", "FIXED"]);
    const result = run(["set-status", "T-001", "UNVERIFIED"]);

    expect(result.lines[0]).toContain("FIXED -> UNVERIFIED");
  });

  it("refuses an event dated before the one it follows", () => {
    const error = failure([
      "set-status",
      "T-001",
      "VERIFIED",
      "--at",
      "2020-01-01T00:00:00.000Z",
    ]);

    expect(error.exitCode).toBe(1);
    expect(error.message).toContain("History is out of order");
    expect(readTask(0)).toMatchObject({ status: "UNVERIFIED" });
  });

  it("refutes a finding without erasing that someone looked", () => {
    run(["add-benchmark", "-"], withoutId(concurrencyEntry()));

    const result = run([
      "set-status",
      "T-001",
      "REFUTED",
      "--note",
      "the repro shows the expected number, not the observed one",
      "--by",
      "bench-verifier",
      "--evidence",
      "B-001",
    ]);

    expect(result.lines[0]).toContain("UNVERIFIED -> REFUTED");
    expect(readTask(0)).toMatchObject({
      status: "REFUTED",
      history: [{}, { status: "REFUTED", by: "bench-verifier" }],
    });
    expect(run(["verify"]).exit).toBe(0);
  });

  it("reports an unknown task", () => {
    const error = failure(["set-status", "T-404", "FIXED"]);

    expect(error.exitCode).toBe(4);
    expect(error.message).toBe("No such task: T-404");
  });
});

describe("verify", () => {
  it("passes on two files that do not exist yet", () => {
    const result = run(["verify"]);

    expect(result.exit).toBe(0);
    expect(result.lines.at(-1)).toContain("every reference resolves");
  });

  it("lists every bad line with its 1-indexed number in one pass", () => {
    writeFileSync(
      join(directory, "TASKS.jsonl"),
      ['{"id":"T-001"}', "not json", ""].join("\n"),
    );

    const result = run(["verify"]);

    expect(result.exit).toBe(2);
    expect(result.lines[0]).toContain("TASKS.jsonl:1");
    expect(result.lines[1]).toContain("TASKS.jsonl:2");
    expect(result.lines.at(-1)).toContain("2 bad line(s)");
  });

  it("catches a reference that does not resolve", () => {
    run(["add-task", "-"], withoutId(gapTask()));
    run(["set-status", "T-001", "FIXED", "--evidence", "B-404"]);

    const result = run(["verify"]);

    expect(result.exit).toBe(2);
    expect(result.lines[0]).toBe("T-001 cites B-404, which does not exist");
  });

  it("catches a benchmark naming a task that does not exist", () => {
    run(
      ["add-benchmark", "-"],
      withoutId(concurrencyEntry({ tasks: ["T-001"] })),
    );

    const result = run(["verify"]);

    expect(result.exit).toBe(2);
    expect(result.lines[0]).toBe(
      "B-001 names task T-001, which does not exist",
    );
  });

  it("catches a duplicate id", () => {
    run(["add-task", "-"], withoutId(gapTask()));
    const line = tasksFile();
    writeFileSync(join(directory, "TASKS.jsonl"), line + line);

    const result = run(["verify"]);

    expect(result.exit).toBe(2);
    expect(result.lines[0]).toBe("TASKS.jsonl has more than one T-001");
  });

  it("checks one file when asked", () => {
    writeFileSync(join(directory, "TASKS.jsonl"), "not json\n");

    expect(run(["verify", "--file", "benchmarks"]).exit).toBe(0);
    expect(run(["verify", "--file", "tasks"]).exit).toBe(2);
  });
});

describe("show", () => {
  it("prints the stored entry", () => {
    run(["add-task", "-"], withoutId(gapTask()));

    const result = run(["show", "T-001"]);

    expect(result.exit).toBe(0);
    expect(JSON.parse(result.lines[0])).toMatchObject({ id: "T-001" });
  });

  it("reports an id that is not there, and one that is not an id", () => {
    expect(failure(["show", "B-001"]).exitCode).toBe(4);
    expect(failure(["show", "nope"]).exitCode).toBe(64);
  });
});

describe("a file that does not parse", () => {
  it("fails every mutating command closed, writing nothing", () => {
    run(["add-task", "-"], withoutId(gapTask()));
    const good = tasksFile();
    writeFileSync(join(directory, "TASKS.jsonl"), `${good}{"id":"T-002"}\n`);

    const error = failure(["set-status", "T-001", "FIXED"]);

    expect(error.exitCode).toBe(2);
    expect(error.message).toContain("TASKS.jsonl:2");
    expect(error.message).toContain("nothing was written");
    expect(tasksFile()).toBe(`${good}{"id":"T-002"}\n`);
    expect(failure(["add-task", "-"], withoutId(gapTask())).exitCode).toBe(2);
  });

  it("leaves the lock free for the next command", () => {
    writeFileSync(join(directory, "TASKS.jsonl"), "not json\n");

    failure(["set-status", "T-001", "FIXED"]);

    expect(readdirSync(directory)).toEqual(["TASKS.jsonl"]);
  });
});
