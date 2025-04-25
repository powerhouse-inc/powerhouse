import { type BrowserAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { childLogger } from "document-drive";
import { type PropsWithChildren } from "react";
import { getGlobal, setGlobal } from "../global/core.js";
import { type IAnalyticsStore } from "./types.js";

const logger = childLogger(["reactor-browser", "analytics", "provider"]);

const defaultQueryClient = new QueryClient();

type CreateStoreOptions = BrowserAnalyticsStoreOptions;

export const analyticsOptionsKey = ["analytics", "options"] as const;
export const analyticsStoreKey = ["analytics", "store"] as const;
export const analyticsEngineKey = ["analytics", "store"] as const;

export async function createAnalyticsStore({
  databaseName,
}: CreateStoreOptions): Promise<IAnalyticsStore> {
  const globalAnalytics = getGlobal("analytics");
  if (databaseName === globalAnalytics?.options.databaseName) {
    logger.warn(
      "Analytics store already initialized with the same database name. Returning existing store.",
    );
    return globalAnalytics.store;
  }

  const { BrowserAnalyticsStore } = await import("./store/browser.js");
  const store = new BrowserAnalyticsStore({ databaseName });
  await store.init();
  const engine = new AnalyticsQueryEngine(store);
  setGlobal("analytics", { store, engine, options: { databaseName } });
  return store;
}

export function useCreateAnalyticsStore(
  queryClient: QueryClient,
  options: CreateStoreOptions,
) {
  queryClient.setQueryDefaults(analyticsOptionsKey, {
    queryFn: () => options,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  queryClient.setQueryDefaults(analyticsStoreKey, {
    queryFn: () => createAnalyticsStore(options),
    staleTime: Infinity,
    gcTime: Infinity,
  });
}

export function useAnalyticsStoreOptions() {
  return useQuery<CreateStoreOptions>({
    queryKey: analyticsOptionsKey,
  });
}

export function useAnalyticsStore() {
  const { data: storeOptions } = useAnalyticsStoreOptions();

  const store = useQuery<IAnalyticsStore>({
    queryKey: analyticsStoreKey,
    enabled: !!storeOptions,
    retry: false,
  });

  // useEffect(() => {
  //   if (storeOptions) {
  //     store.refetch().catch(logger.error);
  //   }
  // }, [storeOptions]);

  return store.data;
}

interface AnalyticsProviderProps extends PropsWithChildren {
  databaseName: string;
  /**
   * Custom QueryClient instance
   * @default undefined
   */
  queryClient?: QueryClient;
}

export function AnalyticsProvider({
  children,
  databaseName,
  queryClient = defaultQueryClient,
}: AnalyticsProviderProps) {
  useCreateAnalyticsStore(queryClient, { databaseName });

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export function useAnalyticsEngine(): AnalyticsQueryEngine | undefined {
  const globalAnalytics = getGlobal("analytics");
  return globalAnalytics?.engine;
}
