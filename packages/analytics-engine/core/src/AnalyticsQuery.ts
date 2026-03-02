import { DateTime } from "luxon";
import { AnalyticsPath } from "./AnalyticsPath.js";

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
  params: Record<string, any> | null;
  dimensions: Record<string, D>;
};

export type AnalyticsDimension = {
  path: AnalyticsPath;
  icon: string;
  label: string;
  description: string;
};

export enum AnalyticsMetric {
  Budget,
  Forecast,
  Actuals,
  PaymentsOnChain,
  PaymentsOffChainIncluded,
  FTEs,
}

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

export enum CompoundOperator {
  VectorAdd,
  VectorSubtract,
  ScalarMultiply,
  ScalarDivide,
}

export type MultiCurrencyConversion = {
  targetCurrency?: AnalyticsPath;
  conversions: ConversionMetric[];
};

export type ConversionMetric = {
  metric: string;
  currency?: AnalyticsPath;
};

export enum AnalyticsGranularity {
  Total,
  Annual,
  SemiAnnual,
  Quarterly,
  Monthly,
  Weekly,
  Daily,
  Hourly,
}
