# Analytics for Reactor Browser

The analytics module provides React hooks and context providers for managing analytics data in browser applications. It leverages React Query for efficient data management and caching.

## Setup

To use analytics in your application, wrap your components with the `AnalyticsProvider`:

```tsx
import { AnalyticsProvider } from "@powerhousedao/reactor-browser";

function App() {
  return (
    <AnalyticsProvider databaseName="my-app:analytics">
      {/* Your app components */}
    </AnalyticsProvider>
  );
}
```

The provider accepts the following props:

- `databaseName`: Required. A unique name for the analytics database
- `queryClient`: Optional. A custom React Query client instance

For integration with document processors, you'll need to register the analytics store:

```tsx
function CustomProcessor() {
  const store = useAnalyticsStore();
  const manager = useProcessorManager();

  useEffect(() => {
    if (!store || !manager) return;

    registerProcessor(manager, store).catch(console.error);
  }, [store, manager]);

  return null;
}
```

## Available Hooks

### useAnalyticsQuery

Execute analytics queries against the analytics engine:

```tsx
const { data, isLoading } = useAnalyticsQuery({
  start: DateTime.now().minus({ days: 7 }),
  end: DateTime.now(),
  granularity: AnalyticsGranularity.Total,
  metrics: ["PageViews"],
  select: {
    page: [AnalyticsPath.fromString("pages/home")],
    user: [AnalyticsPath.fromString(`users/active`)],
  },
  lod: {
    page: 1,
  },
});
```

### useAnalyticsSeries

Query time series data:

```tsx
const { data } = useAnalyticsSeries({
  start: null,
  end: null,
  metrics: ["Revenue"],
  select: {
    product: [AnalyticsPath.fromString("products/electronics")],
    region: [AnalyticsPath.fromString("regions/na")],
  },
});
```

### useAddSeriesValue

Add a single value to a time series:

```tsx
const mutation = useAddSeriesValue();
await mutation.mutateAsync({
  start: DateTime.now(),
  source: AnalyticsPath.fromString("events/sales"),
  value: 1000,
  unit: "USD",
  metric: "Revenue",
  dimensions: {
    product: AnalyticsPath.fromString("products/electronics"),
    region: AnalyticsPath.fromString("regions/na"),
  },
});
```

### useAddSeriesValues

Add multiple values to time series:

```tsx
const mutation = useAddSeriesValues();
await mutation.mutateAsync([
  {
    start: DateTime.now(),
    source: AnalyticsPath.fromString("events/views"),
    value: 500,
    metric: "PageViews",
    dimensions: {
      page: AnalyticsPath.fromString("pages/home"),
    },
  },
  {
    start: DateTime.now(),
    source: AnalyticsPath.fromString("events/sales"),
    value: 1000,
    unit: "USD",
    metric: "Revenue",
    dimensions: {
      product: AnalyticsPath.fromString("products/electronics"),
    },
  },
]);
```

### useClearSeriesBySource

Clear all series data for a specific source:

```tsx
const mutation = useClearSeriesBySource();
await mutation.mutateAsync({
  source: AnalyticsPath.fromString("events/sales"),
  cleanUpDimensions: true,
});
```

### useGetDimensions

Retrieve available analytics dimensions:

```tsx
const { data: dimensions } = useGetDimensions();
```

### Context Hooks

- `useAnalyticsStore`: Access the analytics store instance
- `useAnalyticsEngine`: Access the analytics query engine instance

## Types

The module re-exports all types from `@powerhousedao/analytics-engine-core` and `@powerhousedao/analytics-engine-browser`, including:

- `AnalyticsQuery`
- `AnalyticsSeriesQuery`
- `AnalyticsSeriesInput`
- `AnalyticsDimension`
- `AnalyticsPath`
- `GroupedPeriodResults`
- `AnalyticsGranularity`

It also exports the `DateTime` class from `luxon` for handling dates and times.

## Testing

The module includes comprehensive tests for all functionality. See `test/analytics.test.tsx` for examples of testing analytics hooks and the analytics store.

Test setup example:

```tsx
const wrapper = ({ children }: PropsWithChildren) => (
  <AnalyticsProvider databaseName="test-analytics">
    {children}
  </AnalyticsProvider>
);

describe("Analytics", () => {
  it("should query analytics data", async () => {
    const { result } = renderHook(
      () =>
        useAnalyticsQuery({
          start: DateTime.now().minus({ days: 1 }),
          end: DateTime.now(),
          granularity: AnalyticsGranularity.Daily,
          metrics: ["PageViews"],
          select: {
            page: [AnalyticsPath.fromString("pages/home")],
          },
        }),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
  });
});
```
