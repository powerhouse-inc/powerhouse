import {
  type AnalyticsDimension,
  type AnalyticsPath,
  type AnalyticsQuery,
  type AnalyticsSeries,
  type AnalyticsSeriesInput,
  type AnalyticsSeriesQuery,
  type GroupedPeriodResults,
} from "@powerhousedao/analytics-engine-core";
import {
  useMutation,
  useQuery,
  type UseMutationOptions,
  type UseQueryOptions,
} from "@tanstack/react-query";
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

  return useQuery({
    queryKey: ["analytics", "query", query],
    queryFn: () => engine.execute(query),
    ...options,
  });
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
