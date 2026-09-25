import { describe, expect, it } from "vitest";
import {
  configFromDraft,
  draftFromConfig,
  switchKind,
  timezoneOf,
} from "./schedule-draft.js";

describe("draftFromConfig", () => {
  it.each([
    [
      { cron: "0 8 * * *" },
      { kind: "daily", time: "08:00", weekdaysOnly: false },
    ],
    [
      { cron: "30 17 * * 1-5" },
      { kind: "daily", time: "17:30", weekdaysOnly: true },
    ],
    [
      { cron: "0 7 * * 5,1,3" },
      { kind: "weekly", time: "07:00", days: [1, 3, 5] },
    ],
    [{ cron: "0 7 * * 7" }, { kind: "weekly", time: "07:00", days: [0] }],
    [{ cron: "*/15 * * * *" }, { kind: "custom", cron: "*/15 * * * *" }],
    [{ cron: "0 6 1 * *" }, { kind: "custom", cron: "0 6 1 * *" }],
    [
      { mode: "interval", every: 2, unit: "hours" },
      { kind: "interval", every: 2, unit: "hours" },
    ],
    [{}, { kind: "daily", time: "09:00", weekdaysOnly: false }],
  ])("%j", (config, draft) => {
    expect(draftFromConfig(config)).toEqual(draft);
  });
});

describe("configFromDraft", () => {
  it("round-trips the presets through cron", () => {
    for (const cron of ["0 8 * * *", "30 17 * * 1-5", "0 7 * * 1,3,5"]) {
      expect(configFromDraft(draftFromConfig({ cron }), "UTC")).toEqual({
        mode: "cron",
        cron,
      });
    }
  });

  it("stores a timezone only when it isn't UTC", () => {
    const draft = draftFromConfig({ cron: "0 8 * * *" });
    expect(configFromDraft(draft, "Europe/Lisbon")).toEqual({
      mode: "cron",
      cron: "0 8 * * *",
      timezone: "Europe/Lisbon",
    });
    expect(timezoneOf({ cron: "0 8 * * *" })).toBe("UTC");
  });

  it("writes intervals in interval mode", () => {
    expect(
      configFromDraft({ kind: "interval", every: 5, unit: "minutes" }, "UTC"),
    ).toEqual({ mode: "interval", every: 5, unit: "minutes" });
  });
});

describe("switchKind", () => {
  it("keeps the time between daily and weekly", () => {
    const daily = draftFromConfig({ cron: "15 6 * * *" });
    expect(switchKind(daily, "weekly")).toEqual({
      kind: "weekly",
      time: "06:15",
      days: [1],
    });
  });

  it("opens custom on the cron the preset stood for", () => {
    const weekly = draftFromConfig({ cron: "0 7 * * 1,3" });
    expect(switchKind(weekly, "custom")).toEqual({
      kind: "custom",
      cron: "0 7 * * 1,3",
    });
  });
});
