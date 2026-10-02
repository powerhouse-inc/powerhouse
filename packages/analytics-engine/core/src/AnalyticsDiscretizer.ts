/* eslint-disable @typescript-eslint/no-redundant-type-constituents */
/* eslint-disable no-case-declarations */
import { DateTime, Interval } from "luxon";
import type { AnalyticsGranularity } from "./AnalyticsQuery.js";
import {
  type AnalyticsDimension,
  type AnalyticsSeries,
} from "./AnalyticsQuery.js";
import {
  type AnalyticsPeriod,
  type AnalyticsRange,
  getPeriodSeriesArray,
} from "./AnalyticsTimeSlicer.js";

export const getQuarter = (date: DateTime) => {
  return Math.floor((date.month - 1) / 3) + 1;
};

export type GroupedPeriodResult = {
  period: string;
  start: DateTime;
  end: DateTime;
  rows: Array<{
    dimensions: Record<string, AnalyticsDimension>;
    metric: string;
    unit: string | null;
    value: number;

    /**
     * The sum of all metric values over this period?
     */
    sum: number;
  }>;
};

export type GroupedPeriodResults = Array<GroupedPeriodResult>;

export class AnalyticsDiscretizer {
  public static discretize(
    series: AnalyticsSeries<string>[],
    dimensions: string[],
    start: DateTime | null,
    end: DateTime | null,
    granularity: AnalyticsGranularity,
  ): GroupedPeriodResults {
    const index = this._buildIndex(series, dimensions);
    const periods = getPeriodSeriesArray(
      this._calculateRange(start, end, granularity, series),
    );
    const disretizedResults = this._discretizeNode(
      index,
      {},
      dimensions,
      periods,
    );
    const groupedResults = this._groupResultsByPeriod(
      periods,
      disretizedResults,
    );

    return groupedResults;
  }

  private static _calculateRange(
    start: DateTime | null,
    end: DateTime | null,
    granularity: AnalyticsGranularity,
    results: AnalyticsSeries<any>[],
  ) {
    let calculatedStart: DateTime | null = start || null;
    let calculatedEnd: DateTime | null = end || null;

    if (calculatedStart == null || calculatedEnd == null) {
      for (const r of results) {
        if (calculatedStart == null) {
          calculatedStart = r.start;
        }

        const endValue = r.end || r.start;
        if (calculatedEnd == null || calculatedEnd < endValue) {
          calculatedEnd = endValue;
        }
      }
    }

    if (calculatedStart == null || calculatedEnd == null) {
      throw new Error("Cannot determine query start and/or end.");
    }

    return {
      start: calculatedStart,
      end: calculatedEnd,
      granularity,
    } as AnalyticsRange;
  }

  public static _groupResultsByPeriod(
    periods: AnalyticsPeriod[],
    dimensionedResults: DimensionedSeries[],
  ): GroupedPeriodResults {
    const result: Record<string, GroupedPeriodResult> = {};

    for (const p of periods) {
      const id = p.start.toISO() + "-" + p.period;
      const period = AnalyticsDiscretizer._getPeriodString(p);
      result[id] = {
        period: period,
        start: p.start,
        end: p.end,
        rows: [],
      };
    }

    for (const r of dimensionedResults) {
      for (const period of Object.keys(r.series)) {
        result[period].rows.push({
          dimensions: r.dimensions,
          metric: r.metric,
          unit: r.unit == "__NULL__" ? null : r.unit,
          value: r.series[period].inc,
          sum: r.series[period].sum,
        });
      }
    }

    return Object.values(result);
  }

  static _getPeriodString(p: AnalyticsPeriod) {
    // Period boundaries are anchored to the UTC calendar (see
    // AnalyticsTimeSlicer), so labels are derived from the UTC view of the
    // period start, never from a zoned start's local calendar fields.
    const startUtc = p.start.toUTC();
    switch (p.period) {
      case "annual":
        return startUtc.year.toString();
      case "semiAnnual":
        return `${startUtc.year}/${startUtc.month < 7 ? "H1" : "H2"}`;
      case "quarterly":
        return `${startUtc.year}/Q${getQuarter(startUtc)}`;
      case "monthly":
        const month = startUtc.month;
        const formattedMonth = month < 10 ? `0${month}` : `${month}`;
        return `${startUtc.year}/${formattedMonth}`;
      case "weekly":
        return `${startUtc.weekYear}/W${startUtc.weekNumber}`;
      case "daily":
        const monthD = startUtc.month;
        const day = startUtc.day;
        const formattedMonthD = monthD < 10 ? `0${monthD}` : `${monthD}`;
        const formattedDay = day < 10 ? `0${day}` : `${day}`;
        return `${startUtc.year}/${formattedMonthD}/${formattedDay}`;
      case "hourly":
        const monthH = startUtc.month;
        const dayH = startUtc.day;
        const hourH = startUtc.hour;
        const formattedMonthH = monthH < 10 ? `0${monthH}` : `${monthH}`;
        const formattedDayH = dayH < 10 ? `0${dayH}` : `${dayH}`;
        const formattedHourH = hourH < 10 ? `0${hourH}` : `${hourH}`;
        return `${startUtc.year}/${formattedMonthH}/${formattedDayH}/${formattedHourH}`;
      default:
        return p.period;
    }
  }

  public static _discretizeNode(
    node: DiscretizerIndexNode,
    dimensionValues: Record<string, string>,
    remainingDimensions: string[],
    periods: AnalyticsPeriod[],
  ): DimensionedSeries[] {
    const result: DimensionedSeries[] = [];

    if (remainingDimensions.length > 0) {
      const subdimension = remainingDimensions[0] as string;
      Object.keys(node).forEach((subdimensionValue, _index, _arr) => {
        const newDimensionValues = { ...dimensionValues };
        newDimensionValues[subdimension] = subdimensionValue;
        result.push(
          ...this._discretizeNode(
            node[subdimensionValue] as DiscretizerIndexNode,
            newDimensionValues,
            remainingDimensions.slice(1),
            periods,
          ),
        );
      });
    } else {
      Object.keys(node).forEach((metric) => {
        result.push(
          ...this._discretizeLeaf(
            node[metric] as DiscretizerIndexLeaf,
            periods,
            metric,
            dimensionValues,
          ),
        );
      });
    }

    return result;
  }

  public static _discretizeLeaf(
    leaf: DiscretizerIndexLeaf,
    periods: AnalyticsPeriod[],
    metric: string,
    dimensionValues: Record<string, string>,
  ): DimensionedSeries[] {
    const result: DimensionedSeries[] = [];
    Object.keys(leaf).forEach((unit) => {
      const metaDimensions: any = {};
      Object.keys(dimensionValues).forEach((k) => {
        metaDimensions[k] = {
          path: leaf[unit][0].dimensions[k],
          icon: leaf[unit][0].dimensions.icon,
          label: leaf[unit][0].dimensions.label,
          description: leaf[unit][0].dimensions.description,
        };
      });
      result.push({
        unit,
        metric,
        dimensions: metaDimensions as any,
        series: this._discretizeSeries(leaf[unit], periods),
      });
    });

    return result;
  }

  public static _discretizeSeries(
    series: AnalyticsSeries<string>[],
    periods: AnalyticsPeriod[],
  ): Series {
    const result: Series = {};

    // An empty range (start equal to end) produces no periods; there is
    // nothing to attribute values to.
    if (periods.length === 0) {
      return result;
    }

    for (const s of series) {
      let oldSum = this._getValue(s, periods[0].start);
      for (const p of periods) {
        // Periods are half-open [start, end): the cumulative value "as of"
        // a boundary excludes values stamped exactly on it, so a value at
        // an exact period start is attributed to the period that starts
        // there, not the one that ends there.
        const newSum = this._getValue(s, p.end);
        const id = `${p.start.toISO()}-${p.period}`;

        // const id = p.period;
        if (result[id]) {
          result[id].inc += newSum - oldSum;
          result[id].sum += newSum;
        } else {
          result[id] = {
            inc: newSum - oldSum,
            sum: newSum,
          };
        }

        oldSum = newSum;
      }
    }

    return result;
  }

  public static _getValue(
    series: AnalyticsSeries<string>,
    when: DateTime,
  ): number {
    switch (series.fn) {
      case "Single":
        return this._getSingleValue(series, when);
      case "DssVest":
        return this._getVestValue(series, when);
      default:
        // todo: logging interface
        //console.error(`Unknown analytics series function: '${series.fn}'`);
        return 0.0;
    }
  }

  public static _getSingleValue(
    series: AnalyticsSeries<string>,
    when: DateTime,
  ): number {
    // Strictly greater than: the cumulative value at instant t covers values
    // stamped before t only. Periods are half-open [start, end), so a value
    // stamped exactly at a boundary belongs to the period that starts there.
    return when > series.start ? series.value : 0.0;
  }

  public static _getVestValue(
    series: AnalyticsSeries<string>,
    when: DateTime,
  ): number {
    const now = when;
    const start = series.start;
    const end = series.end;

    const cliff = series.params?.cliff
      ? DateTime.fromISO(series.params.cliff! as string, { zone: "utc" })
      : null;
    if (now < start || (cliff && now < cliff)) {
      return 0.0;
    } else if (end && now >= end) {
      return series.value;
    }

    const a = Interval.fromDateTimes(start, now);
    const b = Interval.fromDateTimes(start, end || now);

    return (a.length() / b.length()) * series.value;
  }

  public static _buildIndex(
    series: AnalyticsSeries<string>[],
    dimensions: string[],
  ): DiscretizerIndexNode {
    const result: DiscretizerIndexNode | any = {};
    const map: DiscretizerIndexLeaf = {};
    const dimName = dimensions[0] || "";

    for (const s of series) {
      const dimValue = s.dimensions[dimName];
      if (undefined === map[dimValue]) {
        map[dimValue] = [];
      }
      map[dimValue].push(s);
    }

    if (dimensions.length > 1) {
      const newDimensions = dimensions.slice(1);
      Object.keys(map).forEach((k) => {
        result[k] = this._buildIndex(map[k], newDimensions);
      });
    } else {
      Object.keys(map).forEach((k) => {
        result[k] = this._buildMetricsIndex(map[k]);
      });
    }

    return result;
  }

  public static _buildMetricsIndex(
    series: AnalyticsSeries<string>[],
  ): DiscretizerIndexNode {
    const result: DiscretizerIndexNode = {};

    const map: DiscretizerIndexLeaf = {};
    for (const s of series) {
      const metric = s.metric;
      if (undefined === map[metric]) {
        map[metric] = [];
      }

      map[metric].push(s);
    }

    Object.keys(map).forEach((k) => (result[k] = this._buildUnitIndex(map[k])));
    return result;
  }

  public static _buildUnitIndex(
    series: AnalyticsSeries<string>[],
  ): DiscretizerIndexLeaf {
    const result: DiscretizerIndexLeaf = {};

    for (const s of series) {
      const unit = s.unit || "__NULL__";
      if (undefined === result[unit]) {
        result[unit] = [];
      }

      result[unit].push(s);
    }

    return result;
  }
}

type DiscretizerIndexLeaf = { [k: string]: AnalyticsSeries<string>[] };
type DiscretizerIndexNode = {
  [k: string]: DiscretizerIndexNode | DiscretizerIndexLeaf;
};
type Series = Record<
  string,
  {
    /**
     * How much the metric increased from the beginning of the series to the end of the specified period.
     */
    inc: number;

    /**
     * The sum of all metric values from the beginning of the series to the end of the specified period.
     */
    sum: number;
  }
>;
type DimensionedSeries = {
  unit: string;
  metric: string;
  dimensions: Record<string, AnalyticsDimension>;
  series: Series;
};
