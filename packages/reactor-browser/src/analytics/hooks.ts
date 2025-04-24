import {
  AnalyticsPath,
  type AnalyticsDimension,
  type AnalyticsQuery,
  type AnalyticsSeries,
  type AnalyticsSeriesInput,
  type AnalyticsSeriesQuery,
  type GroupedPeriodResults,
} from "@powerhousedao/analytics-engine-core";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useAnalyticsEngine, useAnalyticsStore } from "./context.js";

type UseAnalyticsQueryOptions = Omit<
  UseQueryOptions<GroupedPeriodResults>,
  "queryKey" | "queryFn"
>;

export function useAnalyticsQuery(
  query: AnalyticsQuery,
  options?: UseAnalyticsQueryOptions,
) {
  const engine = useAnalyticsEngine();
  const store = useAnalyticsStore();
  const { data: querySources } = useQuerySources(query);
  const queryClient = useQueryClient();
  const subscriptions = useRef<Array<() => void>>([]);

  const result = useQuery({
    queryKey: ["analytics", "query", query],
    queryFn: () => engine.execute(query),
    ...options,
  });

  useEffect(() => {
    if (!querySources?.length) {
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

export type UseAnalyticsSeriesOptions<Dimension = string | AnalyticsDimension> =
  Omit<
    UseQueryOptions<AnalyticsSeries[], Error, AnalyticsSeries<Dimension>[]>,
    "queryKey" | "queryFn"
  >;

export function useAnalyticsSeries<Dimension = string | AnalyticsDimension>(
  query: AnalyticsSeriesQuery,
  options?: UseAnalyticsSeriesOptions<Dimension>,
) {
  const store = useAnalyticsStore();

  return useQuery({
    queryKey: ["analytics", "series", query],
    queryFn: () => store.getMatchingSeries(query),
    ...options,
  });
}

export type UseAddSeriesValueOptions = Omit<
  UseMutationOptions<void, Error, AnalyticsSeriesInput>,
  "mutationKey" | "mutationFn"
>;

export function useAddSeriesValue(options?: UseAddSeriesValueOptions) {
  const store = useAnalyticsStore();

  return useMutation({
    mutationKey: ["analytics", "addSeries"],
    mutationFn: (value: AnalyticsSeriesInput) => store.addSeriesValue(value),
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
    mutationFn: ({ source, cleanUpDimensions }) =>
      store.clearSeriesBySource(source, cleanUpDimensions),
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
    mutationFn: () => store.clearEmptyAnalyticsDimensions(),
    ...options,
  });
}

export type UseAddSeriesValuesOptions = Omit<
  UseMutationOptions<void, Error, AnalyticsSeriesInput[]>,
  "mutationKey" | "mutationFn"
>;

export function useAddSeriesValues(options?: UseAddSeriesValuesOptions) {
  const store = useAnalyticsStore();

  return useMutation({
    mutationKey: ["analytics", "addSeriesValues"],
    mutationFn: (values: AnalyticsSeriesInput[]) =>
      store.addSeriesValues(values),
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
  const store = useAnalyticsStore();

  return useQuery({
    queryKey: ["analytics", "dimensions"],
    queryFn: () => store.getDimensions(),
    ...options,
  });
}

export type UseMatchingSeriesOptions<Dimension = string | AnalyticsDimension> =
  Omit<
    UseQueryOptions<AnalyticsSeries[], Error, AnalyticsSeries<Dimension>[]>,
    "queryKey" | "queryFn"
  >;

export function useMatchingSeries<Dimension = string | AnalyticsDimension>(
  query: AnalyticsSeriesQuery,
  options?: UseMatchingSeriesOptions<Dimension>,
) {
  const store = useAnalyticsStore();

  const result = useQuery({
    queryKey: ["analytics", "matchingSeries", query],
    queryFn: () => store.getMatchingSeries(query),

    ...options,
  });

  return result;
}

// Add this type near other type definitions
export type UseQuerySourcesOptions = Omit<
  UseQueryOptions<AnalyticsPath[]>,
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
