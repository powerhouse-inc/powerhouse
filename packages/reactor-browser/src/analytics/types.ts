import type {
  AnalyticsQueryEngine,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import type { BrowserAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";
export type IAnalyticsStoreOptions = BrowserAnalyticsStoreOptions;

export type IPowerhouseAnalytics = {
  store: IAnalyticsStore;
  engine: AnalyticsQueryEngine;
  options: IAnalyticsStoreOptions;
};
