# Analytics for Reactor Browser

The analytics module provides React hooks and context providers for managing analytics data in browser applications. It leverages React Query for efficient data management and caching.

## Setup

To use analytics in your application, wrap your components with the `AnalyticsProvider`:

```tsx
import { AnalyticsProvider } from '@powerhousedao/reactor-browser';

function App() {
  return (
    <AnalyticsProvider store={analyticsStore}>
      {/* Your app components */}
    </AnalyticsProvider>
  );
}
```

The provider accepts the following props:
- `store`: Required. An implementation of `IAnalyticsStore`
- `queryClient`: Optional. A custom React Query client instance, or `false` to disable the QueryClientProvider wrapper

## Available Hooks

### useAnalyticsQuery

Execute analytics queries against the analytics engine:

```tsx
const { data, isLoading } = useAnalyticsQuery({
  start: DateTime.now().minus({ days: 7 }),
  end: DateTime.now(),
  granularity: AnalyticsGranularity.Total,
  metrics: ['Budget'],
  // ...other query parameters
});
```

### useAnalyticsSeries

Query time series data:

```tsx
const { data } = useAnalyticsSeries({
  start: null,
  end: null,
  metrics: ['Budget'],
  select: {
    budget: [AnalyticsPath.fromString('my/budget/path')]
  }
});
```

### useAddSeriesValue

Add a single value to a time series:

```tsx
const mutation = useAddSeriesValue();
await mutation.mutateAsync({
  start: DateTime.now(),
  source: AnalyticsPath.fromString('my/source'),
  value: 1000,
  unit: 'DAI',
  metric: 'Budget',
  dimensions: {
    budget: AnalyticsPath.fromString('my/budget')
  }
});
```

### useAddSeriesValues

Add multiple values to time series:

```tsx
const mutation = useAddSeriesValues();
await mutation.mutateAsync([
  // Array of series values
]);
```

### useClearSeriesBySource

Clear all series data for a specific source:

```tsx
const mutation = useClearSeriesBySource();
await mutation.mutateAsync({
  source: AnalyticsPath.fromString('my/source'),
  cleanUpDimensions: true
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

It also exports the `DateTime` class from `luxon` for handling dates and times.

## Testing

The module includes comprehensive tests for all functionality. See `test/analytics.test.tsx` for examples of testing analytics hooks and the analytics store.