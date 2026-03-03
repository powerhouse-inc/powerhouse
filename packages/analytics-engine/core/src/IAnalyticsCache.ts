import type { GroupedPeriodResults } from "./AnalyticsDiscretizer.js";
import type { AnalyticsQuery } from "./AnalyticsQuery.js";

export interface IAnalyticsCache {
  get(query: AnalyticsQuery): Promise<GroupedPeriodResults | null>;
  set(query: AnalyticsQuery, expirySecs?: number): void;
}
