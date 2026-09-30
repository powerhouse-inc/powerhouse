import { describe, expect, it } from "vitest";
import {
  assertActionsApplied,
  deadlineMargin,
  type ReactorActionOutcome,
} from "./reactor.js";

const TYPE_ERROR =
  '[{"expected":"number","code":"invalid_type","path":["latePenaltyPerHour"],"message":"Invalid input"}]';

function check(types: string[], outcomes: ReactorActionOutcome[] | undefined) {
  const actionIds = types.map((_, index) => `a${index}`);
  return () =>
    assertActionsApplied(
      { jobId: "j1", status: "READ_READY", actions: outcomes },
      { jobId: "j1", actionIds },
      types.map((type) => ({ type })),
    );
}

describe("assertActionsApplied", () => {
  it("passes a job whose every action applied", () => {
    expect(
      check(
        ["SET_COMMITMENT", "SET_TERMS"],
        [
          { actionId: "a0", kind: "applied" },
          { actionId: "a1", kind: "applied" },
        ],
      ),
    ).not.toThrow();
  });

  it("names every action the reducer rejected, with its reason", () => {
    expect(
      check(
        ["SET_COMMITMENT", "SET_TERMS"],
        [
          { actionId: "a0", kind: "reducer-error", message: TYPE_ERROR },
          { actionId: "a1", kind: "reducer-error", message: "nope" },
        ],
      ),
    ).toThrow(
      /SET_COMMITMENT failed.*latePenaltyPerHour.*SET_TERMS failed: nope/s,
    );
  });

  it("fails a denied action", () => {
    expect(
      check(
        ["SET_TERMS"],
        [{ actionId: "a0", kind: "denied", reason: "no grant" }],
      ),
    ).toThrow("Action SET_TERMS was denied: no grant");
  });

  it("fails an action the job wrote no operation for", () => {
    expect(
      check(
        ["SET_COMMITMENT", "SET_TERMS"],
        [{ actionId: "a0", kind: "applied" }],
      ),
    ).toThrow("Action SET_TERMS produced no operation");
  });

  it("fails a job that reported no outcomes at all", () => {
    expect(check(["SET_TERMS"], undefined)).toThrow(
      "Reactor job j1 reported no outcome for its 1 action(s)",
    );
  });

  it("does not answer for an outcome of an action it did not submit", () => {
    expect(
      check(
        ["SET_TERMS"],
        [
          { actionId: "other", kind: "reducer-error", message: TYPE_ERROR },
          { actionId: "a0", kind: "applied" },
        ],
      ),
    ).not.toThrow();
  });
});

describe("deadlineMargin", () => {
  it("is a tenth of the budget, within bounds", () => {
    expect(deadlineMargin(1_000)).toBe(250);
    expect(deadlineMargin(10_000)).toBe(1_000);
    expect(deadlineMargin(120_000)).toBe(2_000);
  });
});
