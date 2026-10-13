# `@powerhousedao/analytics-engine-pg`

`packages/analytics-engine/pg` · published · v6.2.3-dev.9

---

## Purpose

The production server-side analytics store: `IAnalyticsStore` backed by a real
PostgreSQL database.

It is the store `reactor-api` constructs when serving the analytics subgraph from a
Switchboard.

---

## Functionality

Two source files, both small, because the SQL lives in
`@powerhousedao/analytics-engine-knex`.

### `src/PostgresAnalyticsStore.ts`

```ts
export class PostgresAnalyticsStore extends KnexAnalyticsStore { … }
```

Options: `connectionString` **or** an existing `knex` instance, plus optional
`queryLogger`, `resultsLogger` and `profiler`.

The notable work happens at import time — two `pg` type parsers are overridden:

```ts
types.setTypeParser(types.builtins.DATE, (value) => value);              // keep DATE as a string
types.setTypeParser(types.builtins.JSON, (value) => JSON.parse(value, reviver));
```

The first prevents node-postgres from coercing `DATE` into a JS `Date` in the
driver's local timezone — a classic source of off-by-one-day bugs in time-series
data. The second hooks the custom reviver so `AnalyticsPath` values round-trip.

### `src/AnalyticsSerializer.ts`

The `reviver` used above. It restores typed values from their JSON encoding —
`AnalyticsPath`, `AnalyticsPathSegment`, `AnalyticsPeriod` — tagged with
`AnalyticsSerializerTypes` discriminators (`{ _t, _v }`).

This is the serialisation contract between what a processor writes and what a query
reads back. Both the `pg` and `browser` stores must agree on it.

---

## Test infrastructure

**This package needs a running Postgres, which is why it is excluded from the
default CI test run.**

### The database

`packages/analytics-engine/pg/docker-compose.test.yml`:

| Service | Detail |
|---|---|
| `database` | `postgres:16.4-alpine`, host port **5555**, user `postgres`, password `password`, data in `.db/`, `test/scripts/` mounted as `docker-entrypoint-initdb.d`, healthcheck `pg_isready` |
| `adminer` | A web DB client for inspecting it |

```bash
docker compose -f packages/analytics-engine/pg/docker-compose.test.yml up -d
```

### The run

```json
"test": "cross-env PG_CONNECTION_STRING=postgresql://postgres:password@localhost:5555/analytics vitest --run"
```

Root script: **`pnpm test:pg`**. Note it is *not* in `pnpm test:ci`'s filter list.

### The suites

3 test files plus `test/vitest.setup.ts` and `test/scripts/` (the init SQL).

| File | Covers |
|---|---|
| `test/AnalyticsStore.test.ts` | The store surface — insert, query, dimension handling |
| `test/Integration.test.ts` | Full query paths through `AnalyticsQueryEngine` against real SQL |

Because `PostgresAnalyticsStore` extends `KnexAnalyticsStore`, these suites are
effectively the test coverage for the `knex` package too — which has none of its
own.

Further coverage: `analytics-engine/compat/test/` compares this store's answers
against the browser store's for identical queries, and
`analytics-engine/benchmarks/` runs it against ~200k migrated records
(`./scripts/dump-db.sh`).

---

## How it is used

Depends on: `@powerhousedao/analytics-engine-core`, `@powerhousedao/analytics-engine-knex`.

```mermaid
graph LR
    core["analytics-engine-core"] --> knex["analytics-engine-knex"]
    core --> pg
    knex --> pg["analytics-engine-pg<br/>PostgresAnalyticsStore"]

    pg --> rapi["reactor-api<br/>analytics-subgraph.ts"]
    rapi --> sb["apps/switchboard"]
    pg --> bench["benchmarks (private)"]
    pg --> compat["compat (private)"]
```

| Consumer | How |
|---|---|
| `reactor-api` | A direct runtime dependency. Constructs the store and hands it to `analytics-engine-graphql`'s `AnalyticsModel` for the analytics subgraph |
| `apps/switchboard` | Gets it transitively; its Postgres connection is the one the store uses |
| `benchmarks`, `compat` | Both private harnesses |

### Its browser counterpart

`@powerhousedao/analytics-engine-browser` implements the same interface over PGlite
for in-page analytics. The two are **independent implementations**, not a shared
base with two dialects — hence `compat`. When you change dimension handling or
serialisation here, check whether the browser store needs the same change.
