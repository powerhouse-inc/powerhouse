import { describe, expect, it } from "vitest";
import { FIX_EXIT, parseFixOptions } from "../../bench/fix/fix-options.js";

describe("parseFixOptions", () => {
  it("gates on VERIFIED in the bench directory unless told otherwise", () => {
    expect(parseFixOptions(["gate", "T-007"])).toEqual({
      subcommand: "gate",
      taskId: "T-007",
      dir: "bench",
      expect: "VERIFIED",
      json: false,
    });
    expect(
      parseFixOptions(["gate", "T-007", "--expect", "FIXED", "--json"]),
    ).toMatchObject({ expect: "FIXED", json: true });
  });

  it("refuses a status it does not know and an id that is not a task", () => {
    expect(() =>
      parseFixOptions(["gate", "T-007", "--expect", "DONE"]),
    ).toThrow("--expect must be one of");
    expect(() => parseFixOptions(["gate", "B-007"])).toThrow(
      "Ids look like T-007",
    );
    expect(() => parseFixOptions(["gate"])).toThrow("gate needs a task id");
  });

  it("reads sites with its two sizes", () => {
    expect(parseFixOptions(["sites", "T-007"])).toEqual({
      subcommand: "sites",
      taskId: "T-007",
      dir: "bench",
      context: 30,
      callers: 25,
    });
    expect(
      parseFixOptions(["sites", "T-007", "--context", "5", "--callers", "3"]),
    ).toMatchObject({ context: 5, callers: 3 });
    expect(() => parseFixOptions(["sites", "T-007", "--context", "0"])).toThrow(
      "--context must be a positive integer",
    );
  });

  it("needs a results path for cases", () => {
    expect(parseFixOptions(["cases", "bench/results/x.json"])).toEqual({
      subcommand: "cases",
      path: "bench/results/x.json",
    });
    expect(() => parseFixOptions(["cases"])).toThrow("cases needs the path");
  });

  it("requires the criterion's three inputs and keeps the miss line above the threshold", () => {
    const options = parseFixOptions([
      "criterion",
      "--before",
      "before.json",
      "--case",
      "Cold miss rebuild (1000 operations)",
      "--max-ratio",
      "0.65",
    ]);
    expect(options).toEqual({
      subcommand: "criterion",
      before: "before.json",
      caseName: "Cold miss rebuild (1000 operations)",
      maxRatio: 0.65,
      failRatio: undefined,
      control: "",
      controlTolerance: 0.1,
      out: "bench/results/criterion.json",
    });
    expect(() =>
      parseFixOptions(["criterion", "--before", "b.json", "--case", "x"]),
    ).toThrow("--max-ratio is required");
    expect(() =>
      parseFixOptions([
        "criterion",
        "--before",
        "b.json",
        "--case",
        "x",
        "--max-ratio",
        "0.9",
        "--fail-ratio",
        "0.65",
      ]),
    ).toThrow("--fail-ratio must be above --max-ratio");
  });

  it("collects repeated --changed for ci and rejects flags on the wrong verb", () => {
    expect(
      parseFixOptions([
        "ci",
        "--changed",
        "a.ts",
        "--changed",
        "b.ts",
        "--integration",
      ]),
    ).toEqual({
      subcommand: "ci",
      integration: true,
      changed: ["a.ts", "b.ts"],
      out: "",
      json: false,
    });
    expect(() => parseFixOptions(["gate", "T-007", "--integration"])).toThrow(
      "--integration does not apply to gate",
    );
    expect(() => parseFixOptions(["cases", "x.json", "--marker", "m"])).toThrow(
      "--marker does not apply to cases",
    );
  });

  it("names the unknown thing", () => {
    expect(() => parseFixOptions([])).toThrow("A subcommand is required");
    expect(() => parseFixOptions(["fix"])).toThrow("Unknown subcommand: fix");
    expect(() => parseFixOptions(["dist-check", "--wat"])).toThrow(
      "Unknown argument: --wat",
    );
    expect(() => parseFixOptions(["gate", "T-007", "--dir"])).toThrow(
      "--dir needs a value",
    );
  });

  it("keeps the shared exit codes where bench:records put them", () => {
    expect(FIX_EXIT.corruptFile).toBe(2);
    expect(FIX_EXIT.notFound).toBe(4);
    expect(FIX_EXIT.usage).toBe(64);
    expect(FIX_EXIT.error).toBe(68);
    expect(new Set(Object.values(FIX_EXIT)).size).toBe(
      Object.keys(FIX_EXIT).length,
    );
  });
});
