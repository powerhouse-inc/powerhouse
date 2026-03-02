import {
  AnalyticsGranularity,
  AnalyticsPath,
  type AnalyticsQuery,
  AnalyticsQueryEngine,
} from "@powerhousedao/analytics-engine-core";
import { DateTime } from "luxon";

export type queryFilter = {
  start?: string;
  end?: string;
  granularity?: string;
  metrics: string[];
  dimensions: [Record<string, string>];
  currency?: string;
};

type CurrencyConversion = {
  metric: string;
  sourceCurrency: string;
};

type MultiCurrencyFilter = queryFilter & {
  conversions: CurrencyConversion[];
};

export class AnalyticsModel {
  queryLogger: (query: AnalyticsQuery) => void;

  constructor(
    public readonly engine: AnalyticsQueryEngine,
    queryLogger?: (query: AnalyticsQuery) => void,
  ) {
    this.queryLogger = queryLogger || (() => {});
  }

  public async query(filter: queryFilter) {
    if (!filter) {
      return [];
    }

    const query: AnalyticsQuery = {
      start: filter.start ? DateTime.fromISO(filter.start) : null,
      end: filter.end ? DateTime.fromISO(filter.end) : null,
      granularity: getGranularity(filter.granularity),
      metrics: filter.metrics,
      currency: getCurrency(filter.currency),
      select: {},
      lod: {},
    };

    if (query.start && !query.start.isValid) {
      query.start = null;
    }

    if (query.end && !query.end.isValid) {
      query.end = null;
    }

    if (filter.dimensions.length < 1) {
      throw new Error("No dimensions provided");
    } else {
      filter.dimensions.forEach((dimension) => {
        query.select[dimension.name] = [
          AnalyticsPath.fromString(dimension.select),
        ];
        query.lod[dimension.name] = Number(dimension.lod);
      });
    }

    this.queryLogger(query);

    const results = await this.engine.execute(query);

    // convert dates again
    const convertedResults = results.map((r) => ({
      ...r,
      start: r.start.toJSDate(),
      end: r.end.toJSDate(),
    }));

    return convertedResults;

    // TODO: pull caching interface out into analytics module
    //return measureAnalyticsQueryPerformance('analyticsQuery', 'analyticsQuery', query, false, "high");
  }

  public async multiCurrencyQuery(filter: MultiCurrencyFilter) {
    if (!filter) {
      return [];
    }

    const query: AnalyticsQuery = {
      start: filter.start ? DateTime.fromISO(filter.start) : null,
      end: filter.end ? DateTime.fromISO(filter.end) : null,
      granularity: getGranularity(filter.granularity),
      metrics: filter.metrics,
      currency: getCurrency(filter.currency),
      select: {},
      lod: {},
    };

    if (query.start && !query.start.isValid) {
      query.start = null;
    }

    if (query.end && !query.end.isValid) {
      query.end = null;
    }

    if (filter.dimensions.length < 1) {
      throw new Error("No dimensions provided");
    } else {
      filter.dimensions.forEach((dimension) => {
        query.select[dimension.name] = [
          AnalyticsPath.fromString(dimension.select),
        ];
        query.lod[dimension.name] = Number(dimension.lod);
      });
    }

    this.queryLogger(query);

    return this.engine.executeMultiCurrency(query, {
      targetCurrency: query.currency,
      conversions: filter.conversions.map((c) => {
        return {
          metric: c.metric,
          currency: getCurrency(c.sourceCurrency),
        };
      }),
    });
  }

  public async getDimensions() {
    return await this.engine.getDimensions();
  }

  public async getCurrencies() {
    // todo: use knex inside of the analytics engine to select distinct currencies
    return ["DAI", "FTE", "MKR", "USDC", "USDP", "USDT"];
  }
}

const getGranularity = (
  granularity: string | undefined,
): AnalyticsGranularity => {
  switch (granularity) {
    case "hourly": {
      return AnalyticsGranularity.Hourly;
    }
    case "daily": {
      return AnalyticsGranularity.Daily;
    }
    case "weekly": {
      return AnalyticsGranularity.Weekly;
    }
    case "monthly": {
      return AnalyticsGranularity.Monthly;
    }
    case "quarterly": {
      return AnalyticsGranularity.Quarterly;
    }
    case "semiAnnual": {
      return AnalyticsGranularity.SemiAnnual;
    }
    case "annual": {
      return AnalyticsGranularity.Annual;
    }
    case "total": {
      return AnalyticsGranularity.Total;
    }
    default: {
      return AnalyticsGranularity.Total;
    }
  }
};

const getCurrency = (currency: string | undefined) => {
  return currency ? AnalyticsPath.fromString(currency) : undefined;
};
