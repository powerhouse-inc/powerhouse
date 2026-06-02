import type { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { childLogger } from "document-model";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { getGlobal } from "../global/core.js";
import type { CreateStoreOptions } from "./store.js";
import { getAnalyticsStore } from "./store.js";

const _logger = childLogger(["reactor-browser", "analytics", "provider"]);

const defaultQueryClient = new QueryClient();

export const analyticsOptionsKey = ["analytics", "options"] as const;
export const analyticsStoreKey = ["analytics", "store"] as const;
export const analyticsEngineKey = ["analytics", "engine"] as const;

export function useAnalyticsStoreOptions() {
  return useQuery<CreateStoreOptions | undefined>({
    queryKey: analyticsOptionsKey,
  }).data;
}

export function useCreateAnalyticsStore(options?: CreateStoreOptions) {
  const queryClient = useQueryClient();
  useEffect(() => {
    queryClient.setQueryDefaults(analyticsOptionsKey, {
      queryFn: () => options,
      staleTime: Infinity,
      gcTime: Infinity,
    });
  }, [queryClient, options]);

  return useMutation({
    mutationFn: async () => {
      const store = getAnalyticsStore();
      queryClient.setQueryDefaults(analyticsStoreKey, {
        queryFn: () => store,
        staleTime: Infinity,
        gcTime: Infinity,
      });
      return store;
    },
  });
}

export function useAnalyticsStoreQuery(options?: CreateStoreOptions) {
  return useSuspenseQuery({
    queryKey: [analyticsStoreKey, options],
    queryFn: () => getAnalyticsStore(),
    retry: true,
  });
}

export function useAnalyticsStore(options?: CreateStoreOptions) {
  const store = useAnalyticsStoreQuery(options);
  return store.data;
}

export function useAnalyticsStoreAsync(options?: CreateStoreOptions) {
  return useQuery({
    queryKey: [analyticsStoreKey, options],
    queryFn: () => getAnalyticsStore(),
    retry: true,
    throwOnError: false,
  });
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

function CreateAnalyticsStore() {
  const { mutate } = useCreateAnalyticsStore();

  useEffect(() => {
    mutate();
  }, []);

  return null;
}

export function AnalyticsProvider({
  children,
  queryClient = defaultQueryClient,
  ..._props
}: AnalyticsProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <CreateAnalyticsStore />
      {children}
    </QueryClientProvider>
  );
}

export function useAnalyticsEngine(): AnalyticsQueryEngine | undefined {
  return useSuspenseQuery({
    queryKey: analyticsEngineKey,
    queryFn: async () => {
      const globalAnalytics = getGlobal("analytics");
      if (!globalAnalytics) {
        throw new Error("No analytics store available");
      }
      return (await globalAnalytics).engine;
    },
    retry: false,
  }).data;
}

export function useAnalyticsEngineAsync() {
  return useQuery({
    queryKey: analyticsEngineKey,
    queryFn: async () => {
      const globalAnalytics = getGlobal("analytics");
      if (!globalAnalytics) {
        throw new Error("No analytics store available");
      }
      return (await globalAnalytics).engine;
    },
    retry: false,
  });
}
