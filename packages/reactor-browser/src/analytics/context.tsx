import {
  BrowserAnalyticsStore,
  type BrowserAnalyticsStoreOptions,
} from "@powerhousedao/analytics-engine-browser";
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

export async function createOrGetAnalyticsStore(
  options?: CreateStoreOptions,
): Promise<IAnalyticsStore> {
  const globalAnalytics = getGlobal("analytics");

  if (!options || !options.databaseName) {
    if (globalAnalytics) {
      return globalAnalytics.store;
    } else {
      throw new Error(
        "Analytics store options are required if no global analytics store is available",
      );
    }
  }

  if (options.databaseName === globalAnalytics?.options.databaseName) {
    logger.warn(
      "Analytics store already initialized with the same database name. Returning existing store.",
    );
    return globalAnalytics.store;
  }

  const store = new BrowserAnalyticsStore(options);
  await store.init();
  const engine = new AnalyticsQueryEngine(store);
  setGlobal("analytics", { store, engine, options });
  return store;
}

export function useCreateOrGetAnalyticsStore(
  queryClient: QueryClient,
  options?: CreateStoreOptions,
) {
  queryClient.setQueryDefaults(analyticsOptionsKey, {
    queryFn: () => options,
    staleTime: Infinity,
    gcTime: Infinity,
  });

  queryClient.setQueryDefaults(analyticsStoreKey, {
    queryFn: () => createOrGetAnalyticsStore(options),
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

  return store.data;
}

interface BaseAnalyticsProviderProps extends PropsWithChildren {
  /**
   * Custom QueryClient instance
   * @default undefined
   */
  queryClient?: QueryClient;
}

type AnalyticsProviderProps = BaseAnalyticsProviderProps &
  (
    | {
        options?: CreateStoreOptions;
      }
    | {
        databaseName?: string;
      }
  );

export function AnalyticsProvider({
  children,
  queryClient = defaultQueryClient,
  ...props
}: AnalyticsProviderProps) {
  const options =
    "options" in props
      ? props.options
      : "databaseName" in props && props.databaseName
        ? {
            databaseName: props.databaseName,
          }
        : undefined;
  useCreateOrGetAnalyticsStore(queryClient, options);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

export function useAnalyticsEngine(): AnalyticsQueryEngine | undefined {
  const globalAnalytics = getGlobal("analytics");
  return globalAnalytics?.engine;
}
