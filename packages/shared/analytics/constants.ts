export enum AnalyticsSerializerTypes {
  AnalyticsPath,
  AnalyticsPathSegment,
  AnalyticsPeriod,
}

export enum AnalyticsPeriodType {
  Year,
  Quarter,
  Month,
}

export enum AnalyticsMetric {
  Budget,
  Forecast,
  Actuals,
  PaymentsOnChain,
  PaymentsOffChainIncluded,
  FTEs,
}
export enum CompoundOperator {
  VectorAdd,
  VectorSubtract,
  ScalarMultiply,
  ScalarDivide,
}
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
