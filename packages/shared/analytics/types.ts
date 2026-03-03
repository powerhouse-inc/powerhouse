import type { DateTime } from "luxon";
import type { AnalyticsPath } from "./analytics-path.js";
import type { AnalyticsGranularity, CompoundOperator } from "./constants.js";

export type AnalyticsSeriesQuery = {
  start: DateTime | null;
  end: DateTime | null;
  metrics: string[];
  currency?: AnalyticsPath;
  select: Record<string, AnalyticsPath[]>;
};
export type AnalyticsQuery = AnalyticsSeriesQuery & {
  granularity: AnalyticsGranularity;
  lod: Record<string, number | null>;
};
export type AnalyticsSeries<D = string | AnalyticsDimension> = {
  source: AnalyticsPath;
  start: DateTime;
  end: DateTime | null;
  metric: string;
  value: number;
  unit: string | null;
  fn: string;
  params: Record<string, unknown> | null;
  dimensions: Record<string, D>;
};
export type AnalyticsDimension = {
  path: AnalyticsPath;
  icon: string;
  label: string;
  description: string;
};
export type CompoundAnalyticsQuery = {
  start: DateTime | null;
  end: DateTime | null;
  granularity: AnalyticsGranularity;
  lod: Record<string, number | null>;
  select: Record<string, AnalyticsPath[]>;
  expression: CompoundAnalyticsExpression;
};
export type CompoundAnalyticsExpression = {
  inputs: CompoundAnalyticsInputs;
  operator: CompoundOperator;
  operand: AnalyticsOperand;
  resultCurrency?: AnalyticsPath;
};
export type CompoundAnalyticsInputs = {
  metrics: string[];
  currency?: AnalyticsPath;
};
export type AnalyticsOperand = {
  metric: string;
  currency?: AnalyticsPath;
  useSum: boolean;
};
export type MultiCurrencyConversion = {
  targetCurrency?: AnalyticsPath;
  conversions: ConversionMetric[];
};
export type ConversionMetric = {
  metric: string;
  currency?: AnalyticsPath;
};

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
