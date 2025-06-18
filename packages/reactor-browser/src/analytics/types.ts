import { type BrowserAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";
import {
  type AnalyticsQueryEngine,
  type IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";

export type * from "@powerhousedao/analytics-engine-core";

export type IAnalyticsStoreOptions = BrowserAnalyticsStoreOptions;

export type IPowerhouseAnalytics = {
  store: IAnalyticsStore;
  engine: AnalyticsQueryEngine;
  options: IAnalyticsStoreOptions;
};
