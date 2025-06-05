---
sidebar_position: 2
---

# Browser Store

The `BrowserAnalyticsStore` is an `IAnalyticsStore` implementation that sits on top of [`MemoryAnalyticsStore`](#memory) but adds an `IndexedDB` plugin for persistence.

<aside class="notice">
See the <a href="#compatibility">Compatibility</a> section for details on which stores are intended to be used in different execution environments.
</aside>

## Construction

A default implementation of the `BrowserAnalyticsStore` may be created with no arguments, or options are provided for specialized needs.

```typescript
// creates a database named "analytics"
const store = new BrowserAnalyticsStore();
```

> Create with a specific database name.

```typescript
const store = new BrowserAnalyticsStore({ databaseName: "analytics" });
```

> It may also be created with optional contructor arguments that may be helpful for debugging or metrics collection.

```typescript
const store = new BrowserAnalyticsStore({
  databaseName: "analytics",

  queryLogger: defaultQueryLogger("browser"),
  resultsLogger: defaultResultsLogger("browser"),
  profiler: new PassthroughAnalyticsProfiler(),
});
```

For more details on these optional constructor parameters, see the [Utilities](#utilities) section.

Since the constructor options argument extends the `MemoryAnalyticsStore` options argument, see the [`MemoryAnalyticsStore`](#memory) documentation for further details on other optional parameters.

## Initialization

Similar to the [`MemoryAnalyticsStore`](#memory), this implementation requires an asynchronous initialization step.

> Note that this method is not available on the `IAnalyticsStore` interface, but only on the concrete type.

```typescript
// create the store
const store = new BrowserAnalyticsStore();

// initialize it
await store.init();
```

## Persistence

The `databaseName` constructor argument namespaces the database. This allows users to create multiple stores, if needed, which will not conflict with each other. You can use your browser's developer tools to see these databases, usually through the "Storage" tab.

<aside class="notice">
While manipulating the data manually is not recommended, this allows you to easily delete and recreate databases if needed.
</aside>

![dev-tools](../images/indexeddb.png)

The store interface is intended to be immutable, meaning that it does not provide a general method of wiping a DB. However, an IDB database may be deleted via the standard [IDB API](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API).

```typescript
// creates the database
const store = new BrowserAnalyticsStore({ databaseName: "my-analytics" });
await store.init();

// use the browser API to delete the database
window.indexedDB.deleteDatabase("my-analytics");
```
