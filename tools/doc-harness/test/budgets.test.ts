import { describe, expect, it } from "vitest";
import {
  judgeBudgetUsd,
  scaledWallClockMs,
  verifyBudgetUsd,
} from "../src/lib/budgets.js";

const MIN = 60_000;

describe("judgeBudgetUsd", () => {
  it("keeps the catalog value for small transcripts", () => {
    expect(judgeBudgetUsd(2, 0)).toBe(2);
    expect(judgeBudgetUsd(2, 79_999)).toBe(2);
  });

  it("grows one dollar per 40 KB", () => {
    expect(judgeBudgetUsd(2, 80_001)).toBe(3);
    expect(judgeBudgetUsd(2, 155_000)).toBe(4);
  });

  it("caps at three times the catalog value", () => {
    expect(judgeBudgetUsd(2, 1_000_000)).toBe(6);
    expect(judgeBudgetUsd(1, 1_000_000)).toBe(3);
  });
});

describe("verifyBudgetUsd", () => {
  it("scales with kept findings and caps at 3x", () => {
    expect(verifyBudgetUsd(2, 0)).toBe(2);
    expect(verifyBudgetUsd(2, 2)).toBe(2);
    expect(verifyBudgetUsd(2, 4)).toBe(3);
    expect(verifyBudgetUsd(2, 40)).toBe(6);
  });
});

describe("scaledWallClockMs", () => {
  it("adds five minutes per 100 KB and caps at 45 minutes", () => {
    expect(scaledWallClockMs(15 * MIN, 0)).toBe(15 * MIN);
    expect(scaledWallClockMs(15 * MIN, 100_000)).toBe(20 * MIN);
    expect(scaledWallClockMs(15 * MIN, 155_000)).toBe(22.75 * MIN);
    expect(scaledWallClockMs(15 * MIN, 5_000_000)).toBe(45 * MIN);
    expect(scaledWallClockMs(20 * MIN, 5_000_000)).toBe(45 * MIN);
  });

  it("never shrinks a base above the cap", () => {
    expect(scaledWallClockMs(50 * MIN, 0)).toBe(50 * MIN);
  });
});
