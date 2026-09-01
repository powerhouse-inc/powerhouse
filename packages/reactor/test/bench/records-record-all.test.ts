import { describe, expect, it } from "vitest";
import { BENCH_TARGETS } from "../../bench/records/from-vitest.js";
import {
  parseRecordAllOptions,
  RECORD_ALL_EXIT,
  summarise,
} from "../../bench/records/record-all.js";
import type { TargetOutcome } from "../../bench/records/record-all.js";

const outcome = (
  target: string,
  status: "recorded" | "failed",
  id = "",
): TargetOutcome => ({
  target,
  status,
  id,
  seconds: 1.5,
  detail: status === "failed" ? "exited 1" : "",
});

describe("parseRecordAllOptions", () => {
  it("runs every benchmark when none is named", () => {
    expect(
      parseRecordAllOptions([]).targets.map((target) => target.name),
    ).toEqual(["auth", "events", "queue", "queue-only", "cache", "sync"]);
  });

  it("takes a subset", () => {
    expect(
      parseRecordAllOptions(["cache", "auth"]).targets.map(
        (target) => target.name,
      ),
    ).toEqual(["auth", "cache"]);
  });

  it("orders by the table, not by argv, so two callers get the same run", () => {
    const forwards = parseRecordAllOptions(["auth", "sync", "queue"]);
    const backwards = parseRecordAllOptions(["queue", "sync", "auth"]);

    expect(forwards.targets.map((t) => t.name)).toEqual(
      backwards.targets.map((t) => t.name),
    );
  });

  it("refuses a name it does not know rather than silently running less", () => {
    expect(() => parseRecordAllOptions(["auth", "nope"])).toThrow(
      "Unknown benchmark: nope",
    );
    expect(() => parseRecordAllOptions(["auth", "auth"])).toThrow(
      "auth was named twice",
    );
    expect(() => parseRecordAllOptions(["--wat"])).toThrow(
      "Unknown argument: --wat",
    );
  });

  it("makes recording against a dirty tree an explicit request", () => {
    expect(parseRecordAllOptions([]).allowDirty).toBe(false);
    expect(parseRecordAllOptions(["--allow-dirty"]).allowDirty).toBe(true);
  });

  it("can print the plan without running it", () => {
    expect(parseRecordAllOptions(["--list"]).listOnly).toBe(true);
  });
});

describe("BENCH_TARGETS", () => {
  it("names the script that records each one, so nothing is wired by hand", () => {
    for (const target of BENCH_TARGETS) {
      expect(target.recordScript, target.name).toMatch(/^bench:[\w:-]+$/);
    }
  });

  it("keeps the script and the command a record reports in agreement", () => {
    for (const target of BENCH_TARGETS) {
      expect(target.command, target.name).toContain(target.recordScript);
    }
  });
});

describe("summarise", () => {
  it("exits clean when every benchmark recorded", () => {
    const result = summarise([
      outcome("auth", "recorded", "B-001"),
      outcome("events", "recorded", "B-002"),
    ]);

    expect(result.exit).toBe(RECORD_ALL_EXIT.ok);
    expect(result.lines.join("\n")).toContain("| auth | recorded | B-001 |");
  });

  it("makes a partial run loud rather than letting it pass as green", () => {
    const result = summarise([
      outcome("auth", "recorded", "B-001"),
      outcome("cache", "failed"),
    ]);

    expect(result.exit).toBe(RECORD_ALL_EXIT.someFailed);
    const text = result.lines.join("\n");
    expect(text).toContain("cache failed: exited 1");
    expect(text).toContain("1 of 2 recorded");
    expect(text).toContain("nothing was retried");
  });

  it("shows a dash where no record was allocated", () => {
    expect(summarise([outcome("cache", "failed")]).lines.join("\n")).toContain(
      "| cache | failed | - |",
    );
  });
});
