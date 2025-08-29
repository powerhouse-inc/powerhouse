import type { BrowserAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";
import type {
  AnalyticsQueryEngine,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
export type { MemoryAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";

export type { BrowserAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";
export type * from "@powerhousedao/analytics-engine-core";

export type IAnalyticsStoreOptions = BrowserAnalyticsStoreOptions;

export type IPowerhouseAnalytics = {
  store: IAnalyticsStore;
  engine: AnalyticsQueryEngine;
  options: IAnalyticsStoreOptions;
};
