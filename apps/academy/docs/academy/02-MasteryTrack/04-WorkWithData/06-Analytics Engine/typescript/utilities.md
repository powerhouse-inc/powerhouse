---
sidebar_position: 100
---

# Utilities

This section describes various utility objects.

## SqlQueryLogger and SqlResultsLogger

The `SqlQueryLogger` type defines a synchronous interface for logging out SQL queries, while `SqlResultsLogger` provides the same for raw query results. These can be very useful for debugging or understanding what queries are actually generated from top level Typescript objects.

These types are used frequently in multiple `IAnalyticsStore` implementations, such as `KnexAnalyticsStore`, `PostgresAnalyticStore`, `MemoryAnalyticsStore`, and `BrowserAnalyticsStore`. Generally, they are optional inputs into the constructor options object.

> Create your own query logger.

```typescript
const queryLogger = (index, query) => console.log(`[Q:${index}] ${query}`);

const store = new MemoryAnalyticsStore({ queryLogger });
```

> You may also create a results logger. Since queries are asynchronous operations, indices match between query and results functions.

```typescript
const queryLogger = (index, query) => console.log(`[Q:${index}] ${query}`);
const resultsLogger = (index, results) =>
  console.log(`[R:${index}] ${JSON.stringify(results)}`);

const store = new MemoryAnalyticsStore({ queryLogger, resultsLogger });
```

More commonly, you can use the included utility functions, `defaultQueryLogger` and `defaultResultsLogger`. These functions append a tag to each log.

```typescript
const store = new MemoryAnalyticsStore({
  queryLogger: defaultQueryLogger("memory"),
  resultsLogger: defaultResultsLogger("memory"),
});
```

## IAnalyticsProfiler

The Powerhouse Analytics Engine includes a simple profiling interface, `IAnalyticsProfiler`, that is consumed by each `IAnalyticsStore` implementation. A default implementation, `AnalyticsProfiler` is provided as part of the `@powerhousedao/analytics-engine-core` package.

The `AnalyticsProfiler` requires a namespace and a logger.

```typescript
const profiler = new AnalyticsProfiler(
  "my-system",
  (metricName: string, ms: number) => console.log(`[${metricName}] ${Math.floor(ms)} ms`));
```

> This object may be passed in through the constructor.

```typescript
// pass this object in to profile the memory store
const store = new MemoryAnalyticsStore({ profiler });
```

### Record

The `record` method accepts a metric name and an asynchronous function to time. It returns the value returned by the asynchronous method.

```typescript
const result = await profiler.record("compute", async () => {
  // elided
});
```

### RecordSync

A synchronous version is also included.

```typescript
const result = profiler.recordSync("computeSync", () => {
  // elided
});
```

### Name Stack

Often, it is useful to group metrics together. This is accomplished through a metric naming stack, which takes the form: `[Namespace].[... Stack Values].[Metric Name]`. This allows systems to pass down a profiler instance, and compose results.

```typescript
// Blocks, { }, are a good convention to signal stack depth.
profiler.push("system");
{
  profiler.recordSync("a", myFuncA);    // my-system.system.a

  profiler.push("subsystem");
  {
    profiler.recordSync("b", myFuncB);  // my-system.system.subsystem.b
  }
  profiler.pop();

  profiler.recordSync("c", myFuncC);    // my-system.system.c
}
profiler.pop();

profiler.recordSync("d", myFuncC);      // my-system.c
```
