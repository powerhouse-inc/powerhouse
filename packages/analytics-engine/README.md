## Overview

![License](https://img.shields.io/npm/l/%40powerhousedao%2Fanalytics-engine-core?color=blue) ![Build](https://github.com/powerhouse-inc/analytics-engine/actions/workflows/publish-all.yml/badge.svg)

The Powerhouse `analytics-engine` contains a powerful, distributed, time-series analytics system, written in Typescript.

### Usage Quickstart

...

### Development Quickstart

The analytics engine is broken up into several modules. The module found in the `core/` directory is the primary interface for interacting with the engine, and also contains query and aggregation components. The `knex/`, `pg/`, and `browser/` directories contain modules for the backing storage engines.

For all modules, we use the `pnpm` package manager, `tsc-watch` as a filewatcher, and `vitest` for running tests.

All modules extend the [`tsconfig.json`](./tsconfig.json) found the root directory of the repo.

This repository is configured as a [PNPM workspace](https://pnpm.io/workspaces),
so you can install dependencies for every module from the root directory with:

```bash
pnpm install
```

All test suites can be executed at once using:

```bash
pnpm test
```

#### A note about dependencies

When working on multiple packages locally, it's generally advisable to link them to each other. In the corresponding `package.json` files, add a `pnpm.overrides` block:

```
"pnpm": {
  "overrides": {
    "@powerhousedao/analytics-engine-browser": "file:../browser",
    "@powerhousedao/analytics-engine-core": "file:../core",
    "@powerhousedao/analytics-engine-knex": "file:../knex",
    "@powerhousedao/analytics-engine-pg": "file:../pg"
  }
}
```

#### core/

[![Core Version](https://img.shields.io/npm/v/%40powerhousedao%2Fanalytics-engine-core?color=blue
)](https://www.npmjs.com/package/@powerhousedao/analytics-engine-core)

Local development of the `core/` module is simple:

```bash
cd core/
pnpm install
```

To run a file watcher, use:

```bash
pnpm dev
```

This will start the `tsc-watch` utility:

```
12:36:03 PM - Starting compilation in watch mode...
12:36:04 PM - Found 0 errors. Watching for file changes.
```

Unit and a few integration tests are found in the `tests/` sub-directory. These can be run with:

```bash
pnpm test
```

#### knex/

[![Knex Version](https://img.shields.io/npm/v/%40powerhousedao%2Fanalytics-engine-knex?color=blue
)](https://www.npmjs.com/package/@powerhousedao/analytics-engine-knex)

The `knex/` directory provides an analytics storage implementation on top of [knex.js](https://knexjs.org/).

Similarly to the `core/` module, use `pnpm install` for setup, `pnpm dev` for a file watcher, and `pnpm test` to run tests.

#### pg/

[![PG Version](https://img.shields.io/npm/v/%40powerhousedao%2Fanalytics-engine-pg?color=blue
)](https://www.npmjs.com/package/@powerhousedao/analytics-engine-pg)

The `pg/` directory provides an analytics storage implementation on top of the Postgres adapter, [`pg`](https://www.npmjs.com/package/pg). This module is intended to be run in a server-side environment and relies on several packages typically provided by NodeJS.

```bash
cd pg/
pnpm install
```

Similiarly to other modules, `pnpm dev` starts a file watcher.

Since the `pg/` package needs a database, we include a [`docker-compose.test.yml`](./pg/docker-compose.test.yml) Compose file. This allows for quick iteration without needing to install Postgres locally.

This can be used to start Postgres quickly for tests:

```bash
docker compose -f docker-compose.test.yml up -d

pnpm test

docker compose -f docker-compose.test.yml down
```

Postgres allows for initialization scripts to be run, and we use this to create the necessary analytics tables, indices, and other objects. This script can be found in `pg/test/scripts`. However, sometimes it is handy to destroy this database, which can be tricky to find with Docker volumes. Instead of deleting the volume, you can simply delete the mounted folder that is configured:

```bash
docker compose -f docker-compose.test.yml down

rm -rf ./.db

docker compose -f docker-compose.test.yml up
```

You will be able to tell that the tables are recreated by looking at the logs. Here is an example of what you should see:

```
/usr/local/bin/docker-entrypoint.sh: running /docker-entrypoint-initdb.d/initdb.sh
database-1  | CREATE DATABASE
database-1  | You are now connected to database "analytics" as user "postgres".
database-1  | CREATE TABLE
database-1  | CREATE INDEX
database-1  | CREATE INDEX
database-1  | CREATE INDEX
database-1  | CREATE INDEX
database-1  | CREATE INDEX
database-1  | CREATE INDEX
database-1  | CREATE INDEX
database-1  | CREATE TABLE
database-1  | CREATE INDEX
database-1  | CREATE INDEX
database-1  | CREATE TABLE
database-1  | CREATE INDEX
database-1  | CREATE INDEX
```

#### /browser

[![Browser Version](https://img.shields.io/npm/v/%40powerhousedao%2Fanalytics-engine-browser?color=blue
)](https://www.npmjs.com/package/@powerhousedao/analytics-engine-core)

A store is provided for the browser in the `browser/` directory.

```bash
cd browser/
pnpm install
```

Similarly to other modules, `pnpm dev` starts a file watcher.

Testing the browser implementation, however, requires a bit of setup. These tests run in a browser using `playwright`. To setup, run:

```bash
pnpm exec playwright install
```

This may require answering a few questions, but installs necessary components to your system. Once this is done, you can now run tests with:

```bash
pnpm test
```

This will open a browser window and run your tests!

#### /graphql

[![GraphQL Version](https://img.shields.io/npm/v/%40powerhousedao%2Fanalytics-engine-graphql?color=blue
)](https://www.npmjs.com/package/@powerhousedao/analytics-engine-core)

GraphQL types and resolvers are found in the the `/graphql` directory. This module does not depend on any particular GQL libraries, but contain only basic primitives.

```
cd graphql/
pnpm install
pnpm dev
```

### Benchmarks

There are several benchmarking suites that test relative performance of the different stores using [tinybench](https://github.com/tinylibs/tinybench). These are all in the `benchmarks/` directory. See the [benchmarking docs](./benchmarks/README.md) to get up and running.

### Compatibility

The `compat/` folder contains tests that compare results from different analytics stores or environments. See the accompanying [README](./compat/README.md) for more information.
