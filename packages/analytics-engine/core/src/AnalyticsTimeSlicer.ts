import { DateTime } from "luxon";
import { AnalyticsGranularity } from "./AnalyticsQuery.js";

export type AnalyticsRange = {
  start: DateTime;
  end: DateTime;
  granularity: AnalyticsGranularity;
};

export type AnalyticsPeriod = {
  period: string;
  start: DateTime;
  end: DateTime;
};

interface AnalyticsPeriodSeries {
  start: DateTime;
  end: DateTime;
  granularity: AnalyticsGranularity;
  next(): AnalyticsPeriod | null;
}

export const getPeriodSeriesArray = (
  range: AnalyticsRange,
): AnalyticsPeriod[] => {
  const result: AnalyticsPeriod[] = [];
  const series = getPeriodSeries(range);

  let next = series.next();
  while (next) {
    result.push(next);
    next = series.next();
  }

  return result;
};

export const getPeriodSeries = (
  range: AnalyticsRange,
): AnalyticsPeriodSeries => {
  return {
    ...range,
    next: _createFactoryFn(range),
  };
};

const _createFactoryFn = (range: AnalyticsRange) => {
  let current: DateTime | null = range.start;

  return () => {
    if (current == null) {
      return null;
    }

    let result: AnalyticsPeriod | null = null;
    switch (range.granularity) {
      case AnalyticsGranularity.Total:
        result = _nextTotalPeriod(current, range.end);
        break;
      case AnalyticsGranularity.Annual:
        result = _nextAnnualPeriod(current, range.end);
        break;
      case AnalyticsGranularity.SemiAnnual:
        result = _nextSemiAnnualPeriod(current, range.end);
        break;
      case AnalyticsGranularity.Quarterly:
        result = _nextQuarterlyPeriod(current, range.end);
        break;
      case AnalyticsGranularity.Monthly:
        result = _nextMonthlyPeriod(current, range.end);
        break;
      case AnalyticsGranularity.Weekly:
        result = _nextWeeklyPeriod(current, range.end);
        break;
      case AnalyticsGranularity.Daily:
        result = _nextDailyPeriod(current, range.end);
        break;
      case AnalyticsGranularity.Hourly:
        result = _nextHourlyPeriod(current, range.end);
    }

    // Update current to start of next period
    if (result === null) {
      current = null;
    } else {
      current = result.end.plus({ milliseconds: 1 });
    }

    return result;
  };
};

const _nextTotalPeriod = (
  nextStart: DateTime,
  seriesEnd: DateTime,
): AnalyticsPeriod | null => {
  if (seriesEnd <= nextStart) {
    return null;
  }

  return {
    period: "total",
    start: nextStart,
    end: seriesEnd,
  };
};

export const _nextAnnualPeriod = (
  nextStart: DateTime,
  seriesEnd: DateTime,
): AnalyticsPeriod | null => {
  if (seriesEnd <= nextStart) {
    return null;
  }

  const inputUtc = nextStart.toUTC();
  const oneYearLater = DateTime.utc(
    inputUtc.year,
    inputUtc.month,
    inputUtc.day,
  ).plus({ years: 1 });

  return {
    period: "annual",
    start: nextStart,
    end: oneYearLater,
  };
};

export const _nextSemiAnnualPeriod = (
  nextStart: DateTime,
  seriesEnd: DateTime,
): AnalyticsPeriod | null => {
  if (seriesEnd <= nextStart) {
    return null;
  }

  const midYear = DateTime.utc(nextStart.year, 7, 1);
  const endYear = DateTime.utc(nextStart.year, 12, 31, 23, 59, 59, 999);

  let endDate: DateTime;
  if (midYear > nextStart) {
    endDate = midYear;
  } else {
    endDate = endYear;
  }

  if (endDate > seriesEnd) {
    endDate = seriesEnd;
  }

  return {
    period: "semiAnnual",
    start: nextStart,
    end: endDate,
  };
};

export const _nextQuarterlyPeriod = (
  nextStart: DateTime,
  seriesEnd: DateTime,
): AnalyticsPeriod | null => {
  if (seriesEnd <= nextStart) {
    return null;
  }

  let endDate: DateTime;
  const nextStartUtc = nextStart.toUTC();
  const startMonth = nextStartUtc.month;

  if (startMonth < 3) {
    endDate = DateTime.utc(nextStartUtc.year, 4, 1);
  } else if (startMonth < 6) {
    endDate = DateTime.utc(nextStartUtc.year, 7, 1);
  } else if (startMonth < 9) {
    endDate = DateTime.utc(nextStartUtc.year, 10, 1);
  } else {
    endDate = DateTime.utc(nextStartUtc.year, 12, 31, 23, 59, 59, 999);
  }

  if (endDate > seriesEnd) {
    endDate = seriesEnd;
  }

  return {
    period: "quarterly",
    start: nextStart,
    end: endDate,
  };
};
export const _nextMonthlyPeriod = (
  nextStart: DateTime,
  seriesEnd: DateTime,
): AnalyticsPeriod | null => {
  if (seriesEnd <= nextStart) {
    return null;
  }

  // Get the first day of the next month
  const nextStartUtc = nextStart.toUTC();
  let endDate = DateTime.utc(
    nextStartUtc.year,
    nextStartUtc.month,
    nextStartUtc.day,
  )
    .plus({ months: 1 })
    .startOf("month");

  // If the end date is after the series end, then use the series end as the end date
  if (endDate > seriesEnd) {
    if (!nextStart.hasSame(seriesEnd, "month")) {
      endDate = seriesEnd;
    }
  }

  // Otherwise, return the end date as the first day of the next month
  return {
    period: "monthly",
    start: nextStart,
    end: endDate,
  };
};

export const _nextWeeklyPeriod = (
  nextStart: DateTime,
  seriesEnd: DateTime,
): AnalyticsPeriod | null => {
  if (seriesEnd <= nextStart) {
    return null;
  }

  // Calculate the start of the next week (Monday)
  const nextStartUtc = nextStart.toUTC();
  const nextWeekStartUTC = DateTime.utc(
    nextStartUtc.year,
    nextStartUtc.month,
    nextStartUtc.day,
  )
    .plus({ weeks: 1 })
    .startOf("week");

  // If the calculated next week start is later or equal to the series end date, return the series end
  if (nextWeekStartUTC > seriesEnd)
    if (!nextWeekStartUTC.hasSame(seriesEnd, "day")) {
      return {
        period: "weekly",
        start: nextStart,
        end: seriesEnd,
      };
    }

  return {
    period: "weekly",
    start: nextStart,
    end: nextWeekStartUTC,
  };
};

export const _nextDailyPeriod = (
  nextStart: DateTime,
  seriesEnd: DateTime,
): AnalyticsPeriod | null => {
  if (seriesEnd <= nextStart) {
    return null;
  }

  // Set the end date to the start of the next day
  const nextStartUtc = nextStart.toUTC();
  let endDate = nextStartUtc.plus({ days: 1 }).startOf("day");
  if (endDate > seriesEnd || endDate.hasSame(seriesEnd, "day")) {
    endDate = seriesEnd;
  }

  return {
    period: "daily",
    start: nextStart,
    end: endDate,
  };
};

export const _nextHourlyPeriod = (
  nextStart: DateTime,
  seriesEnd: DateTime,
): AnalyticsPeriod | null => {
  if (seriesEnd <= nextStart) {
    return null;
  }

  const startDate = nextStart.toUTC();
  let endDate = startDate.plus({ hours: 1 });

  if (endDate > seriesEnd) {
    if (nextStart.hour !== seriesEnd.hour) {
      endDate = seriesEnd.toUTC();
    }
  }

  return {
    period: "hourly",
    start: nextStart,
    end: endDate,
  };
};
