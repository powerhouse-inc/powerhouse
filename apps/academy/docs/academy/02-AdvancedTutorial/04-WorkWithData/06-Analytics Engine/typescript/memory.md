---
sidebar_position: 1
---

# Memory Store

The `MemoryAnalyticsStore` is an `IAnalyticsStore` implementation that uses a an in-memory database as its storage mechanism. Under the hood, we load a WASM build of Postgres, called [PGlite](https://pglite.dev/).

<aside class="notice">
See the <a href="#compatibility">Compatibility</a> section for details on which stores are intended to be used in different execution environments.
</aside>

## Construction

The `MemoryAnalyticsStore` is simple to create.

> Create with no arguments.

```typescript
const store = new MemoryAnalyticsStore();
```

> The `MemoryAnalyticsStore` may also be created with optional contructor arguments that may be helpful for debugging or metrics collection.

```typescript
const store = new MemoryAnalyticsStore({
  queryLogger: querydefaultQueryLogger("memory"),
  resultsLogger: defaultResultsLogger("memory"),
  profiler: new PassthroughAnalyticsProfiler(),
});
```

For more details on these optional constructor parameters, see the [Utilities](#utilities) section.

> Additionally, both `knex` and `pglite` objects may be passed in. This is helpful in contexts where multiple objects are sharing the same database.

```typescript
// knex must be created with these options
const knex = knexFactory({ client: "pg", useNullAsDefault: true });

// create your own Pglite instance and pass it in
// See (https://github.com/electric-sql/pglite/blob/main/packages/pglite/src/interface.ts) for full list of options.
const pgLiteFactory = () => PGlite.create({
  debug: 3,
  relaxedDurability: false,
});

const store = new MemoryAnalyticsStore({
  knex,
  pgLiteFactory,
})
```

## Initialization

While easy to use, the `MemoryAnalyticsStore` requires an asynchronous initialization step. This is for two reasons.

In cases where the `MemoryAnalyticsStore` was not provided a `PGlite` instance, it needs time to download and initialize the WASM build.

Additionally, it also needs to initialize the database schema of the in-memory database. This is distinct from the <a href="#postgres">Postgres implementation</a>, which assumes a fully-initialized Postgres database already exists. The initialization is idempotent, so tables already created will not be recreated.

The full SQL query used can be found in the [`MemoryAnalyticsStore` source](https://github.com/powerhouse-inc/analytics-engine/blob/main/browser/src/MemoryAnalyticsStore.ts).

> Note that this method is not available on the `IAnalyticsStore` interface, but only on the `MemoryAnalyticsStore` type.

```typescript
// create the store
const store = new MemoryAnalyticsStore();

// initialize it
await store.init();
```
