import { describe, expect, it } from "vitest";
import type {
  Cell,
  CheckName,
  CheckResult,
  Expectation,
  MatrixIssue,
  Rep,
} from "./schema.js";
import {
  cellVerdict,
  classifyIssues,
  plannedChecks,
  repOutcome,
  summarize,
  unavailableResult,
} from "./verdict.js";

const pass = (name: CheckName): CheckResult => ({ name, status: "pass" });
const fail = (name: CheckName, detail?: string): CheckResult => ({
  name,
  status: "fail",
  ...(detail ? { detail } : {}),
});
const unavailable = (name: CheckName): CheckResult => ({
  name,
  status: "unavailable",
  reason: "credential-verification-enforced",
});

function rep(index: number, fields: Partial<Rep> = {}): Rep {
  return {
    rep: index,
    status: "done",
    checks: [pass("info.storage")],
    issues: [],
    timings: {},
    ...fields,
  };
}

function issue(
  stage: MatrixIssue["stage"],
  message = `${stage} issue`,
): MatrixIssue {
  return { stage, path: "", message };
}

describe("plannedChecks", () => {
  it("plans every chosen check when credentials are skipped", () => {
    const checks = plannedChecks({
      checks: ["queue.drained", "info.storage"],
      credentialVerification: "skipped",
    });
    expect(checks).toEqual([
      { name: "info.storage", operator: false },
      { name: "queue.drained", operator: true },
    ]);
    expect(checks.map(unavailableResult)).toEqual([undefined, undefined]);
  });

  it("marks the five operator checks unavailable when credentials are enforced", () => {
    const checks = plannedChecks({
      checks: [
        "info.storage",
        "drives.integrity",
        "storage.health",
        "processors",
        "catchUp",
        "sync.deadLetters",
        "queue.drained",
      ],
      credentialVerification: "enforced",
    });
    expect(
      checks.filter((check) => check.unavailable).map((check) => check.name),
    ).toEqual([
      "storage.health",
      "processors",
      "catchUp",
      "sync.deadLetters",
      "queue.drained",
    ]);
    expect(unavailableResult(checks[2])).toEqual(unavailable("storage.health"));
    expect(unavailableResult(checks[0])).toBeUndefined();
  });
});

describe("classifyIssues", () => {
  it.each<[MatrixIssue["stage"][], ReturnType<typeof classifyIssues>]>([
    [[], undefined],
    [["policy"], "invalid-static"],
    [["conflict"], "invalid-static"],
    [["setter"], "invalid-static"],
    [["shape"], "invalid-static"],
    [["capability"], "invalid-static"],
    [["load"], "invalid-static"],
    [["declared"], "invalid-static"],
    [["resolve"], "invalid-static"],
    [["resolved"], "invalid-static"],
    [["boot"], "invalid-boot"],
    [["resolved", "boot"], "invalid-boot"],
    [["shape", "boot"], "invalid-static"],
  ])("%j → %s", (stages, expected) => {
    expect(classifyIssues(stages.map((stage) => issue(stage)))).toBe(expected);
  });
});

describe("repOutcome", () => {
  const error = { message: "unreachable", phase: "probe" };

  it.each<[string, Partial<Rep>, Expectation, ReturnType<typeof repOutcome>]>([
    ["all checks passed", {}, "accept", "pass"],
    ["no checks", { checks: [] }, "accept", "pass"],
    [
      "a failed check",
      { checks: [pass("info.storage"), fail("processors")] },
      "accept",
      "fail",
    ],
    [
      "an unavailable check",
      { checks: [pass("info.storage"), unavailable("processors")] },
      "accept",
      "inconclusive",
    ],
    [
      "a failed and an unavailable check",
      { checks: [fail("info.storage"), unavailable("processors")] },
      "accept",
      "fail",
    ],
    ["a failed spawn", { spawnFailed: true, checks: [] }, "accept", "fail"],
    ["a harness error", { error }, "accept", "error"],
    [
      "a harness error beside a failure",
      { error, checks: [fail("catchUp")] },
      "accept",
      "error",
    ],
    ["a refused spawn", { spawnFailed: true, checks: [] }, "refusal", "pass"],
    ["an accepted spawn", {}, "refusal", "fail"],
    [
      "a harness error expecting refusal",
      { error, spawnFailed: true },
      "refusal",
      "error",
    ],
  ])("%s (%s) → %s", (_name, fields, expect_, outcome) => {
    expect(repOutcome(rep(1, fields), expect_)).toBe(outcome);
  });
});

describe("cellVerdict", () => {
  const cell = (
    reps: Rep[],
    fields: Partial<Pick<Cell, "expect" | "issues">> & { skip?: string } = {},
  ) => cellVerdict({ expect: "accept", issues: [], reps, ...fields });

  it("reports a skip first", () => {
    expect(
      cell([], { skip: "rule 1: excludes a=x", issues: [issue("policy")] }),
    ).toEqual({
      outcome: "skipped-constraint",
      reason: "rule 1: excludes a=x",
      flaky: false,
    });
  });

  it.each<[MatrixIssue["stage"], string]>([
    ["policy", "invalid-static"],
    ["resolved", "invalid-static"],
    ["boot", "invalid-boot"],
  ])("turns a %s issue into %s", (stage, outcome) => {
    expect(cell([], { issues: [issue(stage, "why")] })).toEqual({
      outcome,
      reason: "why",
      flaky: false,
    });
  });

  it.each<MatrixIssue["stage"]>(["declared", "resolved", "boot"])(
    "passes a negative test refused at %s",
    (stage) => {
      expect(
        cell([], { expect: "refusal", issues: [issue(stage, "no")] }),
      ).toEqual({
        outcome: "pass",
        reason: `refused at ${stage}, as expected: no`,
        flaky: false,
      });
    },
  );

  it("keeps an authoring error invalid in a negative test", () => {
    expect(
      cell([], {
        expect: "refusal",
        issues: [issue("setter", "bad path"), issue("boot")],
      }),
    ).toEqual({ outcome: "invalid-static", reason: "bad path", flaky: false });
  });

  it.each<[string, Rep[], string, string | undefined, boolean]>([
    ["every rep passed", [rep(1), rep(2)], "pass", undefined, false],
    [
      "one rep failed",
      [rep(1), rep(2, { checks: [fail("processors", "1 errored")] })],
      "fail",
      "rep 2: processors failed: 1 errored",
      true,
    ],
    [
      "a failed spawn",
      [rep(1, { spawnFailed: true, checks: [] })],
      "fail",
      "rep 1: did not start after a clean check",
      false,
    ],
    [
      "a harness error and a pass",
      [rep(1), rep(2, { error: { message: "over budget", phase: "disk" } })],
      "error",
      "rep 2: over budget",
      false,
    ],
    [
      "a failure outranks an error",
      [
        rep(1, { error: { message: "timeout", phase: "ready" } }),
        rep(2, { checks: [fail("catchUp")] }),
      ],
      "fail",
      "rep 2: catchUp failed",
      false,
    ],
    [
      "unavailable checks and no failure",
      [
        rep(1, {
          checks: [
            pass("info.storage"),
            unavailable("processors"),
            unavailable("catchUp"),
          ],
        }),
      ],
      "inconclusive",
      "inconclusive — credential verification enforced: processors, catchUp unavailable",
      false,
    ],
    [
      "an error outranks inconclusive",
      [
        rep(1, { checks: [unavailable("processors")] }),
        rep(2, { error: { message: "gone", phase: "probe" } }),
      ],
      "error",
      "rep 2: gone",
      false,
    ],
    [
      "a failure beside unavailable checks",
      [rep(1, { checks: [fail("info.storage"), unavailable("processors")] })],
      "fail",
      "rep 1: info.storage failed",
      false,
    ],
    [
      "inconclusive and pass disagree",
      [rep(1), rep(2, { checks: [unavailable("processors")] })],
      "inconclusive",
      "inconclusive — credential verification enforced: processors unavailable",
      true,
    ],
  ])("%s", (_name, reps, outcome, reason, flaky) => {
    expect(cell(reps)).toEqual({ outcome, reason, flaky });
  });

  it("ignores unfinished reps and recomputes a missing rep outcome", () => {
    const reps = [
      rep(1, { outcome: "pass" }),
      rep(2, { status: "running", checks: [fail("catchUp")] }),
      rep(3, { checks: [fail("catchUp")] }),
    ];
    expect(cell(reps).outcome).toBe("fail");
    expect(
      cell([rep(1, { outcome: "pass", checks: [fail("catchUp")] })]).outcome,
    ).toBe("pass");
  });

  it("errors when no rep finished", () => {
    expect(cell([rep(1, { status: "queued" })])).toEqual({
      outcome: "error",
      reason: "no repetition finished",
      flaky: false,
    });
  });

  it.each<[string, Rep[], string, string]>([
    [
      "refused at boot",
      [rep(1, { spawnFailed: true, checks: [] })],
      "pass",
      "refused at boot, as expected",
    ],
    [
      "accepted",
      [rep(1, { spawnFailed: true }), rep(2)],
      "fail",
      "rep 2: started though a refusal was expected",
    ],
  ])("judges a negative test %s", (_name, reps, outcome, reason) => {
    expect(cell(reps, { expect: "refusal" })).toMatchObject({
      outcome,
      reason,
    });
  });
});

describe("summarize", () => {
  it("counts outcomes, finished and flaky cells", () => {
    const summary = summarize([
      { status: "done", outcome: "pass", flaky: false },
      { status: "done", outcome: "pass", flaky: true },
      { status: "done", outcome: "inconclusive", flaky: false },
      { status: "done", outcome: "skipped-constraint", flaky: false },
      { status: "running", flaky: false },
      { status: "pending", flaky: false },
    ]);
    expect(summary).toEqual({
      total: 6,
      done: 4,
      flaky: 1,
      outcomes: {
        "skipped-constraint": 1,
        "invalid-static": 0,
        "invalid-boot": 0,
        pass: 2,
        fail: 0,
        inconclusive: 1,
        error: 0,
      },
    });
  });

  it("starts every outcome at zero", () => {
    expect(Object.values(summarize([]).outcomes)).toEqual([
      0, 0, 0, 0, 0, 0, 0,
    ]);
  });
});
