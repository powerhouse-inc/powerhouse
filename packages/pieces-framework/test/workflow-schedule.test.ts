import { describe, expect, it } from "vitest";
import { parseScheduleConfig, scheduleConfigIssue } from "../src/workflow.js";

describe("parseScheduleConfig (shared)", () => {
  it("reads both modes", () => {
    expect(parseScheduleConfig({ mode: "cron", cron: "0 9 * * 1-5" })).toEqual({
      mode: "cron",
      cron: "0 9 * * 1-5",
      timezone: "UTC",
    });
    expect(
      parseScheduleConfig({
        mode: "interval",
        every: 3,
        unit: "hours",
        timezone: "Europe/Lisbon",
      }),
    ).toEqual({
      mode: "interval",
      every: 3,
      unit: "hours",
      everyMs: 10_800_000,
      timezone: "Europe/Lisbon",
    });
  });

  it("names what is wrong rather than inferring", () => {
    expect(scheduleConfigIssue({ cron: "0 9 * * *" })).toMatch(
      /"mode" is required/,
    );
    expect(
      scheduleConfigIssue({ mode: "cron", every: 5, unit: "minutes" }),
    ).toMatch(/"cron" is required/);
    expect(
      scheduleConfigIssue({ mode: "interval", every: 5, unit: "seconds" }),
    ).toMatch(/"unit" must be one of minutes, hours, days/);
    expect(scheduleConfigIssue({ mode: "cron", cron: "0 9 * *" })).toMatch(
      /exactly five fields/,
    );
    expect(scheduleConfigIssue({ mode: "cron", cron: "0 9 * * {}" })).toMatch(
      /invalid field/,
    );
    expect(
      scheduleConfigIssue({ mode: "cron", cron: "*/5 * * * *" }),
    ).toBeUndefined();
  });
});
