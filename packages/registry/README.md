# @powerhousedao/registry

Powerhouse package registry built on Verdaccio 7. Serves as both an npm registry and a CDN for Powerhouse package bundles (ESM) for dynamic `import()` in browsers and Node.js.

## How it works

- **npm protocol:** Verdaccio. With S3 configured it stores package files in the bucket and its package list, tokens and secret in Postgres, through the bundled `@powerhousedao/verdaccio-s3-storage` plugin.
- **Publishing:** a successful publish records the version as pending, and a job to process it, in one transaction before the response goes out.
- **Processing:** a worker takes the job, unpacks the tarball once, and writes the files and piece bundles to the artifact store (S3 under `artifacts/`, or the local data directory) and the package, version and piece rows to Postgres. Jobs retry with backoff; a version that keeps failing is marked failed with the reason.
- **Reconciling:** every minute the worker compares each package's manifest revision in the storage plugin's index with the one its last sync applied, and syncs the ones that differ; hourly it compares every version. The first pass after upgrading syncs every package once.
- **Reading:** `/packages`, `/pieces`, `/-/cdn` and piece bundles read Postgres and the artifact store, so every replica answers the same. A version nobody processed yet, such as an npmjs package requested through the CDN, is processed on demand.

Every replica is stateless and interchangeable. Without `--database-url` the registry keeps its state in an embedded PGlite and runs its jobs in-process, which suits local development.

## API

### Packages

#### `GET /packages`

Returns a page of packages at their latest version, with an `ETag` for revalidation:

```json
{ "items": [], "total": 0, "limit": 30, "offset": 0, "hasMore": false }
```

| Parameter                             | Meaning                                                                                                                                                                                                           |
| ------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `limit`, `offset`                     | Page size (1–50, default 30) and start                                                                                                                                                                            |
| `search`                              | Full-text (stemmed), fuzzy (typo-tolerant) or substring match over the npm and manifest names, description, publisher, and module names and ids. Name substrings rank first, then other substrings, then by score |
| `name`                                | Only these packages, by npm or manifest name (repeatable)                                                                                                                                                         |
| `category`, `publisher`, `moduleType` | Manifest filters, repeatable; values of one filter OR, filters AND. `moduleType` is `documentModels`, `editors`, `apps`, `subgraphs` or `processors`                                                              |
| `documentType`                        | Only packages whose manifest defines this document model                                                                                                                                                          |
| `detail=full`                         | Items are full package info (manifest, document types, versions, owners) instead of list cards                                                                                                                    |
| `facets=true`                         | Adds `facets: { categories, publishers }` over the `name`-restricted set                                                                                                                                          |

Search runs in Postgres on `pg_trgm` and full-text indexes (migration 3); the database user must be able to `CREATE EXTENSION pg_trgm`, which the database owner can.

#### `GET /packages/by-document-type?type=<documentType>`

Returns an array of package names that contain the specified document type.

#### `GET /packages/<packageName>`

Returns info for a single package (supports scoped names like `@powerhousedao/vetra`).

### CDN

#### `GET /-/cdn/<packageName>/<filePath>`

Serves files from the CDN cache. On first request, fetches and extracts the tarball from Verdaccio. Looks for files in the package root, then `cdn/`, `dist/cdn/`, and `dist/` subdirectories.

If the package is not published locally, Verdaccio transparently proxies metadata and tarballs from the configured upstream (`--uplink`, default `https://registry.npmjs.org/`). The CDN then extracts the upstream tarball into `cdn-cache/<pkg>/<version>/` exactly as it does for locally-published packages, so subsequent requests are served from the local cache without re-hitting the upstream. The same fallback applies to `@powerhousedao/*` packages: the registry prefers its local copy, and falls back to the upstream when the package isn't published locally.

Responses carry caching headers keyed on the request shape. Version-pinned requests (`<pkg>@1.2.3/...`) are served `Cache-Control: public, max-age=31536000, immutable`; moving requests (a dist-tag like `@dev`/`@latest`, or untagged) get `public, max-age=60, must-revalidate`. A version-derived weak `ETag` is sent, and a matching `If-None-Match` returns `304`. When the upstream metadata lookup fails (as opposed to a genuine not-found), the endpoint serves the latest cached version if present, otherwise responds `503` rather than a cacheable `404`.

### Pieces

A reactor's workflow runtime reads pieces from these endpoints, ahead of the
Activepieces catalogue.

#### `GET /pieces`

The catalog of pieces that published packages ship, in the shape of
cloud.activepieces.com's list endpoint, as a page shaped like `/packages`'.
`limit` and `offset` page it, `search` matches the name, display name and
description like `/packages` does, and `?suggestionType=ACTION_AND_TRIGGER`
adds suggested actions and triggers.

#### `GET /pieces/<name>` and `GET /pieces/<name>?version=<v>`

One piece's detail: the latest version, or the one named. An unknown version
returns `404` with `available`, the versions the registry has.

#### `GET /pieces/<name>/versions`

Every version of the piece: `[{ version, packageVersion, publishedAt }]`. A
piece's version is always the version of the package that ships it.

#### `GET /-/pieces/bundled/<name>/<version>.tgz`

The piece directory as an npm-shaped tarball, the file a reactor's piece worker
downloads, e.g. `/-/pieces/bundled/@acme/slack/1.2.0.tgz`. It is served
immutable.

A piece name belongs to the first package that ships it, like an npm package
name: workflows refer to a piece by name and version on any switchboard.
Names under `@activepieces/` are reserved: a package that claims one is
refused.

### Health

- `GET /-/live`: 200 while the process serves HTTP; for liveness probes.
- `GET /-/ready`: 200 when Postgres answers and notifications are flowing, 503 otherwise and while draining after `SIGTERM`; for readiness probes.

### Metrics

`GET /-/metrics` returns Prometheus text. `ph-registry worker` serves the same path on `--metrics-port` (`PH_REGISTRY_METRICS_PORT`), and serves nothing without it.

| Metric                                                                                            | Where          | Meaning                                                                |
| ------------------------------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------- |
| `registry_jobs`, `registry_jobs_due`, `registry_jobs_running`, `registry_jobs_oldest_due_seconds` | both           | The job queue by `priority`, queried on scrape and cached for 5 s      |
| `registry_job_duration_seconds`                                                                   | where jobs run | Histogram by `kind` and `outcome` (`done`, `retry`, `failed`)          |
| `registry_reconcile_runs_total`, `registry_reconcile_queued_total`                                | where jobs run | Reconcile passes and the jobs they queued, by `pass` (`quick`, `full`) |
| `registry_listen_connected`                                                                       | both           | 1 while the LISTEN connection is up                                    |
| `registry_http_requests_total`, `registry_http_request_duration_seconds`                          | replicas       | By `route` group; the count also by `method` and `status` class        |
| `nodejs_eventloop_delay_seconds`                                                                  | both           | Event-loop delay quantiles since the previous scrape                   |
| `process_resident_memory_bytes`, `nodejs_heap_bytes`, `process_cpu_seconds_total`                 | both           | Memory and CPU                                                         |

The endpoint needs no credentials; keep it off the public ingress if the queue figures matter.

### Publish Notifications

When a package is published, the registry can notify subscribers in real time via Server-Sent Events (SSE) and webhooks.

#### SSE — `GET /-/events`

Opens a persistent SSE connection. The server sends:

- `connected` event on initial connection
- `publish` event whenever a package is published, with payload:

```json
{ "packageName": "@scope/pkg", "version": "1.0.0" }
```

Example (browser):

```ts
const source = new EventSource("http://localhost:8080/-/events");
source.addEventListener("publish", (e) => {
  const { packageName, version } = JSON.parse(e.data);
  console.log(`${packageName}@${version} published`);
});
```

#### Webhooks

Webhooks are persisted to disk and survive restarts. Predefined webhooks can also be provided via configuration.

##### `GET /-/webhooks`

Returns all registered webhooks (predefined + dynamic).

##### `POST /-/webhooks`

Registers a new webhook. Body:

```json
{ "endpoint": "https://example.com/hook", "headers": { "X-Token": "secret" } }
```

`headers` is optional. Returns `201` on success. Duplicate endpoints are ignored.

##### `DELETE /-/webhooks`

Removes a dynamic webhook. Body:

```json
{ "endpoint": "https://example.com/hook" }
```

Returns `204` on success, `404` if not found. Predefined webhooks cannot be removed.

When a package is published, each webhook receives a POST with:

```json
{
  "packageName": "@scope/pkg",
  "version": "1.0.0",
  "publishedBy": {
    "address": "0xabc...",
    "did": "did:key:z6Mk..."
  }
}
```

### npm Protocol

All standard npm registry operations (publish, install, etc.) are handled by Verdaccio.

## Publishing Packages

```sh
npm publish --registry http://localhost:8080/
```

A publish is recorded before the registry replies, and a worker processes it, usually within a second; the CDN, `/packages` and `/pieces` serve it from then on.

A version that was unpublished can't be published again: the registry answers `409`, as npm does. Pinned CDN files, piece bundles and tarballs are cached as immutable, so a reused version number would keep serving the old bytes. Publish a new version instead. To lift the rule for one version, delete its row from `registry_unpublished`.

## CLI

```sh
ph-registry --port 8080 --storage-dir ./storage --cdn-cache-dir ./cdn-cache
```

Other roles share the storage options below:

| Command                              | Does                                                                                                                                    |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `ph-registry`                        | Runs the registry. With `--workers 0` it only records jobs, for a deployment with separate workers.                                     |
| `ph-registry worker`                 | Runs jobs against a replica's npm endpoint (`--registry-url`, `PH_REGISTRY_INTERNAL_URL`); `--metrics-port` serves [metrics](#metrics). |
| `ph-registry migrate [--backfill]`   | Applies the database migrations; `--backfill` also queues processing of every package published here. See [Migrations](#migrations).    |
| `ph-registry import-verdaccio-state` | Copies Verdaccio's package list, tokens and secret from the old `verdaccio-s3-db.json`, plus every package stored in S3, into Postgres. |

Options:

| Option                    | Env Variable                        | Default                       | Description                                                                                                                  |
| ------------------------- | ----------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `--port`                  | `PORT`                              | `8080`                        | Port to listen on                                                                                                            |
| `--storage-dir`           | `REGISTRY_STORAGE`                  | `./storage`                   | Verdaccio storage directory                                                                                                  |
| `--cdn-cache-dir`         | `REGISTRY_CDN_CACHE`                | `./cdn-cache`                 | Local data directory: processed packages and the embedded database, when no S3 bucket or Postgres URL is set                 |
| `--database-url`          | `PH_REGISTRY_DATABASE_URL`          | —                             | Postgres shared by every replica and worker; required with S3                                                                |
| `--listen-database-url`   | `PH_REGISTRY_LISTEN_DATABASE_URL`   | `--database-url`              | A direct connection for LISTEN/NOTIFY when `--database-url` goes through a transaction pooler                                |
| `--workers`               | `PH_REGISTRY_WORKERS`               | `1`                           | Jobs the registry process runs at a time; `0` leaves them to `ph-registry worker`                                            |
| `--artifact-cache-mb`     | `PH_REGISTRY_ARTIFACT_CACHE_MB`     | `128`                         | Memory for serving published files up to 1 MiB without reading S3; unpublishing a version evicts its files. `0` turns it off |
| `--db-pool-max`           | `PH_REGISTRY_DB_POOL_MAX`           | `10`                          | Connections in the process's own Postgres pool (registry and worker)                                                         |
| `--storage-pool-max`      | `PH_REGISTRY_STORAGE_POOL_MAX`      | `2`                           | Connections for the storage plugin's reads: package list, tokens, secret                                                     |
| `--storage-lock-pool-max` | `PH_REGISTRY_STORAGE_LOCK_POOL_MAX` | `4`                           | Connections holding the storage plugin's package locks, one per concurrent manifest write                                    |
| `--migrate-on-boot`       | `PH_REGISTRY_MIGRATE_ON_BOOT`       | `true` without a database URL | `true` or `false`: apply migrations at startup instead of only checking the schema is current                                |
| `--uplink`                | `REGISTRY_UPLINK`                   | `https://registry.npmjs.org/` | Upstream npm registry URL used for fallback proxy                                                                            |
| `--web-enabled`           | `REGISTRY_WEB`                      | `true`                        | Enable Verdaccio web UI                                                                                                      |
| `--webhook`               | `REGISTRY_WEBHOOKS`                 | —                             | Comma-separated webhook URLs to notify on publish                                                                            |
| `--s3-bucket`             | `S3_BUCKET`                         | —                             | S3 bucket for storage                                                                                                        |
| `--s3-endpoint`           | `S3_ENDPOINT`                       | —                             | S3 endpoint URL                                                                                                              |
| `--s3-region`             | `S3_REGION`                         | —                             | S3 region                                                                                                                    |
| `--s3-access-key-id`      | `S3_ACCESS_KEY_ID`                  | —                             | S3 access key                                                                                                                |
| `--s3-secret-access-key`  | `S3_SECRET_ACCESS_KEY`              | —                             | S3 secret key                                                                                                                |
| `--s3-key-prefix`         | `S3_KEY_PREFIX`                     | —                             | S3 key prefix                                                                                                                |
| `--s3-force-path-style`   | `S3_FORCE_PATH_STYLE`               | `true`                        | Force S3 path-style URLs                                                                                                     |
| `--public-url`            | `PH_REGISTRY_PUBLIC_URL`            | —                             | Public URL of this registry — required when Renown auth is enabled. Used as the expected `aud` claim on bearer tokens.       |
| `--auth-renown`           | `PH_REGISTRY_AUTH_RENOWN`           | `true`                        | Enable Renown JWT auth in front of verdaccio. Disabled (no-op) when `--public-url` is unset.                                 |
| `--verdaccio-secret`      | `PH_REGISTRY_VERDACCIO_SECRET`      | —                             | Seeds Verdaccio's stored signing secret (32 characters) when none is stored yet, so tokens it already signed stay valid      |

## Authentication

Two authentication paths are supported:

1. **Renown bearer tokens (preferred).** Stateless: the registry verifies the
   token's signature against the issuer's DID public key, with no shared secret
   required across replicas. Activated by setting `--public-url`. CLI flow:
   `ph login` once, then `ph publish` (mints a fresh 5-minute token per
   invocation) or `ph registry-login` (writes a longer-lived token to
   `~/.npmrc` for raw `npm publish`).

2. **Accounts.** With a database, `npm adduser` and `npm login` go through the
   registry's auth plugin, which keeps accounts and package ownership in
   Postgres. Verdaccio 7 accepts no HTTP Basic auth, so the plugin treats an
   `adduser` with an existing user's correct password as a login. Without a
   database, Verdaccio's htpasswd file is used.

## Migrations

`ph-registry migrate` applies the database migrations; production runs it once per release, before the new pods start. With `--database-url` set, the registry and the worker only check the schema at startup, and refuse to start while a migration is missing. Without one, the embedded PGlite is migrated at startup, so tests and local `ph` use need no separate step. `--migrate-on-boot true` migrates at startup with Postgres as well; any number of processes may migrate at once.

Most migrations run in one transaction with `lock_timeout = 5s`. A migration marked `transaction: false` runs each statement on its own, for `CREATE INDEX CONCURRENTLY`: it holds a session advisory lock, so it connects through `--listen-database-url` when that is set, and an index left INVALID by a failed build is dropped and rebuilt on the next run. Migrations must keep the previous release working, since it still serves while the new one rolls out.

## Moving an existing S3 deployment

1. `ph-registry migrate` creates the registry's tables.
2. `ph-registry import-verdaccio-state` moves Verdaccio's state into Postgres, including names the old shared list lost.
3. Deploy the new version, with `ph-registry worker` if the replicas run `--workers 0`.
4. `ph-registry migrate --backfill` queues processing of every existing version; the worker's hourly sweep also does this, behind any publish.

## Deployment

### Database connections

Each process opens at most these connections, with the defaults:

| Process          | Through `--database-url` (the pooler)                                                   | Direct (`--listen-database-url`)                 |
| ---------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Registry replica | 16: its own pool (10), the storage plugin's pool (2) and lock pool (4)                  | 1 for LISTEN; 1 more while migrating, if it does |
| `worker`         | 10: its own pool; each running job uses one at a time, so keep it above `--concurrency` | 1 for LISTEN                                     |
| `migrate`        | 10, briefly                                                                             | 1 while an online migration runs                 |

Behind pgbouncer in transaction mode these are client connections, bounded by `MAX_CLIENT_CONN`: six replicas and a worker make at most 6 × 16 + 10 = 106. A client holds a server connection only during a transaction, and `DEFAULT_POOL_SIZE` caps the server connections for the registry's user and database across every process; past it, transactions queue in pgbouncer.

Most transactions take milliseconds, but a package-lock transaction lasts as long as the manifest's S3 write. With alpha's `DEFAULT_POOL_SIZE` of 20, six replicas with full lock pools (6 × 4 = 24) would hold every server connection, and the worker's jobs and every read would wait behind S3. Raise `DEFAULT_POOL_SIZE` before `--storage-lock-pool-max`, and keep Postgres' `max_connections` above `DEFAULT_POOL_SIZE` plus the direct connections, one per replica and worker.

### Build

```sh
# Latest version
docker build -t ph-registry .

# Specific version
docker build --build-arg TAG=6.0.0-dev.112 -t ph-registry .
```

The `TAG` build arg controls the npm version of `@powerhousedao/registry` to install (defaults to `latest`).

### Run

```sh
docker run -p 4873:4873 -v ph-data:/data ph-registry
```

#### Environment variables

Pass env variables with `-e`:

```sh
docker run -p 4873:4873 -v ph-data:/data \
  -e REGISTRY_UPLINK=https://registry.npmjs.org \
  -e S3_BUCKET=my-bucket \
  -e S3_REGION=us-east-1 \
  ph-registry
```

Or use an env file:

```sh
docker run -p 4873:4873 -v ph-data:/data --env-file .env ph-registry
```

See the [CLI](#cli) section for all supported environment variables.

#### CLI arguments

Since the image uses `ENTRYPOINT`, CLI args can be passed directly:

```sh
docker run -p 8080:8080 -v ph-data:/data ph-registry --port 8080 --uplink https://registry.npmjs.org
```

CLI arguments take precedence over environment variables.
