import type { AnalyticsPath } from "./AnalyticsPath.js";
import type { AnalyticsPeriod } from "./AnalyticsPeriod.js";

export type AnalyticsQueryResultRow = {
  period: AnalyticsPeriod;
  dimensions: Record<string, AnalyticsPath>;
  currency: string;
  value: number;
};

export type AnalyticsQueryResult = Array<AnalyticsQueryResultRow>;
