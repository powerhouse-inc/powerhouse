# `packages/analytics-engine/*` — overview

Seven workspace projects under one directory. Five are published; two are private
harnesses.

This sub-tree was vendored in from a separate repository
(`powerhouse-inc/analytics-engine`) and keeps its own README, its own conventions,
and its own notion of how modules relate. Treat it as a sub-repo that happens to
live here.

---

## Purpose

A distributed time-series analytics system in TypeScript. From the README:

> The Powerhouse `analytics-engine` contains a powerful, distributed, time-series
> analytics system.

Within Powerhouse it answers questions about drive and document activity: how many
operations, by whom, on which drive, over what period. The rows come from the drive
analytics processors in `@powerhousedao/common`; the queries come from the GraphQL
subgraph in `reactor-api` or from hooks in `reactor-browser`.

---

## The modules

| Project | Published | Role |
|---|---|---|
| [`core`](analytics-engine-core.md) | yes | The query engine and its vocabulary. The primary interface. |
| [`knex`](analytics-engine-knex.md) | yes | Knex-based store and query executor |
| [`pg`](analytics-engine-pg.md) | yes | PostgreSQL store, built on `knex` |
| [`browser`](analytics-engine-browser.md) | yes | PGlite (WASM Postgres) store for in-browser analytics |
| [`graphql`](analytics-engine-graphql.md) | yes | GraphQL schema, model and resolvers |
| `benchmarks` | **private** | Performance measurement against a real dataset |
| `compat` | **private** | Cross-store compatibility tests |

```mermaid
graph TD
    core["core<br/>AnalyticsQueryEngine, AnalyticsPath,<br/>AnalyticsPeriod, discretizer, time slicer,<br/>IAnalyticsStore, IAnalyticsCache"]
    knex["knex<br/>KnexAnalyticsStore<br/>KnexQueryExecutor"]
    pg["pg<br/>PostgresAnalyticsStore<br/>AnalyticsSerializer"]
    browser["browser<br/>BrowserAnalyticsStore<br/>PgLiteExecutor"]
    gql["graphql<br/>AnalyticsModel, AnalyticsResolvers, schema"]
    bench["benchmarks (private)"]
    compat["compat (private)"]

    core --> knex --> pg
    core --> browser
    core --> gql
    core --> bench
    knex --> bench
    pg --> bench
    browser --> bench
    core --> compat
    knex --> compat
    pg --> compat
    browser --> compat

    shared["@powerhousedao/shared/analytics<br/>AnalyticsPath, AnalyticsPeriod types"] --> core
```

`core` defines `IAnalyticsStore`; `knex`, `pg` and `browser` implement it. That is
the whole shape of the sub-tree.

---

## The two private harnesses

### `benchmarks`

Measures performance characteristics against a realistic dataset. Its README
documents the workflow:

```bash
docker compose -f ../pg/docker-compose.test.yml up -d   # start postgres
./scripts/dump-db.sh <user> <password> <host> <db>      # migrate a remote db locally
pnpm benchmark
```

The dump script is macOS-oriented; Linux users need the `# GNU sed (Linux)` block
inside it. The tests take a while to run.

### `compat`

Two things under one name:

- **`test/`** — integration tests comparing responses from the **Postgres store**
  against responses from the **browser store**. Requires the same Postgres container
  plus ~200k records loaded via the benchmarks instructions. This is what keeps the
  two stores honest against each other.
- **`src/`** — despite the directory name, a script that deep-compares raw results
  from two different **GraphQL endpoints**, useful for dev-vs-prod comparison:

```bash
node dist/src/query-list.js --src "<dev graphql url>" --target "<prod graphql url>"
```

---

## Test infrastructure across the sub-tree

Each module has its own `vitest.config.ts` and `test` script, and they are *not*
uniform:

| Module | `test` script | Needs |
|---|---|---|
| `core` | `vitest --run` | nothing |
| `knex` | `vitest --run ./**/*.test.ts` | nothing (no test files today) |
| `pg` | `cross-env PG_CONNECTION_STRING=postgresql://postgres:password@localhost:5555/analytics vitest --run` | **a Postgres on port 5555** |
| `browser` | `vitest --run ./**/*.test.ts` | nothing (PGlite is in-process) |
| `graphql` | `vitest --run ./**/*.test.ts` | nothing (no test files today) |

Root scripts that reach them:

```
pnpm test:ci                      # includes core, graphql, knex (they are in the filter list)
pnpm test:pg                      # --filter=@powerhousedao/analytics-engine-pg
pnpm test:integration:analytics   # --filter=@powerhousedao/analytics-engine-browser
```

`pg` and `browser` are deliberately **out** of the default `test:ci` run — `pg`
because it needs a database, `browser` because its suite is an integration run.

Postgres for the `pg` tests comes from `packages/analytics-engine/pg/docker-compose.test.yml`:
`postgres:16.4-alpine` on host port **5555**, with `test/scripts/` mounted as
`docker-entrypoint-initdb.d`, plus an Adminer container.

---

## How the sub-tree connects to the rest of the monorepo

```mermaid
graph LR
    common["@powerhousedao/common<br/>DriveAnalyticsProcessor<br/>DocumentAnalyticsProcessor"]
    core["analytics-engine-core"]
    pg["analytics-engine-pg"]
    browser["analytics-engine-browser"]
    gql["analytics-engine-graphql"]
    rapi["reactor-api<br/>analytics-subgraph.ts"]
    rb["reactor-browser<br/>src/analytics/"]

    common -- "writes rows" --> core
    core --> pg --> rapi
    core --> gql --> rapi
    core --> browser --> rb
```

- **Writes** come from the two processors in `@powerhousedao/common`, which turn
  reactor operation strands into dimensional time-series rows.
- **Server reads** go through `reactor-api`'s `analytics-subgraph.ts`, which composes
  `analytics-engine-graphql`'s schema over a `PostgresAnalyticsStore`.
- **Browser reads** go through `reactor-browser`'s `src/analytics/` over a
  `BrowserAnalyticsStore` on PGlite — the same queries, locally.

That last point is the reason the `compat` harness exists: the same
`AnalyticsQuery` must produce the same answer on both stores.

---

## Local development note

The README suggests `pnpm.overrides` with `file:` links when working on several
analytics modules at once:

```json
"pnpm": {
  "overrides": {
    "@powerhousedao/analytics-engine-browser": "file:../browser",
    "@powerhousedao/analytics-engine-core": "file:../core",
    "@powerhousedao/analytics-engine-knex": "file:../knex",
    "@powerhousedao/analytics-engine-pg": "file:../pg"
  }
}
```

Inside this monorepo the `workspace:*` protocol already does that, so the advice is
a leftover from the standalone repo — relevant only if you extract a module.
