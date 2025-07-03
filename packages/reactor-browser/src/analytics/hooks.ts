import {
  AnalyticsPath,
  type AnalyticsQuery,
  type AnalyticsQueryEngine,
  type AnalyticsSeries,
  type AnalyticsSeriesInput,
  type AnalyticsSeriesQuery,
  type GroupedPeriodResults,
  type IAnalyticsStore,
} from "@powerhousedao/analytics-engine-core";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
  type UseQueryResult,
} from "@tanstack/react-query";
import { useEffect } from "react";
import {
  getAnalyticsStore,
  useAnalyticsEngineAsync,
  useAnalyticsStoreAsync,
  useAnalyticsStoreOptions,
} from "./context.js";

function useAnalyticsQueryWrapper<TQueryFnData = unknown, TData = TQueryFnData>(
  options: Omit<UseQueryOptions<TQueryFnData, Error, TData>, "queryFn"> & {
    queryFn: (analytics: {
      store: IAnalyticsStore;
      engine: AnalyticsQueryEngine;
    }) => Promise<TQueryFnData> | TQueryFnData;
  },
) {
  const { queryFn, ...queryOptions } = options;
  const { data: store } = useAnalyticsStoreAsync();
  const { data: engine } = useAnalyticsEngineAsync();
  const enabled =
    "enabled" in queryOptions ? queryOptions.enabled : !!store && !!engine;

  return useQuery({
    ...queryOptions,
    enabled,
    queryFn: async () => {
      if (!store || !engine) {
        throw new Error(
          "No analytics store available. Use within an AnalyticsProvider.",
        );
      }
      return await queryFn({ store, engine });
    },
  });
}

function useAnalyticsMutationWrapper<TVariables, TData>(
  options: Omit<UseMutationOptions<TData, Error, TVariables>, "mutationFn"> & {
    mutationFn: (
      variables: TVariables,
      context: {
        store: IAnalyticsStore;
      },
    ) => Promise<TData> | TData;
  },
) {
  const { mutationFn, ...mutationOptions } = options;
  const storeOptions = useAnalyticsStoreOptions();

  return useMutation({
    ...mutationOptions,
    mutationFn: async (value: TVariables) => {
      let store: IAnalyticsStore | null = null;
      try {
        store = await getAnalyticsStore(storeOptions);
      } catch (e) {
        console.error(e);
      }

      if (!store) {
        throw new Error(
          "No analytics store available. Use within an AnalyticsProvider.",
        );
      }
      return await mutationFn(value, { store });
    },
  });
}

export type UseAnalyticsQueryOptions<TData = GroupedPeriodResults> = Omit<
  UseQueryOptions<GroupedPeriodResults, Error, TData>,
  "queryKey" | "queryFn"
> & {
  sources?: AnalyticsPath[];
};

export type UseAnalyticsQueryResult<TData = GroupedPeriodResults> =
  UseQueryResult<TData>;

const DEBOUNCE_INTERVAL = 200;

export function useAnalyticsQuery<TData = GroupedPeriodResults>(
  query: AnalyticsQuery,
  options?: UseAnalyticsQueryOptions<TData>,
): UseAnalyticsQueryResult<TData> {
  const { data: store } = useAnalyticsStoreAsync();
  const queryClient = useQueryClient();
  const sources = options?.sources ?? [];

  const result = useAnalyticsQueryWrapper({
    queryKey: ["analytics", "query", query],
    queryFn: ({ engine }) => engine.execute(query),
    ...options,
  });

  useEffect(() => {
    if (!sources.length || !store) {
      return;
    }

    const subscriptions = new Array<() => void>();
    // Debounce invalidateQueries so it's not called too frequently
    let invalidateTimeout: ReturnType<typeof setTimeout> | null = null;
    const debouncedInvalidate = () => {
      if (invalidateTimeout) clearTimeout(invalidateTimeout);
      invalidateTimeout = setTimeout(() => {
        queryClient
          .invalidateQueries({
            queryKey: ["analytics", "query", query],
          })
          .catch((e) => {
            console.error(e);
          });
      }, DEBOUNCE_INTERVAL);
    };

    sources.forEach((path) => {
      const unsub = store.subscribeToSource(path, debouncedInvalidate);
      subscriptions.push(unsub);
    });

    // Unsubscribes from store when component unmounts or dependencies change
    return () => {
      subscriptions.forEach((unsub) => unsub());
    };
  }, [query, store, sources]);

  return result;
}

export type UseAnalyticsSeriesOptions = Omit<
  UseQueryOptions<AnalyticsSeries[], Error, AnalyticsSeries[]>,
  "queryKey" | "queryFn"
>;

export function useAnalyticsSeries(
  query: AnalyticsSeriesQuery,
  options?: UseAnalyticsSeriesOptions,
) {
  return useAnalyticsQueryWrapper({
    queryKey: ["analytics", "series", query],
    queryFn: ({ store }) => store.getMatchingSeries(query),
    ...options,
  });
}

export type UseAddSeriesValueOptions = Omit<
  UseMutationOptions<void, Error, AnalyticsSeriesInput>,
  "mutationKey" | "mutationFn"
>;

export function useAddSeriesValue(options?: UseAddSeriesValueOptions) {
  return useAnalyticsMutationWrapper({
    mutationKey: ["analytics", "addSeries"],
    mutationFn: async (value, { store }) => {
      return await store.addSeriesValue(value);
    },
    ...options,
  });
}

export type UseClearSeriesBySourceOptions = Omit<
  UseMutationOptions<
    number,
    Error,
    { source: AnalyticsPath; cleanUpDimensions?: boolean }
  >,
  "mutationKey" | "mutationFn"
>;

export function useClearSeriesBySource(
  options?: UseClearSeriesBySourceOptions,
) {
  return useAnalyticsMutationWrapper({
    mutationKey: ["analytics", "clearSeries"],
    mutationFn: async ({ source, cleanUpDimensions }, { store }) => {
      return store.clearSeriesBySource(source, cleanUpDimensions);
    },
    ...options,
  });
}

export type UseClearEmptyAnalyticsDimensionsOptions = Omit<
  UseMutationOptions<number>,
  "mutationKey" | "mutationFn"
>;

export function useClearEmptyAnalyticsDimensions(
  options?: UseClearEmptyAnalyticsDimensionsOptions,
) {
  return useAnalyticsMutationWrapper({
    mutationKey: ["analytics", "clearEmptyDimensions"],
    mutationFn: async (_, { store }) => {
      return store.clearEmptyAnalyticsDimensions();
    },
    ...options,
  });
}

export type UseAddSeriesValuesOptions = Omit<
  UseMutationOptions<void, Error, AnalyticsSeriesInput[]>,
  "mutationKey" | "mutationFn"
>;

export function useAddSeriesValues(options?: UseAddSeriesValuesOptions) {
  return useAnalyticsMutationWrapper({
    mutationKey: ["analytics", "addSeriesValues"],
    mutationFn: async (values, { store }) => {
      return store.addSeriesValues(values);
    },
    ...options,
  });
}

export type UseGetDimensionsOptions<TData> = Omit<
  UseQueryOptions<any, Error, TData>,
  "queryKey" | "queryFn"
>;

export function useGetDimensions<TData = any>(
  options?: UseGetDimensionsOptions<TData>,
) {
  return useAnalyticsQueryWrapper({
    queryKey: ["analytics", "dimensions"],
    queryFn: ({ store }) => store.getDimensions(),
    ...options,
  });
}

export type UseMatchingSeriesOptions = Omit<
  UseQueryOptions<AnalyticsSeries[], Error, AnalyticsSeries[]>,
  "queryKey" | "queryFn"
>;

export function useMatchingSeries(
  query: AnalyticsSeriesQuery,
  options?: UseMatchingSeriesOptions,
) {
  const result = useAnalyticsQueryWrapper({
    queryKey: ["analytics", "matchingSeries", query],
    queryFn: ({ store }) => store.getMatchingSeries(query),
    ...options,
  });

  return result;
}

export type UseQuerySourcesOptions = Omit<
  UseQueryOptions<AnalyticsPath[] | undefined>,
  "queryKey" | "queryFn"
>;

export function useQuerySources(
  query: AnalyticsSeriesQuery,
  options?: UseQuerySourcesOptions,
) {
  const { data: matchingSeries } = useMatchingSeries(query);

  return useQuery({
    queryKey: ["analytics", "sources", query],
    queryFn: () => {
      if (!matchingSeries?.length) {
        return [];
      }
      const uniqueSources = [
        ...new Set(matchingSeries.map((s) => s.source.toString())),
      ];
      return uniqueSources.map((source) => AnalyticsPath.fromString(source));
    },
    enabled: !!matchingSeries,
    ...options,
  });
}
