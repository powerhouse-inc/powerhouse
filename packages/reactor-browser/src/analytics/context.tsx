import type { BrowserAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";
import { BrowserAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { childLogger } from "document-drive";
import type { PropsWithChildren } from "react";
import { useEffect } from "react";
import { getGlobal } from "../global/core.js";

const logger = childLogger(["reactor-browser", "analytics", "provider"]);

const defaultQueryClient = new QueryClient();

type CreateStoreOptions = BrowserAnalyticsStoreOptions;

export const analyticsOptionsKey = ["analytics", "options"] as const;
export const analyticsStoreKey = ["analytics", "store"] as const;
export const analyticsEngineKey = ["analytics", "store"] as const;

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

type CreateAnalyticsStoreProps =
  | {
      options?: CreateStoreOptions;
    }
  | {
      databaseName?: string;
    };

type AnalyticsProviderProps = BaseAnalyticsProviderProps &
  CreateAnalyticsStoreProps;

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
  ...props
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
