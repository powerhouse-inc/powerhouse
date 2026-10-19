import { afterEach, describe, expect, it, vi } from "vitest";
import { createAction } from "./actions.js";
import {
  compareActionIds,
  createActionIdGenerator,
  generateActionId,
} from "./action-id.js";

const UUID_V7 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function expectIncreasing(ids: string[]): void {
  for (const id of ids) expect(id).toMatch(UUID_V7);
  for (let i = 1; i < ids.length; i++) {
    expect(
      compareActionIds(ids[i - 1], ids[i]),
      `${ids[i - 1]} < ${ids[i]}`,
    ).toBe(-1);
  }
}

const msOf = (id: string) => parseInt(id.replace(/-/g, "").slice(0, 12), 16);

describe("generateActionId", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("strictly increases on a frozen clock", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));
    // A fresh generator: the process-wide one may have seen a later clock.
    const next = createActionIdGenerator();
    const ids = Array.from({ length: 100 }, () => next());
    expectIncreasing(ids);
    expect(msOf(ids[0])).toBe(Date.parse("2026-01-01T00:00:00.000Z"));
  });

  it("strictly increases across a clock that steps back", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T00:00:10.000Z"));
    const before = generateActionId();
    vi.setSystemTime(new Date("2026-02-01T00:00:00.000Z"));
    expectIncreasing([before, generateActionId(), generateActionId()]);
  });

  it("strictly increases through a counter overflow", () => {
    const next = createActionIdGenerator({
      now: () => 1_000,
      random: (bytes) => bytes.fill(0xff),
    });
    const ids = Array.from({ length: 5_000 }, () => next());
    expectIncreasing(ids);
    expect(msOf(ids[0])).toBe(1_000);
    expect(msOf(ids.at(-1)!)).toBeGreaterThan(1_000);
  });

  it("orders each generator's ids on its own", () => {
    const a = createActionIdGenerator({ now: () => 5 });
    const b = createActionIdGenerator({ now: () => 5 });
    expectIncreasing([a(), a(), a()]);
    expectIncreasing([b(), b(), b()]);
  });

  it("gives actions increasing ids with wall-clock stamps under fake timers", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T00:00:00.000Z"));
    const actions = [1, 2, 3].map(() => createAction("A"));
    expectIncreasing(actions.map((action) => action.id));
    for (const action of actions) {
      expect(action.timestampUtcMs).toBe("2026-03-01T00:00:00.000Z");
    }
  });
});

describe("compareActionIds", () => {
  it("orders by code unit where a locale would not", () => {
    // Danish collation reads "aa" as å, after z.
    expect("aa".localeCompare("ab", "da")).toBe(1);
    expect(compareActionIds("aa", "ab")).toBe(-1);
    expect(compareActionIds("ab", "aa")).toBe(1);
    expect(compareActionIds("aa", "aa")).toBe(0);
  });

  it("keeps a frozen clock's ids in creation order", () => {
    const next = createActionIdGenerator({ now: () => 7 });
    const ids = Array.from({ length: 2_000 }, () => next());
    expect([...ids].reverse().sort(compareActionIds)).toEqual(ids);
  });
});
