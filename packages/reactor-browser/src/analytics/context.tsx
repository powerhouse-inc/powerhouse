import type { BrowserAnalyticsStoreOptions } from "@powerhousedao/analytics-engine-browser";
import { BrowserAnalyticsStore } from "@powerhousedao/analytics-engine-browser";
import { AnalyticsQueryEngine } from "@powerhousedao/analytics-engine-core";
import type { IAnalyticsStore } from "@powerhousedao/reactor-browser";
import { getGlobal, setGlobal } from "@powerhousedao/reactor-browser";
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
import { useEffect, useMemo } from "react";

const logger = childLogger(["reactor-browser", "analytics", "provider"]);

const defaultQueryClient = new QueryClient();

type CreateStoreOptions = BrowserAnalyticsStoreOptions;

export const analyticsOptionsKey = ["analytics", "options"] as const;
export const analyticsStoreKey = ["analytics", "store"] as const;
export const analyticsEngineKey = ["analytics", "store"] as const;

async function createAnalyticsStore(options: CreateStoreOptions) {
  const store = new BrowserAnalyticsStore(options);
  await store.init();

  const engine = new AnalyticsQueryEngine(store);
  return { store, engine, options };
}

export async function getAnalyticsStore(
  options?: CreateStoreOptions,
): Promise<IAnalyticsStore | null> {
  const globalAnalytics = getGlobal("analytics");

  if (!options || !options.databaseName) {
    if (globalAnalytics) {
      return (await globalAnalytics).store;
    } else {
      throw new Error(
        "Analytics store options are required if no global analytics store is available",
      );
    }
  }

  if (
    globalAnalytics &&
    options.databaseName === (await globalAnalytics).options.databaseName
  ) {
    return (await globalAnalytics).store;
  }

  return null;
}

export async function createOrGetAnalyticsStore(
  options?: CreateStoreOptions,
): Promise<IAnalyticsStore> {
  const globalAnalytics = await getAnalyticsStore(options);
  if (globalAnalytics) {
    return globalAnalytics;
  }

  if (!options) {
    throw new Error(
      "Analytics store options are required if no global analytics store is available",
    );
  }

  const analytics = createAnalyticsStore(options);
  setGlobal("analytics", analytics);
  analytics
    .then(({ store }) => {
      logger.verbose("Analytics store created", store);
    })
    .catch((e) => {
      logger.error("Analytics store creation failed", e);
    });
  return (await analytics).store;
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
      const store = await createOrGetAnalyticsStore(options);
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
    queryFn: () => getAnalyticsStore(options),
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
    queryFn: () => getAnalyticsStore(options),
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

function CreateAnalyticsStore(props: CreateAnalyticsStoreProps) {
  const options = useMemo(
    () =>
      "options" in props
        ? props.options
        : "databaseName" in props && props.databaseName
          ? {
              databaseName: props.databaseName,
            }
          : undefined,
    [props],
  );

  const { mutate } = useCreateAnalyticsStore(options);

  useEffect(() => {
    if (options?.databaseName) {
      mutate();
    }
  }, [options]);
  return null;
}

export function AnalyticsProvider({
  children,
  queryClient = defaultQueryClient,
  ...props
}: AnalyticsProviderProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <CreateAnalyticsStore {...props} />
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
