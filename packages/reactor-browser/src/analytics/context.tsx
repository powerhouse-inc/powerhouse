import {
  AnalyticsQueryEngine,
  type IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, type PropsWithChildren } from "react";
import { clearGlobal, getGlobal, setGlobal } from "../global/core.js";

const defaultQueryClient = new QueryClient();

interface AnalyticsProviderProps extends PropsWithChildren {
  store: IAnalyticsStore;
  /**
   * Custom QueryClient instance. If not provided, a default one will be used.
   * Set to false to disable QueryClientProvider wrapping.
   */
  queryClient?: QueryClient | false;
}

export function AnalyticsProvider({
  children,
  store,
  queryClient = defaultQueryClient,
}: AnalyticsProviderProps) {
  useEffect(() => {
    // Only initialize if not already initialized
    const globalAnalytics = getGlobal("analytics");
    if (!globalAnalytics) {
      const engine = new AnalyticsQueryEngine(store);
      setGlobal("analytics", { store, engine });
      return () => clearGlobal("analytics");
    }
  }, []);

  if (queryClient === false) {
    return children;
  }

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export function useAnalyticsStore(): IAnalyticsStore | undefined {
  const globalAnalytics = getGlobal("analytics");

  if (!globalAnalytics?.store) {
    console.warn(
      "No analytics store available. Use within an AnalyticsProvider.",
    );
  }

  return globalAnalytics?.store;
}

export function useAnalyticsEngine(): AnalyticsQueryEngine | undefined {
  const globalAnalytics = getGlobal("analytics");

  if (!globalAnalytics?.engine) {
    console.warn(
      "No analytics engine available. Use within an AnalyticsProvider.",
    );
  }

  return globalAnalytics?.engine;
}
