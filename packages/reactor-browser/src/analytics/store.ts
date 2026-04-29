import type { BrowserAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";
import { BrowserAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import { getGlobal } from "../global/core.js";

export type CreateStoreOptions = BrowserAnalyticsStoreOptions;

export async function createAnalyticsStore(options: CreateStoreOptions) {
  const store = new BrowserAnalyticsStore(options);
  await store.init();

  const engine = new AnalyticsQueryEngine(store);
  return {
    store,
    engine,
    options,
  };
}

export async function getAnalyticsStore(): Promise<IAnalyticsStore | null> {
  const globalAnalytics = await getGlobal("analytics");

  return globalAnalytics?.store ?? null;
}
