import { DateTime } from "luxon";
import { AnalyticsPath } from "./AnalyticsPath.js";
import type {
  AnalyticsSeries,
  AnalyticsSeriesQuery,
} from "./AnalyticsQuery.js";

export type AnalyticsSeriesInput = {
  start: DateTime;
  end?: DateTime | null;
  source: AnalyticsPath;
  metric: string;
  value: number;
  unit?: string | null;
  fn?: string | null;
  params?: Record<string, any> | null;
  dimensions: Record<string, AnalyticsPath>;
  dimensionMetadata?: Record<string, string>;
};

export type AnalyticsUpdateCallback = (source: AnalyticsPath) => void;

export interface IAnalyticsStore {
  clearSeriesBySource: (
    source: AnalyticsPath,
    cleanUpDimensions?: boolean,
  ) => Promise<number>;
  clearEmptyAnalyticsDimensions: () => Promise<number>;
  getMatchingSeries: (
    query: AnalyticsSeriesQuery,
  ) => Promise<AnalyticsSeries[]>;
  addSeriesValue: (input: AnalyticsSeriesInput) => Promise<void>;
  addSeriesValues: (inputs: AnalyticsSeriesInput[]) => Promise<void>;
  getDimensions: () => Promise<any>;

  subscribeToSource: (
    source: AnalyticsPath,
    callback: AnalyticsUpdateCallback,
  ) => () => void;
}
