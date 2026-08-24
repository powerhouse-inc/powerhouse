# Docker deployment guide

## Introduction

Powerhouse provides official Docker images for deploying your applications in containerized environments. This guide covers the available Docker images, how to use them with Docker Compose, and the environment variables you can configure.

Docker deployment is ideal for:

- **Production environments** that require consistent, reproducible deployments
- **Development teams** that want to share a common environment
- **CI/CD pipelines** that need automated testing and deployment
- **Cloud platforms** like AWS ECS, Google Cloud Run, or Kubernetes

:::tip[Deployment Options]
This guide covers **Docker-based deployment**. If you prefer **traditional VM/server deployment** with direct installation, see the [Setup Environment Guide](./03-SetupEnvironment.md).

**Choose Docker if:** You want the fastest path to production, prefer containerized workflows, or are deploying to cloud platforms.
**Choose Direct Installation if:** You need maximum performance, want full control, or are setting up a dedicated server.
:::

## Available Docker Images

Powerhouse publishes three official Docker images to the Vetra Harbor registry (`cr.vetra.io`):

### 1. Connect

The Connect image provides the Powerhouse web application frontend with an embedded Nginx server.

```
cr.vetra.io/powerhouse-inc-powerhouse/connect
```

**Available tags:**

- `latest` - Latest stable release
- `dev` - Development builds (from `main`)
- `staging` - Staging builds
- `rc` - Release candidates
- `vX.Y.Z` - Specific version tags (e.g., `v6.2.1`)

### 2. Switchboard

The Switchboard image provides the backend API server that handles document synchronization and GraphQL endpoints.

```
cr.vetra.io/powerhouse-inc-powerhouse/switchboard
```

**Available tags:**

- `latest` - Latest stable release
- `dev` - Development builds (from `main`)
- `staging` - Staging builds
- `rc` - Release candidates
- `vX.Y.Z` - Specific version tags (e.g., `v6.2.1`)

### 3. Academy

The Academy image provides the documentation website.

```
cr.vetra.io/powerhouse-inc-powerhouse/academy
```

**Available tags:**

- `latest` - Latest stable release
- `dev` - Development builds
- `staging` - Staging builds
- `vX.Y.Z` - Specific version tags (e.g., `v1.0.0`)

## Quick Start with Docker Compose

The easiest way to run Powerhouse locally is using Docker Compose. The repository ships ready-made compose files — `docker-compose.yml` (production, `latest`), plus per-channel variants `docker-compose.dev.yml` / `docker-compose.test.yml` (`rc`) / `docker-compose.staging.yml`, and a postgres-free `docker-compose.pglite.yml`. The default file:

```yaml
name: powerhouse

services:
  connect:
    image: cr.vetra.io/powerhouse-inc-powerhouse/connect:latest
    # Auto-connect the SPA to the local switchboard.
    environment:
      - 'PH_CONNECT_CONFIG_JSON={"connect":{"drives":{"defaultDrives":[{"url":"http://localhost:4000","name":null,"icon":null}]}}}'
    ports:
      - "127.0.0.1:3000:3001"
    networks:
      - powerhouse_network
    hostname: connect.powerhouse
    healthcheck:
      test: ["CMD", "wget", "-q", "--spider", "http://127.0.0.1:3001/health"]
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3

  switchboard:
    image: cr.vetra.io/powerhouse-inc-powerhouse/switchboard:latest
    environment:
      # Reactor storage + entrypoint migration gate.
      - PH_REACTOR_DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres
      # Read-model storage. Both point at the same database.
      - PH_SWITCHBOARD_DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres
    ports:
      - "127.0.0.1:4000:3000"
    networks:
      - powerhouse_network
    hostname: switchboard.powerhouse
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://127.0.0.1:3000/health"]
      interval: 30s
      timeout: 3s
      start_period: 30s
      retries: 3

  postgres:
    image: postgres:16.1
    ports:
      - "127.0.0.1:5444:5432"
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=postgres
      - POSTGRES_USER=postgres
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - powerhouse_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 3

networks:
  powerhouse_network:

volumes:
  postgres_data:
```

### Running the Stack

Start all services:

```bash
docker compose up -d
```

View logs:

```bash
docker compose logs -f
```

Stop all services:

```bash
docker compose down
```

After starting, you can access:

- **Connect**: http://localhost:3000
- **Switchboard**: http://localhost:4000

## Configuring Connect at runtime

Connect's runtime behavior is driven by `powerhouse.config.json` (the same file the build uses). For a Docker deployment you have three options:

1. **Mount your own `powerhouse.config.json`** as a Kubernetes ConfigMap / Secret (or a bind-mounted file) at `/var/www/html/project/powerhouse.config.json`. The SPA fetches it from `/powerhouse.config.json` on every page load, so post-deploy edits are visible after a refresh.
2. **Pass a JSON payload via the `PH_CONNECT_CONFIG_JSON` env var**. The entrypoint deep-merges it into the dist `powerhouse.config.json` at container start (operator-wins — concrete values in the payload override the baked file).
3. **Edit the file at build time** via `ph connect build --json '{...}'` or individual `--flag`s, baking the values into the image.

For the full configuration model, precedence ladder, and the complete list of `connect.*` fields, see the [Configure Environment](./04-ConfigureEnvironment.md) guide.

### Connect container env vars

Connect's SPA reads runtime configuration from `/powerhouse.config.json`, never from env vars at runtime. The container entrypoint, however, can apply operator-supplied JSON to that file at startup (operator-wins) — equivalent to pre-running `ph connect config --json '{...}'` on the dist file. The SPA then reads the file as usual.

#### Container shape and secrets

| Variable                 | Description                                                 | Default  |
| ------------------------ | ----------------------------------------------------------- | -------- |
| `PORT`                   | Port the nginx server listens on                            | `3001`   |
| `PH_CONNECT_BASE_PATH`   | nginx base URL path                                         | `/`      |
| `PH_CONNECT_CONFIG_JSON` | Runtime config JSON to merge into the dist file (see below) | _unset_  |

Connect does **not** read any database variables — it is a static frontend. Database connection strings belong on the Switchboard service (see below).

Sentry (DSN, environment label, tracing flag) is no longer set via per-field env vars — those live in `connect.sentry.*` of `powerhouse.config.json` and ride through `PH_CONNECT_CONFIG_JSON` like every other runtime field. See the example below.

#### `PH_CONNECT_CONFIG_JSON` (operator-wins)

Set this env var to a JSON object that mirrors the `connect.*` block of `powerhouse.config.json`. At container start the entrypoint deep-merges it into the dist file with **operator-wins semantics**: a concrete value in the env JSON overwrites the baked/mounted file; a `null` leaf (or an omitted key) keeps the file's value. Exception: `connect.app.basePath` is ignored — the base path is baked into the bundled asset URLs at build time (rebuild with `--base`, or use `--dynamic-base`).

```bash
docker run \
  -e PH_CONNECT_CONFIG_JSON='{
    "connect": {
      "app": { "logLevel": "debug" },
      "renown": { "url": "https://renown.staging.example", "chainId": 137 },
      "drives": {
        "defaultDrives": [
          { "url": "https://drive-a.example", "name": null, "icon": null }
        ],
        "sections": {
          "remote": { "enabled": true, "allowAdd": false }
        }
      },
      "sentry": {
        "dsn": "https://prod-key@sentry.io/1",
        "env": "prod",
        "tracing": true
      }
    }
  }' \
  connect:latest
```

The schema for the JSON object lives at `packages/builder-tools/connect-utils/runtime-config.schema.json` (also served as the `$schema` URL of any generated file). The same shape that `ph connect config --json` accepts is what `PH_CONNECT_CONFIG_JSON` accepts here.

**Invalid input behaviour:** malformed JSON or a non-object payload aborts container startup with a clear stderr message rather than silently dropping the operator's intent.

**Migration from per-field env vars:** the previous `PH_CONNECT_LOG_LEVEL`, `PH_CONNECT_DISABLE_ADD_DRIVE`, `PH_CONNECT_RENOWN_URL`, `PH_CONNECT_DEFAULT_DRIVES_URL`, `PH_CONNECT_SENTRY_DSN`, `PH_CONNECT_SENTRY_ENV`, `PH_CONNECT_SENTRY_TRACING_ENABLED`, and similar per-field variables are no longer wired. Wrap their values into a single `PH_CONNECT_CONFIG_JSON` payload using the JSON paths shown above. The Sentry **release** tag is build-time only — it stamps into the bundle via Vite's `define` from `WORKSPACE_VERSION` so it always matches the sourcemap upload tag CI used.

### Switchboard Environment Variables

#### Storage (Postgres or embedded PGlite)

Switchboard stores the reactor and the read models in one of two backends. When a Postgres URL is set it uses Postgres; otherwise it falls back to its embedded **PGlite** storage (local directories `./.ph/reactor-storage` and `.ph/read-storage` relative to the working directory — persist that directory with a volume, as the repo's `docker-compose.pglite.yml` does).

| Variable                      | Description                                                                    | Default           |
| ----------------------------- | ------------------------------------------------------------------------------ | ----------------- |
| `PH_REACTOR_DATABASE_URL`     | Postgres URL for reactor storage; also triggers the entrypoint's migrations    | _unset_ (PGlite)  |
| `PH_SWITCHBOARD_DATABASE_URL` | Postgres URL for the read model and (as fallback) the reactor                  | _unset_ (PGlite)  |
| `DATABASE_URL`                | Postgres URL for the read model (checked before `PH_SWITCHBOARD_DATABASE_URL`) | _unset_ (PGlite)  |

For a single-database deployment (the normal case, and what the repo's compose files do), set `PH_REACTOR_DATABASE_URL` and `PH_SWITCHBOARD_DATABASE_URL` to the same URL.

| Variable              | Description                                                                    | Default  |
| --------------------- | ------------------------------------------------------------------------------ | -------- |
| `PH_PGLITE_IN_MEMORY` | `1` = run PGlite in memory (no persistence)                                    | _unset_  |
| `PH_MIGRATE_PGLITE`   | `true` = migrate local PGlite data to the PG version this image ships          | _unset_  |
| `PH_FORCE_PG_VERSION` | `16` or `17` = wipe the local PGlite data dirs and re-initialize at that major | _unset_  |
| `SKIP_DB_MIGRATIONS`  | `true` = skip the entrypoint's Postgres migration run                          | _unset_  |

#### Core Configuration

| Variable                    | Description                                                          | Default                     |
| --------------------------- | ------------------------------------------------------------------   | -------------------------   |
| `PORT`                      | Port the server listens on (exported as `PH_SWITCHBOARD_PORT`)       | `3000`                      |
| `PH_SWITCHBOARD_PORT`       | Explicit port override                                               | `$PORT`                     |
| `PH_DEFAULT_DRIVE_TYPE`     | `powerhouse/document-drive` or `powerhouse/reactor-drive`            | _unset_                     |
| `PH_PACKAGES`               | Comma-separated packages installed via pnpm at startup               | `""`                        |
| `PH_REGISTRY_PACKAGES`      | Comma-separated packages loaded over HTTP from the registry at start | `""`                        |
| `PH_REGISTRY_URL`           | Package registry base URL for HTTP package loading                   | `https://registry.vetra.io` |
| `PH_SWITCHBOARD_PUBLIC_URL` | Public origin used for the remote attachment service                 | `http://localhost:$PORT`    |
| `LOG_LEVEL`                 | Log level                                                            | `info`                      |

#### Error Tracking & Monitoring

| Variable                   | Description                                            | Default |
| -------------------------- | ------------------------------------------------------ | ------- |
| `SENTRY_DSN`               | Sentry DSN for error tracking                          | `""`    |
| `SENTRY_ENV`               | Sentry environment name (e.g. "production", "staging") | `""`    |
| `SENTRY_TRACING_ENABLED`   | `false` = errors-only Sentry mode (no tracing)         | _unset_ |
| `TEMPO_ENDPOINT`           | OTLP HTTP endpoint for trace export (Grafana Tempo)    | `""`    |
| `PYROSCOPE_SERVER_ADDRESS` | Pyroscope server address for performance profiling     | `""`    |

## Installing Custom Packages

The two images load custom packages differently, matching where they run:

- **Connect** loads packages **in the browser at runtime** from the package registry. The registry base URL is the top-level `packageRegistryUrl` field of `powerhouse.config.json` (baked in at image build time). To use different packages or a different registry in a deployment, override those top-level fields with `PH_CONNECT_CONFIG_JSON`, e.g.:

  ```bash
  PH_CONNECT_CONFIG_JSON='{"packageRegistryUrl":"https://registry.example","packages":[{"name":"@powerhousedao/todo-demo-package","version":"1.0.0"}]}'
  ```

- **Switchboard** loads packages **server-side at startup**, in one of two ways:
  - `PH_PACKAGES` — comma-separated packages installed from the npm registry via pnpm before start.
  - `PH_REGISTRY_PACKAGES` — comma-separated packages loaded over HTTP from `PH_REGISTRY_URL` at start.

  ```yaml
  services:
    switchboard:
      image: cr.vetra.io/powerhouse-inc-powerhouse/switchboard:dev
      environment:
        - PH_PACKAGES=@powerhousedao/todo-demo-package,@powerhousedao/another-package
  ```

## Image Architecture

The images are built from a single multi-stage `docker/Dockerfile` (build args: `TAG` — the release tag, and `GIT_SHA`). A shared base stage installs `ph-cmd` for the matching release channel and initializes a project; each target then builds what it needs.

### Connect Image

The Connect target is **nginx:alpine** serving the static SPA — the frontend is built at **image build time** (`ph connect build`), not at container start. It runs as the non-root `nginx` user (UID 101), so pods can set `runAsNonRoot: true`.

At startup, the entrypoint script:

1. Renders the nginx config from `nginx.conf.template` via envsubst (`PORT`, `PH_CONNECT_BASE_PATH`)
2. Deep-merges `PH_CONNECT_CONFIG_JSON` into the dist `powerhouse.config.json` (operator-wins)
3. Re-syncs the Content-Security-Policy registry origin in `index.html` to the effective `packageRegistryUrl`
4. Validates the config (`nginx -t`) and starts nginx

### Switchboard Image

The Switchboard target is **Node.js 24 (Alpine)** with pnpm and the `@powerhousedao/switchboard` package installed at image build time from the npm registry at the requested release tag.

At startup, the entrypoint script:

1. Installs any packages listed in `PH_PACKAGES` (pnpm)
2. Runs the reactor Postgres migrations (Kysely) if `PH_REACTOR_DATABASE_URL` points at a Postgres URL — PGlite migrations run automatically inside the server
3. Starts the Switchboard server via Node.js

## Production Considerations

### Using Specific Version Tags

For production deployments, always use specific version tags instead of the floating `latest` / `dev` / `rc` / `staging` tags:

```yaml
services:
  connect:
    image: cr.vetra.io/powerhouse-inc-powerhouse/connect:v6.2.1
  switchboard:
    image: cr.vetra.io/powerhouse-inc-powerhouse/switchboard:v6.2.1
```

### Database Persistence

For production, ensure your PostgreSQL data is persisted using volumes:

```yaml
services:
  postgres:
    image: postgres:16.1
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=your-secure-password
      - POSTGRES_DB=powerhouse
      - POSTGRES_USER=powerhouse

volumes:
  postgres_data:
```

### Health Checks

The provided compose files include health checks for all services: PostgreSQL (`pg_isready`), Connect (`/health` on nginx), and Switchboard (`/health` on the API). Switchboard only starts after the database is healthy, preventing connection errors during startup.

### Network Security

The example configuration binds ports to `127.0.0.1` only:

```yaml
ports:
  - "127.0.0.1:3000:3001"
```

This prevents direct external access. In production, use a reverse proxy (like Nginx or Traefik) to:

- Terminate SSL/TLS
- Handle load balancing
- Provide additional security headers

### Environment File

For better security, use a `.env` file instead of hardcoding credentials:

```bash
# .env
POSTGRES_PASSWORD=your-secure-password
PH_REACTOR_DATABASE_URL=postgres://powerhouse:your-secure-password@postgres:5432/powerhouse
PH_SWITCHBOARD_DATABASE_URL=postgres://powerhouse:your-secure-password@postgres:5432/powerhouse
```

```yaml
services:
  switchboard:
    image: cr.vetra.io/powerhouse-inc-powerhouse/switchboard:latest
    env_file:
      - .env
```

## Troubleshooting

### Container Won't Start

Check the logs for errors:

```bash
docker compose logs connect
docker compose logs switchboard
```

### Database Connection Issues

Ensure the database is ready before services start:

```bash
docker compose logs postgres
```

Verify the `PH_REACTOR_DATABASE_URL` / `PH_SWITCHBOARD_DATABASE_URL` format:

```
postgres://user:password@host:port/database
```

### Package Installation Fails

If custom packages fail to install, check:

1. Package name is correct
2. Network connectivity from container
3. Container has access to npm registry

### Permission Issues

The Connect container runs as the non-root `nginx` user (UID 101). If you bind-mount files or volumes into it, make sure they are readable by UID 101:

```bash
# Fix ownership for a bind-mounted Connect config
sudo chown -R 101:101 ./my-config
```

Switchboard runs as root, so host-side volume permissions are less restrictive there.

## Building Custom Images

You can extend the official images for custom deployments:

```dockerfile
# Switchboard: add server-side packages at build time
FROM cr.vetra.io/powerhouse-inc-powerhouse/switchboard:latest
RUN pnpm add --shamefully-hoist @powerhousedao/my-custom-package
```

```dockerfile
# Connect: the image is plain nginx serving the pre-built SPA (no Node.js,
# no ph CLI). Customization means overriding the runtime config via
# PH_CONNECT_CONFIG_JSON at deploy time, or swapping the served files/config:
FROM cr.vetra.io/powerhouse-inc-powerhouse/connect:latest
COPY my-nginx.conf.template /etc/nginx/nginx.conf.template
```

Build and push your custom image:

```bash
docker build -t my-registry/my-switchboard:latest .
docker push my-registry/my-switchboard:latest
```

## Next Steps

- Learn about [Environment Configuration](./04-ConfigureEnvironment.md) for more detailed setup options
- Explore [Publishing Your Project](./02-PublishYourProject.md) to create your own packages
- Check the [Setup Environment Guide](./03-SetupEnvironment.md) for VM-based deployments
