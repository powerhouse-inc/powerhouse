---
sidebar_position: 3
---

# Postgres Store

The `PostgresAnalyticsStore` is an `IAnalyticsStore` implementation that leverages a Postgres database. It requires some APIs that do not run in a browser, and is intended for server-side applications.

<aside class="notice">
See the <a href="#compatibility">Compatibility</a> section for details on which stores are intended to be used in different execution environments.
</aside>

## Construction

The `PostgresAnalyticsStore` uses the [`pg`](https://www.npmjs.com/package/pg) package and requires Postgres connection information.

By providing a PG connection string, the store will automatically create a `pg` instance, internally.

A docker-compose file is provided [here](https://github.com/powerhouse-inc/analytics-engine/blob/main/pg/docker-compose.test.yml) that will spin up an instance quickly. Note that it cannot be copy/pasted but must be run in the checked out repository to access the correct initialization scripts. See the [developer documentation](https://github.com/powerhouse-inc/analytics-engine/tree/main?tab=readme-ov-file#pg) for more information.

> Create with only a connection string.

```typescript
// connects to a local postgres instance, configured by the provided docker-compose file
const store = new PostgresAnalyticsStore({
  connectionString: "postgresql://postgres:password@localhost:5555/analytics",
});
```

> Instead, create with a `knex` object.

```typescript
import knexFactory from "knex";

const knex = knexFactory({
  client: "pg",
  connection: "...",
});

const store = new PostgresAnalyticsStore({
  knex,
});
```

> The `PostgresAnalyticsStore` may also be created with optional contructor arguments that may be helpful for debugging or metrics collection.

```typescript
const store = new PostgresAnalyticsStore({
  queryLogger: querydefaultQueryLogger("memory"),
  resultsLogger: defaultResultsLogger("memory"),
  profiler: new PassthroughAnalyticsProfiler(),
});
```

For more details on these optional constructor parameters, see the [Utilities](#utilities) section.

## Raw Queries

Though there is no method on `IAnalyticsStore` for running arbitrary queries, the `PostgresAnalyticsStore` implementation provides a `raw(sql: string)` method. This is used only in development, testing, and [benchmarking](https://github.com/powerhouse-inc/analytics-engine/blob/main/benchmarks/src/wasm.ts) situations and is not intended for production use cases.

```typescript
const results = store.raw(`select distinct unit from "AnalyticsSeries"`);
```
