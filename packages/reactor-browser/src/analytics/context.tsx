import {
  AnalyticsQueryEngine,
  type IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createContext, useContext, type PropsWithChildren } from "react";

interface AnalyticsContextValue {
  store: IAnalyticsStore;
  engine: AnalyticsQueryEngine;
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);

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
  const engine = new AnalyticsQueryEngine(store);
  const content = (
    <AnalyticsContext.Provider value={{ store, engine }}>
      {children}
    </AnalyticsContext.Provider>
  );

  if (queryClient === false) {
    return content;
  }

  return (
    <QueryClientProvider client={queryClient}>{content}</QueryClientProvider>
  );
}

export function useAnalyticsStore(): IAnalyticsStore {
  const context = useContext(AnalyticsContext);

  if (!context?.store) {
    throw new Error(
      "No analytics store available. Use within an AnalyticsProvider.",
    );
  }

  return context.store;
}

export function useAnalyticsEngine(): AnalyticsQueryEngine {
  const context = useContext(AnalyticsContext);
  if (!context?.engine) {
    throw new Error(
      "No analytics engine available. Use within an AnalyticsProvider.",
    );
  }

  return context.engine;
}
