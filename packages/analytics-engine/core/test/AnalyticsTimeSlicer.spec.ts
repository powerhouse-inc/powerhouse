import { describe, it, expect } from "vitest";
import {
  _nextSemiAnnualPeriod,
  _nextAnnualPeriod,
  _nextQuarterlyPeriod,
  _nextMonthlyPeriod,
  _nextWeeklyPeriod,
  _nextDailyPeriod,
  _nextHourlyPeriod,
  getPeriodSeriesArray,
  type AnalyticsRange,
} from "../src/AnalyticsTimeSlicer.js";
import {
  AnalyticsDiscretizer,
  getQuarter,
} from "../src/AnalyticsDiscretizer.js";
import {
  AnalyticsGranularity,
  type AnalyticsSeries,
} from "../src/AnalyticsQuery.js";
import { AnalyticsPath } from "../src/AnalyticsPath.js";
import { DateTime } from "luxon";

// Boundary convention (see the header of src/AnalyticsTimeSlicer.ts and
// docs/plans/2026-10-02-testing-policy.md, R4): periods are half-open
// intervals [start, end) anchored to the UTC calendar per ISO 8601. An
// annual period labelled 2021 is the calendar year 2021: it starts at
// 2021-01-01T00:00:00.000Z and ends at (exclusive) 2022-01-01T00:00:00.000Z.
// These expected values are written from the calendar, not from running the
// implementation.
describe("_nextAnnualPeriod", () => {
  it("returns null if seriesEnd is before nextStart", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2020, 12, 31);

    expect(_nextAnnualPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns null if nextStart is equal to seriesEnd", () => {
    const nextStart = DateTime.utc(2021, 12, 31);
    const seriesEnd = DateTime.utc(2021, 12, 31);

    expect(_nextAnnualPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("ends a period starting on January 1st at January 1st of the next year", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2030, 1, 1);
    const period = _nextAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("annual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2022, 1, 1));
  });

  it("anchors a mid-year start to the calendar year, not to the start date", () => {
    // Calendar year 2021 ends at 2022-01-01T00:00:00.000Z, regardless of
    // where inside 2021 the series starts.
    const nextStart = DateTime.utc(2021, 4, 1);
    const seriesEnd = nextStart.plus({ years: 2 });
    const period = _nextAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("annual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2022, 1, 1));
  });

  it("anchors to the UTC calendar year for a positive-offset zone", () => {
    // Europe/Brussels is UTC+1 in winter: local 2021-01-01T00:00 is
    // 2020-12-31T23:00Z, which lies in the UTC calendar year 2020. The
    // period therefore ends at 2021-01-01T00:00:00.000Z. A positive offset
    // is the only kind that can roll a UTC date backward; this is the case
    // the original report (host at UTC+2) hit.
    const nextStart = DateTime.fromObject(
      { year: 2021, month: 1, day: 1 },
      { zone: "Europe/Brussels" },
    );
    const seriesEnd = nextStart.plus({ years: 2 });
    const period = _nextAnnualPeriod(nextStart, seriesEnd);

    expect(nextStart.toUTC().year).toBe(2020);
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 1));
  });

  it("anchors to the UTC calendar year for a negative-offset zone", () => {
    // America/New_York is UTC-5 in winter: local 2021-01-01T00:00 is
    // 2021-01-01T05:00Z, still inside the UTC calendar year 2021, so the
    // period ends at 2022-01-01T00:00:00.000Z.
    const nextStart = DateTime.fromObject(
      { year: 2021, month: 1, day: 1 },
      { zone: "America/New_York" },
    );
    const seriesEnd = nextStart.plus({ years: 2 });
    const period = _nextAnnualPeriod(nextStart, seriesEnd);

    expect(nextStart.toUTC().year).toBe(2021);
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2022, 1, 1));
  });
});

describe("_nextSemiAnnualPeriod", () => {
  it("returns null if seriesEnd is before nextStart", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2020, 12, 31);
    expect(_nextSemiAnnualPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns the correct period for a utc start date in the first half of the year", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 12, 31);
    const period = _nextSemiAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("semiAnnual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 7, 1));
  });

  it("returns the correct period for a utc start date in the second half of the year", () => {
    const nextStart = DateTime.utc(2021, 9, 1);
    const seriesEnd = DateTime.utc(2022, 1, 1);
    const period = _nextSemiAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("semiAnnual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2022, 1, 1));
  });

  it("returns the correct period for a utc start date in the second half of the year that is after July 1st", () => {
    const nextStart = DateTime.utc(2021, 12, 1);
    const seriesEnd = DateTime.utc(2022, 1, 1);
    const period = _nextSemiAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("semiAnnual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2022, 1, 1));
  });

  it("returns the correct utc period for a local start date in the second half of the year", () => {
    const nextStart = DateTime.local(2021, 1, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2022, 1, 1, { zone: "America/New_York" });
    const period = _nextSemiAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("semiAnnual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 7, 1));
  });

  it("returns the correct utc period for a local start date in the second half of the year", () => {
    const nextStart = DateTime.local(2021, 9, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2022, 1, 1, { zone: "America/New_York" });
    const period = _nextSemiAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("semiAnnual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2022, 1, 1));
  });
});

describe("_nextQuarterlyPeriod", () => {
  it("returns null if seriesEnd is before nextStart", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2020, 12, 31);
    expect(_nextQuarterlyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns null if nextStart is equal to seriesEnd", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 1, 1);
    expect(_nextQuarterlyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns the correct period for a utc start date in the first quarter", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 12, 31, 23, 59, 59, 999);
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 4, 1));
  });

  it("returns the correct utc period for a local start date in the first quarter", () => {
    const nextStart = DateTime.local(2021, 1, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2021, 12, 31, 23, 59, 59, 999, {
      zone: "America/New_York",
    });
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 4, 1));
  });

  it("returns the correct period for a utc start date in the second quarter", () => {
    const nextStart = DateTime.utc(2021, 4, 1);
    const seriesEnd = DateTime.utc(2021, 12, 31, 23, 59, 59, 999);
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 7, 1));
  });

  it("returns the correct utc period for a local start date in the second quarter", () => {
    const nextStart = DateTime.local(2021, 4, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2021, 12, 31, 23, 59, 59, 999, {
      zone: "America/New_York",
    });
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 7, 1));
  });

  it("returns the correct period for a utc start date in the third quarter", () => {
    const nextStart = DateTime.utc(2021, 7, 1);
    const seriesEnd = DateTime.utc(2021, 12, 31, 23, 59, 59, 999);
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 10, 1));
  });

  it("returns the correct utc period for a local start date in the third quarter", () => {
    const nextStart = DateTime.local(2021, 7, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2021, 12, 31, 23, 59, 59, 999, {
      zone: "America/New_York",
    });
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 10, 1));
  });

  it("returns the correct period for a utc start date in the fourth quarter", () => {
    const nextStart = DateTime.utc(2021, 10, 1);
    const seriesEnd = DateTime.utc(2021, 12, 31, 23, 59, 59, 999);
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(seriesEnd);
  });

  it("returns the correct period for a clamped local end date in the fourth quarter", () => {
    // _nextQuarterlyPeriod wants to return in UTC, but clamps the end date to the series end. In this case,
    // we use Berlin, which is UTC+1, so the end of the year is _before_ the UTC end of the year. This means
    // it has to clamp.
    const nextStart = DateTime.fromObject(
      { year: 2021, month: 10, day: 1 },
      { zone: "Europe/Berlin" },
    );
    const seriesEnd = DateTime.fromObject(
      {
        year: 2021,
        month: 12,
        day: 31,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999,
      },
      { zone: "Europe/Berlin" },
    );
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(seriesEnd);
  });

  it("returns the correct period for a local end date in the fourth quarter", () => {
    // _nextQuarterlyPeriod wants to return in UTC, but clamps the end date to the series end. In this case,
    // we use US/Eastern, which is behind UTC, so the series end is _after_ the UTC start of the next year.
    // This means it does NOT clamp: Q4 ends at the half-open calendar boundary 2022-01-01T00:00:00.000Z.
    const nextStart = DateTime.fromObject(
      { year: 2021, month: 10, day: 1 },
      { zone: "US/Eastern" },
    );
    const seriesEnd = DateTime.fromObject(
      {
        year: 2021,
        month: 12,
        day: 31,
        hour: 23,
        minute: 59,
        second: 59,
        millisecond: 999,
      },
      { zone: "US/Eastern" },
    );
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2022, 1, 1));
  });

  it("returns the correct period when the utc end date is before the end of the quarter", () => {
    const nextStart = DateTime.utc(2021, 9, 1);
    const seriesEnd = DateTime.utc(2021, 9, 30);
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(seriesEnd);
  });

  it("returns the correct period when the utc end date is after the end of the quarter", () => {
    const nextStart = DateTime.utc(2021, 9, 1);
    const seriesEnd = DateTime.utc(2021, 10, 1);
    const period = _nextQuarterlyPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("quarterly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 10, 1));
  });
});

describe("_nextMonthlyPeriod", () => {
  it("returns null if seriesEnd is before nextStart", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2020, 12, 31);
    expect(_nextMonthlyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns null if nextStart is equal to seriesEnd", () => {
    const nextStart = DateTime.utc(2021, 12, 31);
    const seriesEnd = DateTime.utc(2021, 12, 31);
    expect(_nextMonthlyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns the correct period for a utc start date in the first half of the month", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 1, 31);
    const period = _nextMonthlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("monthly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 2, 1));
  });

  it("returns the correct period for a utc start date in the second half of the month", () => {
    const nextStart = DateTime.utc(2021, 1, 15);
    const seriesEnd = DateTime.utc(2021, 1, 31);
    const period = _nextMonthlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("monthly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 2, 1));
  });

  it("returns the correct period when the utc end date is before the end of the month", () => {
    const nextStart = DateTime.utc(2021, 1, 15);
    const seriesEnd = DateTime.utc(2021, 1, 20);
    const period = _nextMonthlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("monthly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 2, 1));
  });

  it("returns the correct period when the utc end date is the last day of the month", () => {
    const nextStart = DateTime.utc(2021, 1, 15);
    const seriesEnd = DateTime.utc(2021, 1, 31);
    const period = _nextMonthlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("monthly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 2, 1));
  });

  it("returns the correct period when the utc end date is after the end of the month", () => {
    const nextStart = DateTime.utc(2021, 1, 15);
    const seriesEnd = DateTime.utc(2021, 2, 15);
    const period = _nextMonthlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("monthly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 2, 1));
  });

  it("returns the correct utc period for a local start date", () => {
    const nextStart = DateTime.local(2021, 1, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2021, 1, 31, { zone: "America/New_York" });
    const period = _nextMonthlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("monthly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 2, 1));
    expect((period?.end as DateTime).zoneName).toBe("UTC");
  });
});

describe("_nextWeeklyPeriod", () => {
  it("returns null if seriesEnd is before nextStart", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2020, 12, 31);
    expect(_nextWeeklyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns null if nextStart is equal to seriesEnd", () => {
    const nextStart = DateTime.utc(2021, 12, 31);
    const seriesEnd = DateTime.utc(2021, 12, 31);
    expect(_nextWeeklyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns the correct period for a utc start date in the middle of the week", () => {
    const nextStart = DateTime.utc(2021, 9, 1);
    const seriesEnd = DateTime.utc(2021, 9, 30);
    const period = _nextWeeklyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("weekly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 9, 6));
  });

  it("returns the correct period for a utc start date on a Sunday", () => {
    const nextStart = DateTime.utc(2021, 9, 5);
    const seriesEnd = DateTime.utc(2021, 9, 30);
    const period = _nextWeeklyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("weekly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 9, 6));
  });

  it("returns the correct period for a utc start date on a Monday", () => {
    const nextStart = DateTime.utc(2021, 9, 6);
    const seriesEnd = DateTime.utc(2021, 9, 30);
    const period = _nextWeeklyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("weekly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 9, 13));
  });

  it("returns the correct period for a utc start date on the last day of the series", () => {
    const nextStart = DateTime.utc(2021, 9, 27);
    const seriesEnd = DateTime.utc(2021, 9, 30);
    const period = _nextWeeklyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("weekly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(seriesEnd);
  });

  it("returns the correct period for a utc start date after the end of the series", () => {
    const nextStart = DateTime.utc(2021, 10, 1);
    const seriesEnd = DateTime.utc(2021, 9, 30);
    expect(_nextWeeklyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns the correct utc period for a local start date", () => {
    const nextStart = DateTime.local(2021, 9, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2021, 9, 30, { zone: "America/New_York" });
    const period = _nextWeeklyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("weekly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 9, 6));
    expect((period?.end as DateTime).zoneName).toBe("UTC");
  });
});

describe("_nextDailyPeriod", () => {
  it("returns null if seriesEnd is before nextStart", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2020, 12, 31);
    expect(_nextDailyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns null if nextStart is equal to seriesEnd", () => {
    const nextStart = DateTime.utc(2021, 12, 31);
    const seriesEnd = DateTime.utc(2021, 12, 31);
    expect(_nextDailyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns the correct period for a start date in the middle of the series", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 1, 10);
    const period = _nextDailyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("daily");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 2));
  });

  it("returns the correct period for a start date at the end of the series", () => {
    const nextStart = DateTime.utc(2021, 1, 9);
    const seriesEnd = DateTime.utc(2021, 1, 10);
    const period = _nextDailyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("daily");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(seriesEnd);
  });

  it("returns the correct period for a start date at the beginning of the series", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 1, 10);
    const period = _nextDailyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("daily");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 2));
  });

  it("returns the correct utc period for a local start date", () => {
    const nextStart = DateTime.local(2021, 1, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2021, 1, 10, { zone: "America/New_York" });
    const period = _nextDailyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("daily");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 2));
    expect((period?.end as DateTime).zoneName).toBe("UTC");
  });
});

describe("_nextHourlyPeriod", () => {
  it("returns null if seriesEnd is before nextStart", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2020, 12, 31);
    expect(_nextHourlyPeriod(nextStart, seriesEnd)).toBeNull();
  });

  it("returns the correct period for a start date in the same hour", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 1, 1, 0, 59);
    const period = _nextHourlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("hourly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 1, 1));
  });

  it("returns the correct period for a utc start date in the first hour of the day", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 1, 1, 23, 59, 59, 999);
    const period = _nextHourlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("hourly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 1, 1));
  });

  it("returns the correct period for a utc start date in the last hour of the day", () => {
    const nextStart = DateTime.utc(2021, 1, 1, 23);
    const seriesEnd = DateTime.utc(2021, 1, 1, 23, 59, 59, 999);
    const period = _nextHourlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("hourly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 2));
  });

  it("anchors a start that is not at the beginning of an hour to the next clock hour", () => {
    // Half-open calendar convention: the first period may be partial and
    // ends at the top of the next hour, like daily ends at the next
    // midnight.
    const nextStart = DateTime.utc(2021, 1, 1, 0, 30);
    const seriesEnd = DateTime.utc(2021, 1, 1, 1, 29, 59, 999);
    const period = _nextHourlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("hourly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 1, 1));
  });

  it("returns the correct period when utc seriesEnd is within the same hour", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 1, 1, 0, 30);
    const period = _nextHourlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("hourly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 1, 1));
  });

  it("returns the correct utc period for a local start date in the same hour", () => {
    const nextStart = DateTime.local(2021, 1, 1, { zone: "America/New_York" });
    const seriesEnd = DateTime.local(2021, 1, 1, 0, 59, {
      zone: "America/New_York",
    });
    const period = _nextHourlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("hourly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 1, 1, 6));
    expect((period?.end as DateTime).zoneName).toBe("UTC");
  });
});

describe("getPeriodSeriesArray", () => {
  // Convention under test (R4, docs/plans/2026-10-02-testing-policy.md):
  // periods are half-open intervals [start, end) that tile the query range
  // with no gaps and no overlaps — each period's end is exactly the next
  // period's start. The first period starts at the query start and may be
  // partial; every interior boundary sits on a UTC calendar boundary.
  const assertTiling = (range: AnalyticsRange) => {
    const periods = getPeriodSeriesArray(range);

    expect(periods.length).toBeGreaterThan(0);
    expect(periods[0].start.toMillis()).toBe(range.start.toMillis());

    for (let i = 0; i < periods.length; i++) {
      // no empty periods
      expect(periods[i].start.toMillis()).toBeLessThan(
        periods[i].end.toMillis(),
      );

      if (i > 0) {
        // no gaps, no overlaps: consecutive periods share a boundary
        expect(periods[i].start.toMillis()).toBe(periods[i - 1].end.toMillis());

        // interior boundaries are exact instants, not 1ms past one: for
        // every granularity here they sit at the top of a UTC hour
        const boundary = periods[i].start.toUTC();
        expect(boundary.minute).toBe(0);
        expect(boundary.second).toBe(0);
        expect(boundary.millisecond).toBe(0);
      }
    }

    // the final period reaches at least the end of the range
    const last = periods[periods.length - 1];
    expect(last.end.toMillis()).toBeGreaterThanOrEqual(range.end.toMillis());

    return periods;
  };

  // A deliberately awkward, non-boundary start exercises the partial first
  // period of every granularity.
  const awkwardStart = DateTime.utc(2021, 3, 17, 7, 30, 0, 500);

  const cases: Array<[string, AnalyticsGranularity, DateTime, DateTime]> = [
    [
      "annual",
      AnalyticsGranularity.Annual,
      awkwardStart,
      DateTime.utc(2023, 2, 10, 13),
    ],
    [
      "semiAnnual",
      AnalyticsGranularity.SemiAnnual,
      awkwardStart,
      DateTime.utc(2023, 2, 10, 13),
    ],
    [
      "quarterly",
      AnalyticsGranularity.Quarterly,
      awkwardStart,
      DateTime.utc(2023, 2, 10, 13),
    ],
    [
      "monthly",
      AnalyticsGranularity.Monthly,
      awkwardStart,
      DateTime.utc(2022, 2, 10, 13),
    ],
    [
      "weekly",
      AnalyticsGranularity.Weekly,
      awkwardStart,
      DateTime.utc(2021, 6, 10),
    ],
    [
      "daily",
      AnalyticsGranularity.Daily,
      awkwardStart,
      DateTime.utc(2021, 4, 20),
    ],
    [
      "hourly",
      AnalyticsGranularity.Hourly,
      awkwardStart,
      DateTime.utc(2021, 3, 19, 13),
    ],
    [
      "total",
      AnalyticsGranularity.Total,
      awkwardStart,
      DateTime.utc(2023, 2, 10, 13),
    ],
  ];

  for (const [name, granularity, start, end] of cases) {
    it(`tiles the timeline with no gaps and no overlaps (${name})`, () => {
      assertTiling({ start, end, granularity });
    });
  }

  it("anchors annual periods to calendar years for the natural January 1st query", () => {
    // The bug report's reproduction: start 2020-01-01, end 2030-01-01,
    // annual granularity. The calendar defines ten annual periods, each
    // [YYYY-01-01T00:00:00.000Z, (YYYY+1)-01-01T00:00:00.000Z).
    const periods = getPeriodSeriesArray({
      start: DateTime.utc(2020, 1, 1),
      end: DateTime.utc(2030, 1, 1),
      granularity: AnalyticsGranularity.Annual,
    });

    expect(periods.length).toBe(10);
    for (let i = 0; i < 10; i++) {
      expect(periods[i].start.toISO()).toBe(
        DateTime.utc(2020 + i, 1, 1).toISO(),
      );
      expect(periods[i].end.toISO()).toBe(DateTime.utc(2021 + i, 1, 1).toISO());
    }
  });

  it("returns no periods when start equals end", () => {
    const start = DateTime.utc(2021, 3, 17);
    const periods = getPeriodSeriesArray({
      start,
      end: start,
      granularity: AnalyticsGranularity.Daily,
    });

    expect(periods).toEqual([]);
  });
});

describe("AnalyticsDiscretizer boundary attribution", () => {
  // Convention under test (R4): periods are half-open [start, end), so a
  // value stamped exactly at T00:00:00.000Z of a boundary belongs to the
  // period that starts at that instant — the most common timestamp there
  // is, since every date-only value parses to midnight UTC.
  const makeSeries = (
    start: DateTime,
    value: number,
  ): AnalyticsSeries<string> => ({
    source: AnalyticsPath.fromString("test/slicer"),
    start,
    end: null,
    metric: "budget",
    value,
    unit: "DAI",
    fn: "Single",
    params: null,
    dimensions: { project: "test/slicer" },
  });

  const valuesByPeriod = (
    series: AnalyticsSeries<string>[],
    start: DateTime,
    end: DateTime,
    granularity: AnalyticsGranularity,
  ): Record<string, number> => {
    const results = AnalyticsDiscretizer.discretize(
      series,
      ["project"],
      start,
      end,
      granularity,
    );
    return Object.fromEntries(results.map((r) => [r.period, r.rows[0].value]));
  };

  it("attributes a value at exactly midnight on January 1st to the year that starts there", () => {
    const values = valuesByPeriod(
      [makeSeries(DateTime.utc(2023, 1, 1), 100)],
      DateTime.utc(2021, 1, 1),
      DateTime.utc(2024, 1, 1),
      AnalyticsGranularity.Annual,
    );

    expect(values).toEqual({ "2021": 0, "2022": 0, "2023": 100 });
  });

  it("attributes a value at exactly midnight on the 1st of a month to that month", () => {
    // The reported symptom: a value dated 2026-07-01 (midnight UTC) was
    // reported under June. It belongs to July.
    const values = valuesByPeriod(
      [makeSeries(DateTime.utc(2026, 7, 1), 100)],
      DateTime.utc(2026, 6, 1),
      DateTime.utc(2026, 9, 1),
      AnalyticsGranularity.Monthly,
    );

    expect(values).toEqual({ "2026/06": 0, "2026/07": 100, "2026/08": 0 });
  });

  it("counts a value stamped exactly at the query start in the first period", () => {
    const values = valuesByPeriod(
      [makeSeries(DateTime.utc(2026, 6, 1), 100)],
      DateTime.utc(2026, 6, 1),
      DateTime.utc(2026, 8, 1),
      AnalyticsGranularity.Monthly,
    );

    expect(values).toEqual({ "2026/06": 100, "2026/07": 0 });
  });

  it("returns no results for an empty range", () => {
    const results = AnalyticsDiscretizer.discretize(
      [makeSeries(DateTime.utc(2026, 7, 1), 100)],
      ["project"],
      DateTime.utc(2026, 6, 1),
      DateTime.utc(2026, 6, 1),
      AnalyticsGranularity.Monthly,
    );

    expect(results).toEqual([]);
  });
});

describe("utilities", () => {
  it("getQuarter returns the correct quarter", () => {
    expect(getQuarter(DateTime.utc(2024, 1, 1))).toBe(1);
    expect(getQuarter(DateTime.utc(2024, 2, 1))).toBe(1);
    expect(getQuarter(DateTime.utc(2024, 3, 1))).toBe(1);
    expect(getQuarter(DateTime.utc(2024, 4, 1))).toBe(2);
    expect(getQuarter(DateTime.utc(2024, 5, 1))).toBe(2);
    expect(getQuarter(DateTime.utc(2024, 6, 1))).toBe(2);
    expect(getQuarter(DateTime.utc(2024, 7, 1))).toBe(3);
    expect(getQuarter(DateTime.utc(2024, 8, 1))).toBe(3);
    expect(getQuarter(DateTime.utc(2024, 9, 1))).toBe(3);
    expect(getQuarter(DateTime.utc(2024, 10, 1))).toBe(4);
    expect(getQuarter(DateTime.utc(2024, 11, 1))).toBe(4);
    expect(getQuarter(DateTime.utc(2024, 12, 1))).toBe(4);
  });
});
