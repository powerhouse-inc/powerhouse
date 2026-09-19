import { describe, expect, it } from "vitest";
import {
  attemptStatus,
  costLabel,
  formatTokens,
  isTruncated,
  totalTokens,
  type StatusInput,
} from "../src/lib/attempt-status.js";

const ok: StatusInput = {
  installOk: true,
  buildSkipped: false,
  buildOk: true,
  buildFailureReason: null,
  contaminated: false,
};

describe("attemptStatus", () => {
  it.each<[Partial<StatusInput>, string]>([
    [{}, "complete"],
    [{ installOk: false }, "infra-fail"],
    [{ installOk: false, buildSkipped: true }, "infra-fail"],
    [{ buildSkipped: true, buildOk: false }, "skipped"],
    [{ buildOk: false, buildFailureReason: "rate-limited" }, "rate-limited"],
    [
      {
        buildOk: false,
        buildFailureReason: "rate-limited",
        contaminated: true,
      },
      "rate-limited",
    ],
    [{ buildOk: false, buildFailureReason: "wall-clock" }, "build-fail"],
    [{ buildOk: false, buildFailureReason: "api-error" }, "build-fail"],
    [{ buildOk: false, buildFailureReason: "nonzero-exit" }, "build-fail"],
    [{ buildOk: false, buildFailureReason: "no-result-record" }, "build-fail"],
    [{ buildOk: false, buildFailureReason: "spawn-error" }, "build-fail"],
    [{ buildOk: false, buildFailureReason: "cli-version-drift" }, "build-fail"],
    [{ buildOk: false, buildFailureReason: "budget-exhausted" }, "complete"],
    [
      {
        buildOk: false,
        buildFailureReason: "budget-exhausted",
        contaminated: true,
      },
      "contaminated",
    ],
    [{ contaminated: true }, "contaminated"],
  ])("%j -> %s", (overrides, expected) => {
    expect(attemptStatus({ ...ok, ...overrides })).toBe(expected);
  });
});

describe("isTruncated", () => {
  it("is only a budget-exhausted build that the workspace was graded for", () => {
    expect(
      isTruncated({ buildOk: false, buildFailureReason: "budget-exhausted" }),
    ).toBe(true);
    expect(
      isTruncated({ buildOk: false, buildFailureReason: "wall-clock" }),
    ).toBe(false);
    expect(isTruncated({ buildOk: true, buildFailureReason: null })).toBe(
      false,
    );
  });
});

describe("tokens", () => {
  it("totals all four kinds and formats compactly", () => {
    expect(totalTokens(null)).toBeNull();
    expect(
      totalTokens({ input: 1, output: 2, cacheCreation: 3, cacheRead: 4 }),
    ).toBe(10);
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_400)).toBe("12k");
    expect(formatTokens(2_842_778)).toBe("2.8M");
  });

  it("costLabel prefers cost, falls back to tokens, then to a question mark", () => {
    expect(costLabel({ costUsd: 1.234, tokens: null })).toBe("$1.23");
    expect(
      costLabel({
        costUsd: null,
        tokens: { input: 0, output: 0, cacheCreation: 0, cacheRead: 2_500_000 },
      }),
    ).toBe("2.5M tok (unmetered)");
    expect(costLabel({ costUsd: null, tokens: null })).toBe("cost=?");
  });
});
