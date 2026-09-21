import { describe, expect, it } from "vitest";
import {
  cronIntervalMs,
  nextFireAt,
  parseScheduleConfig,
  rescheduleAfterFire,
  schedulePayload,
} from "./schedule.js";

const at = (iso: string) => new Date(iso);

describe("parseScheduleConfig", () => {
  it("parses cron mode with a default UTC timezone", () => {
    expect(parseScheduleConfig({ mode: "cron", cron: "0 9 * * 1-5" })).toEqual({
      mode: "cron",
      cron: "0 9 * * 1-5",
      timezone: "UTC",
    });
  });

  it("normalises whitespace and infers the mode from the fields present", () => {
    expect(parseScheduleConfig({ cron: "  */15  *  * * *" })).toEqual({
      mode: "cron",
      cron: "*/15 * * * *",
      timezone: "UTC",
    });
    expect(parseScheduleConfig({ every: 2, unit: "hours" })).toEqual({
      mode: "interval",
      everyMs: 7_200_000,
      timezone: "UTC",
    });
    expect(parseScheduleConfig({ everyMs: 90_000 })).toEqual({
      mode: "interval",
      everyMs: 90_000,
      timezone: "UTC",
    });
  });

  it("accepts numeric strings and JSON-encoded configs", () => {
    expect(
      parseScheduleConfig(
        JSON.stringify({
          mode: "interval",
          every: "5",
          timezone: "Asia/Tokyo",
        }),
      ),
    ).toEqual({ mode: "interval", everyMs: 300_000, timezone: "Asia/Tokyo" });
  });

  it("rejects invalid cron patterns, field counts and never-firing crons", () => {
    expect(() => parseScheduleConfig({ mode: "cron", cron: "bogus" })).toThrow(
      /exactly five fields/,
    );
    expect(() =>
      parseScheduleConfig({ mode: "cron", cron: "*/10 * * * * *" }),
    ).toThrow(/exactly five fields/);
    expect(() =>
      parseScheduleConfig({ mode: "cron", cron: "99 * * * *" }),
    ).toThrow(/invalid cron/);
    expect(() =>
      parseScheduleConfig({ mode: "cron", cron: "0 0 31 2 *" }),
    ).toThrow(/never fires/);
    expect(() => parseScheduleConfig({ mode: "cron" })).toThrow(
      /"cron" is required/,
    );
  });

  it("rejects unknown timezones", () => {
    expect(() =>
      parseScheduleConfig({ cron: "0 9 * * *", timezone: "Mars/Olympus" }),
    ).toThrow(/unknown timezone "Mars\/Olympus"/);
  });

  it("enforces the one-second floor and positive intervals", () => {
    expect(() =>
      parseScheduleConfig({ mode: "interval", everyMs: 250 }),
    ).toThrow(/at least 1s/);
    expect(
      parseScheduleConfig({ mode: "interval", everyMs: 1_000 }),
    ).toMatchObject({ mode: "interval", everyMs: 1_000 });
    expect(() => parseScheduleConfig({ mode: "interval", every: 0 })).toThrow(
      /positive/,
    );
    expect(() =>
      parseScheduleConfig({ mode: "interval", every: 1, unit: "weeks" }),
    ).toThrow(/"unit" must be one of/);
    expect(() => parseScheduleConfig({ mode: "interval" })).toThrow(
      /"every" \(with "unit"\) or "everyMs" is required/,
    );
  });

  it("rejects a config with no mode and no schedule fields", () => {
    expect(() => parseScheduleConfig({})).toThrow(/"mode" must be/);
    expect(() => parseScheduleConfig(null)).toThrow(/"mode" must be/);
  });
});

describe("nextFireAt", () => {
  it("computes the next cron slot strictly after `from`", () => {
    const schedule = parseScheduleConfig({ cron: "*/5 * * * *" });
    expect(nextFireAt(schedule, at("2026-09-04T10:02:00Z")).toISOString()).toBe(
      "2026-09-04T10:05:00.000Z",
    );
    expect(nextFireAt(schedule, at("2026-09-04T10:05:00Z")).toISOString()).toBe(
      "2026-09-04T10:10:00.000Z",
    );
  });

  it("evaluates the pattern in the schedule's timezone", () => {
    const schedule = parseScheduleConfig({
      cron: "0 9 * * *",
      timezone: "Asia/Tokyo",
    });
    // 09:00 JST is 00:00 UTC.
    expect(nextFireAt(schedule, at("2026-09-04T10:00:00Z")).toISOString()).toBe(
      "2026-09-05T00:00:00.000Z",
    );
  });

  it("follows a DST transition: same wall-clock time, shifted UTC instant", () => {
    const schedule = parseScheduleConfig({
      cron: "0 9 * * *",
      timezone: "Europe/Lisbon",
    });
    // Lisbon leaves WET (UTC+0) for WEST (UTC+1) on 2026-03-29.
    expect(nextFireAt(schedule, at("2026-03-27T12:00:00Z")).toISOString()).toBe(
      "2026-03-28T09:00:00.000Z",
    );
    expect(nextFireAt(schedule, at("2026-03-29T12:00:00Z")).toISOString()).toBe(
      "2026-03-30T08:00:00.000Z",
    );
  });

  it("fires once past a wall-clock slot erased by a spring-forward jump", () => {
    const schedule = parseScheduleConfig({
      cron: "30 2 * * *",
      timezone: "America/New_York",
    });
    // 02:30 does not exist on 2026-03-08; the first valid instant after it
    // is 03:30 EDT (07:30Z), and the day after resumes at 02:30 EDT (06:30Z).
    const first = nextFireAt(schedule, at("2026-03-08T05:00:00Z"));
    expect(first.toISOString()).toBe("2026-03-08T07:30:00.000Z");
    expect(nextFireAt(schedule, first).toISOString()).toBe(
      "2026-03-09T06:30:00.000Z",
    );
  });

  it("adds the interval in interval mode", () => {
    const schedule = parseScheduleConfig({ every: 10, unit: "minutes" });
    expect(nextFireAt(schedule, at("2026-09-04T10:02:00Z")).toISOString()).toBe(
      "2026-09-04T10:12:00.000Z",
    );
  });
});

describe("rescheduleAfterFire", () => {
  it("keeps the interval phase when the fire was on time", () => {
    const schedule = parseScheduleConfig({ every: 10, unit: "minutes" });
    const next = rescheduleAfterFire(
      schedule,
      at("2026-09-04T10:00:00Z"),
      at("2026-09-04T10:00:07Z"),
    );
    expect(next.toISOString()).toBe("2026-09-04T10:10:00.000Z");
  });

  it("rebases an overdue interval on now instead of replaying missed slots", () => {
    const schedule = parseScheduleConfig({ every: 10, unit: "minutes" });
    const next = rescheduleAfterFire(
      schedule,
      at("2026-09-04T10:00:00Z"),
      at("2026-09-04T11:33:00Z"),
    );
    expect(next.toISOString()).toBe("2026-09-04T11:43:00.000Z");
  });

  it("takes the next cron slot after now", () => {
    const schedule = parseScheduleConfig({ cron: "0 * * * *" });
    const next = rescheduleAfterFire(
      schedule,
      at("2026-09-04T08:00:00Z"),
      at("2026-09-04T11:33:00Z"),
    );
    expect(next.toISOString()).toBe("2026-09-04T12:00:00.000Z");
  });
});

describe("schedulePayload", () => {
  it("exposes the slot, the fire time and the schedule shape", () => {
    const cron = parseScheduleConfig({
      cron: "0 9 * * *",
      timezone: "Europe/Lisbon",
    });
    expect(
      schedulePayload(
        cron,
        at("2026-09-04T08:00:00Z"),
        at("2026-09-04T08:00:09Z"),
      ),
    ).toEqual({
      scheduledFor: "2026-09-04T08:00:00.000Z",
      firedAt: "2026-09-04T08:00:09.000Z",
      timezone: "Europe/Lisbon",
      cron: "0 9 * * *",
    });
    const interval = parseScheduleConfig({ every: 1, unit: "hours" });
    expect(
      schedulePayload(
        interval,
        at("2026-09-04T08:00:00Z"),
        at("2026-09-04T08:00:09Z"),
      ),
    ).toEqual({
      scheduledFor: "2026-09-04T08:00:00.000Z",
      firedAt: "2026-09-04T08:00:09.000Z",
      timezone: "UTC",
      everyMs: 3_600_000,
    });
  });
});

describe("cronIntervalMs", () => {
  it("measures the gap between the next two runs with a floor", () => {
    const from = at("2026-09-04T10:02:00Z");
    expect(cronIntervalMs("*/2 * * * *", from)).toBe(120_000);
    expect(cronIntervalMs("0 3 * * 1", from)).toBe(7 * 86_400_000);
    expect(cronIntervalMs("* * * * * *", from)).toBe(1_000);
    expect(cronIntervalMs("nope", from)).toBeUndefined();
  });
});
