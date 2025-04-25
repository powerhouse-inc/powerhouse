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
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import {
  analyticsStoreKey,
  useAnalyticsEngine,
  useAnalyticsStore,
} from "./context.js";

function useAnalyticsQueryWrapper<TData>(
  options: Omit<UseQueryOptions<TData, Error, TData>, "queryFn"> & {
    queryFn: (analytics: {
      store: IAnalyticsStore;
      engine: AnalyticsQueryEngine;
    }) => Promise<TData> | TData;
  },
) {
  const { queryFn, ...queryOptions } = options;
  const store = useAnalyticsStore();
  const engine = useAnalyticsEngine();

  return useQuery({
    ...queryOptions,
    queryFn: () => {
      if (!store || !engine) {
        throw new Error(
          "No analytics store available. Use within an AnalyticsProvider.",
        );
      }
      return queryFn({ store, engine });
    },
  });
}

type UseAnalyticsQueryOptions = Omit<
  UseQueryOptions<GroupedPeriodResults>,
  "queryKey" | "queryFn"
>;

export function useAnalyticsQuery(
  query: AnalyticsQuery,
  options?: UseAnalyticsQueryOptions,
) {
  const store = useAnalyticsStore();
  const { data: querySources } = useQuerySources(query);
  const queryClient = useQueryClient();
  const subscriptions = useRef<Array<() => void>>([]);

  const result = useAnalyticsQueryWrapper({
    queryKey: ["analytics", "query", query],
    queryFn: ({ engine }) => engine.execute(query),
    ...options,
  });

  useEffect(() => {
    if (!querySources?.length || !store) {
      return;
    }

    querySources.forEach((source) => {
      const unsub = store.subscribeToSource(source, () => {
        return queryClient.invalidateQueries({
          queryKey: ["analytics", "query", query],
        });
      });
      subscriptions.current.push(unsub);
    });

    // Unsubscribes from store when component unmounts or dependencies change
    return () => {
      subscriptions.current.forEach((unsub) => unsub());
      subscriptions.current = [];
    };
  }, [querySources]);

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
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["analytics", "addSeries"],
    mutationFn: async (value: AnalyticsSeriesInput) => {
      try {
        const store = await queryClient.ensureQueryData<IAnalyticsStore>({
          queryKey: analyticsStoreKey,
          staleTime: Infinity,
        });

        return await store.addSeriesValue(value);
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Missing queryFn")
        ) {
          throw new Error(
            "No analytics store available. Use within an AnalyticsProvider.",
          );
        }
        throw error;
      }
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
  const store = useAnalyticsStore();

  return useMutation({
    mutationKey: ["analytics", "clearSeries"],
    mutationFn: ({ source, cleanUpDimensions }) => {
      if (!store) {
        throw new Error(
          "No analytics store available. Use within an AnalyticsProvider.",
        );
      }
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
  const store = useAnalyticsStore();

  return useMutation({
    mutationKey: ["analytics", "clearEmptyDimensions"],
    mutationFn: () => {
      if (!store) {
        throw new Error(
          "No analytics store available. Use within an AnalyticsProvider.",
        );
      }
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
  const queryClient = useQueryClient();

  return useMutation({
    mutationKey: ["analytics", "addSeriesValues"],
    mutationFn: async (values: AnalyticsSeriesInput[]) => {
      const store = await queryClient.ensureQueryData<IAnalyticsStore>({
        queryKey: analyticsStoreKey,
        staleTime: Infinity,
      });

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
