import { describe, expect, it } from "vitest";
import {
  parseRecordsOptions,
  RECORDS_EXIT,
  RECORDS_USAGE,
} from "../../bench/records/records-options.js";

describe("parseRecordsOptions", () => {
  it("requires a known subcommand", () => {
    expect(() => parseRecordsOptions([])).toThrow("A subcommand is required");
    expect(() => parseRecordsOptions(["add-entry"])).toThrow(
      "Unknown subcommand: add-entry",
    );
  });

  it("defaults the directory to bench, resolved against the working directory", () => {
    const options = parseRecordsOptions(["verify"]);

    expect(options.dir).toBe("bench");
    expect(RECORDS_USAGE).toContain("default: bench");
  });

  it("takes a path or a dash as the add- positional", () => {
    expect(parseRecordsOptions(["add-task", "/tmp/entry.json"])).toMatchObject({
      subcommand: "add-task",
      input: "/tmp/entry.json",
      id: "",
      dryRun: false,
      json: false,
    });
    expect(parseRecordsOptions(["add-benchmark", "-"])).toMatchObject({
      subcommand: "add-benchmark",
      input: "-",
    });
  });

  it("rejects the wrong number of positionals", () => {
    expect(() => parseRecordsOptions(["add-task"])).toThrow(
      "Usage: add-task <path|->",
    );
    expect(() => parseRecordsOptions(["add-task", "a", "b"])).toThrow(
      "Usage: add-task <path|->",
    );
    expect(() => parseRecordsOptions(["set-status", "T-001"])).toThrow(
      "Usage: set-status <T-id> <STATUS>",
    );
    expect(() => parseRecordsOptions(["verify", "tasks"])).toThrow(
      "Usage: verify",
    );
  });

  it("reads flags that take a value, and booleans that do not", () => {
    const options = parseRecordsOptions([
      "add-task",
      "-",
      "--dir",
      "/tmp/recs",
      "--id",
      "T-042",
      "--dry-run",
      "--json",
    ]);

    expect(options).toMatchObject({
      dir: "/tmp/recs",
      id: "T-042",
      dryRun: true,
      json: true,
    });
  });

  it("collects repeated evidence", () => {
    const options = parseRecordsOptions([
      "set-status",
      "T-001",
      "FIXED",
      "--evidence",
      "B-001",
      "--evidence",
      "B-002",
      "--note",
      "batched applies landed",
      "--commit",
      "4f2a91c",
      "--by",
      "bj",
      "--at",
      "2026-09-01T12:00:00.000Z",
    ]);

    expect(options).toMatchObject({
      subcommand: "set-status",
      taskId: "T-001",
      status: "FIXED",
      evidence: ["B-001", "B-002"],
      note: "batched applies landed",
      commit: "4f2a91c",
      by: "bj",
      at: "2026-09-01T12:00:00.000Z",
    });
  });

  it("leaves unset set-status metadata empty rather than absent", () => {
    expect(parseRecordsOptions(["set-status", "T-001", "FIXED"])).toMatchObject(
      {
        note: "",
        commit: "",
        at: "",
        by: "",
        evidence: [],
      },
    );
  });

  it("rejects a flag the subcommand does not use", () => {
    expect(() =>
      parseRecordsOptions(["add-task", "-", "--note", "hello"]),
    ).toThrow("--note does not apply to this subcommand");
    expect(() =>
      parseRecordsOptions(["set-status", "T-001", "FIXED", "--id", "T-002"]),
    ).toThrow("--id does not apply to this subcommand");
    expect(() =>
      parseRecordsOptions(["show", "B-001", "--evidence", "B-002"]),
    ).toThrow("--evidence does not apply to this subcommand");
  });

  it("rejects an unknown flag and a flag with no value", () => {
    expect(() => parseRecordsOptions(["verify", "--force"])).toThrow(
      "Unknown argument: --force",
    );
    expect(() => parseRecordsOptions(["add-task", "-", "--dir"])).toThrow(
      "Missing value for --dir",
    );
  });

  it("validates the status and the verify target", () => {
    expect(() => parseRecordsOptions(["set-status", "T-001", "DONE"])).toThrow(
      "Unknown status: DONE",
    );
    expect(() => parseRecordsOptions(["verify", "--file", "both"])).toThrow(
      "Unknown --file: both",
    );
    expect(parseRecordsOptions(["verify", "--file", "tasks"])).toMatchObject({
      target: "tasks",
    });
    expect(parseRecordsOptions(["verify"])).toMatchObject({ target: "all" });
  });

  it("accepts REFUTED, the terminal status for a disproved finding", () => {
    expect(
      parseRecordsOptions(["set-status", "T-001", "REFUTED"]),
    ).toMatchObject({ status: "REFUTED" });
  });

  it("keeps the exit codes mutually exclusive ordinals", () => {
    expect(RECORDS_EXIT).toEqual({
      ok: 0,
      invalidEntry: 1,
      corruptFile: 2,
      duplicateId: 3,
      notFound: 4,
      unmeasuredFix: 5,
      usage: 64,
      error: 68,
    });
  });
});
