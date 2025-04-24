import type {
  AnalyticsQueryEngine,
  IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";

export interface PowerhouseGlobal {
  analytics?: {
    store: IAnalyticsStore;
    engine: AnalyticsQueryEngine;
  };
  // Add other global namespaces here
}

declare global {
  interface Window {
    powerhouse?: PowerhouseGlobal;
  }
}
