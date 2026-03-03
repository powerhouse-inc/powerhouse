import { describe, it, expect } from "vitest";
import {
  _nextSemiAnnualPeriod,
  _nextAnnualPeriod,
  _nextQuarterlyPeriod,
  _nextMonthlyPeriod,
  _nextWeeklyPeriod,
  _nextDailyPeriod,
  _nextHourlyPeriod,
} from "../src/AnalyticsTimeSlicer.js";
import { getQuarter } from "../src/AnalyticsDiscretizer.js";
import { DateTime } from "luxon";

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

  it("returns the correct period for a utc start date", () => {
    const nextStart = DateTime.utc(2021, 4, 1);
    const seriesEnd = nextStart.plus({ days: 1 });
    const period = _nextAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("annual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(nextStart.plus({ years: 1 }));
  });

  it("returns the correct period in UTC, regardless of input time zone", () => {
    const nextStart = DateTime.fromObject(
      {
        year: 2021,
        month: 4,
        day: 1,
      },
      { zone: "America/New_York" },
    );
    const seriesEnd = nextStart.plus({ days: 1 });
    const period = _nextAnnualPeriod(nextStart, seriesEnd);

    expect(period?.end).toEqual(DateTime.utc(2022, 4, 1));
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
    expect(period?.end).toEqual(DateTime.utc(2021, 12, 31, 23, 59, 59, 999));
  });

  it("returns the correct period for a utc start date in the second half of the year that is after July 1st", () => {
    const nextStart = DateTime.utc(2021, 12, 1);
    const seriesEnd = DateTime.utc(2022, 1, 1);
    const period = _nextSemiAnnualPeriod(nextStart, seriesEnd);

    expect(period?.period).toBe("semiAnnual");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(DateTime.utc(2021, 12, 31, 23, 59, 59, 999));
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
    expect(period?.end).toEqual(DateTime.utc(2021, 12, 31, 23, 59, 59, 999));
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
    // we use US/Eastern, which is UTC-1, so the end of the year is _after_ the UTC end of the year. This means
    // it does NOT clamp, but returns the UTC end of year.
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
    expect(period?.end).toEqual(DateTime.utc(2021, 12, 31, 23, 59, 59, 999));
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

  it("returns the correct period for a utc start date that is not at the beginning of an hour", () => {
    const nextStart = DateTime.utc(2021, 1, 1, 0, 30);
    const seriesEnd = DateTime.utc(2021, 1, 1, 1, 29, 59, 999);
    const period = _nextHourlyPeriod(nextStart, seriesEnd);
    expect(period?.period).toBe("hourly");
    expect(period?.start).toEqual(nextStart);
    expect(period?.end).toEqual(seriesEnd);
  });

  it("returns the correct period when utc seriesEnd is within the same hour", () => {
    const nextStart = DateTime.utc(2021, 1, 1);
    const seriesEnd = DateTime.utc(2021, 1, 1, 30);
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
