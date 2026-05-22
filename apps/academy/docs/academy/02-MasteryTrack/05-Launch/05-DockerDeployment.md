# Docker deployment guide

## Introduction

Powerhouse provides official Docker images for deploying your applications in containerized environments. This guide covers the available Docker images, how to use them with Docker Compose, and the environment variables you can configure.

Docker deployment is ideal for:

- **Production environments** that require consistent, reproducible deployments
- **Development teams** that want to share a common environment
- **CI/CD pipelines** that need automated testing and deployment
- **Cloud platforms** like AWS ECS, Google Cloud Run, or Kubernetes

:::tip Deployment Options
This guide covers **Docker-based deployment**. If you prefer **traditional VM/server deployment** with direct installation, see the [Setup Environment Guide](./03-SetupEnvironment.md).

**Choose Docker if:** You want the fastest path to production, prefer containerized workflows, or are deploying to cloud platforms.
**Choose Direct Installation if:** You need maximum performance, want full control, or are setting up a dedicated server.
:::

## Available Docker Images

Powerhouse publishes three official Docker images to the GitHub Container Registry (ghcr.io):

### 1. Connect

The Connect image provides the Powerhouse web application frontend with an embedded Nginx server.

```
ghcr.io/powerhouse-inc/powerhouse/connect
```

**Available tags:**

- `latest` - Latest stable release
- `dev` - Development builds
- `staging` - Staging builds
- `vX.Y.Z` - Specific version tags (e.g., `v1.0.0`)

### 2. Switchboard

The Switchboard image provides the backend API server that handles document synchronization and GraphQL endpoints.

```
ghcr.io/powerhouse-inc/powerhouse/switchboard
```

**Available tags:**

- `latest` - Latest stable release
- `dev` - Development builds
- `staging` - Staging builds
- `vX.Y.Z` - Specific version tags (e.g., `v1.0.0`)

### 3. Academy

The Academy image provides the documentation website.

```
ghcr.io/powerhouse-inc/powerhouse/academy
```

**Available tags:**

- `latest` - Latest stable release
- `dev` - Development builds
- `staging` - Staging builds
- `vX.Y.Z` - Specific version tags (e.g., `v1.0.0`)

## Quick Start with Docker Compose

The easiest way to run Powerhouse locally is using Docker Compose. Create a `docker-compose.yml` file or use the one provided in the repository:

```yaml
name: powerhouse

services:
  connect:
    image: ghcr.io/powerhouse-inc/powerhouse/connect:dev
    environment:
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres
      - BASE_PATH=/
    ports:
      - "127.0.0.1:3000:4000"
    networks:
      - powerhouse_network
    depends_on:
      postgres:
        condition: service_healthy

  switchboard:
    image: ghcr.io/powerhouse-inc/powerhouse/switchboard:dev
    environment:
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres
    ports:
      - "127.0.0.1:4000:4001"
    networks:
      - powerhouse_network
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:16.1
    ports:
      - "127.0.0.1:5444:5432"
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=postgres
      - POSTGRES_USER=postgres
    networks:
      - powerhouse_network
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 3

networks:
  powerhouse_network:
    name: powerhouse_network
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
2. **Set env vars on the container**. The entrypoint reads them at container start and seeds the dist `powerhouse.config.json` (set-if-absent — a mounted file's values always win).
3. **Edit the file at build time** via `ph connect build --json '{...}'` or individual `--flag`s, baking the values into the image.

For the full configuration model, precedence ladder, and the complete list of `connect.*` fields, see the [Configure Environment](./04-ConfigureEnvironment.md) guide.

### Connect container env vars

Connect's SPA reads runtime configuration from `/powerhouse.config.json`, never from env vars at runtime. The container entrypoint, however, can translate operator-supplied env vars into edits to that file at startup (set-if-absent) — equivalent to pre-running `ph connect config --<field>` on the dist file. The SPA then reads the file as usual.

#### Container shape and secrets

| Variable                | Description                                                                       | Default  |
| ----------------------- | --------------------------------------------------------------------------------- | -------- |
| `PORT`                  | Port the nginx server listens on                                                  | `3001`   |
| `PH_CONNECT_BASE_PATH`  | nginx base URL path (also written into `connect.app.basePath` by the entrypoint)  | `/`      |
| `PH_CONNECT_SENTRY_DSN` | Sentry DSN for error tracking                                                     | `""`     |
| `PH_CONNECT_SENTRY_ENV` | Sentry environment name                                                           | `""`     |
| `DATABASE_URL`          | PostgreSQL connection string (for Switchboard, not Connect)                       | Required |

#### Entrypoint config edits (set-if-absent)

If set, these env vars cause the container entrypoint to write the corresponding value into the dist `powerhouse.config.json` before nginx starts. They behave as set-if-absent: a value already present in the mounted/baked config file is never overwritten.

| Variable                                  | JSON path                                            | Notes                              |
| ----------------------------------------- | ---------------------------------------------------- | ---------------------------------- |
| `PH_CONNECT_BASE_PATH`                    | `connect.app.basePath`                               | also drives nginx routing          |
| `PH_CONNECT_LOG_LEVEL`                    | `connect.app.logLevel`                               |                                    |
| `PH_CONNECT_EXTERNAL_PACKAGES_DISABLED`   | `connect.packages.externalEnabled`                   | inverted                           |
| `PH_CONNECT_DISABLE_ADD_DRIVE`            | `connect.drives.allowAddDrive`                       | inverted                           |
| `PH_CONNECT_DEFAULT_DRIVES_URL`           | `connect.drives.defaultDrives[]`                     | comma-separated URLs               |
| `PH_CONNECT_DRIVES_PRESERVE_STRATEGY`     | `connect.drives.preserveStrategy`                    |                                    |
| `PH_CONNECT_PUBLIC_DRIVES_ENABLED`        | `connect.drives.sections.remote.enabled`             |                                    |
| `PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES`    | `connect.drives.sections.remote.allowAdd`            | inverted                           |
| `PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES` | `connect.drives.sections.remote.allowDelete`         | inverted                           |
| `PH_CONNECT_LOCAL_DRIVES_ENABLED`         | `connect.drives.sections.local.enabled`              |                                    |
| `PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES`     | `connect.drives.sections.local.allowAdd`             | inverted                           |
| `PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES`  | `connect.drives.sections.local.allowDelete`          | inverted                           |
| `PH_CONNECT_RENOWN_URL`                   | `connect.renown.url`                                 |                                    |
| `PH_CONNECT_RENOWN_NETWORK_ID`            | `connect.renown.networkId`                           |                                    |
| `PH_CONNECT_RENOWN_CHAIN_ID`              | `connect.renown.chainId`                             |                                    |

For any other `connect.*` field (branding, etc.), edit `powerhouse.config.json` directly before building the image, or run `ph connect config --<field>` against the mounted dist file.

### Switchboard Environment Variables

#### Core Configuration

| Variable                      | Description                                            | Default    |
| ----------------------------- | ------------------------------------------------------ | ---------- |
| `PORT`                        | Port the server listens on                             | `3000`     |
| `PH_SWITCHBOARD_PORT`         | Alias for PORT                                         | `$PORT`    |
| `DATABASE_URL`                | PostgreSQL or SQLite connection string                 | `"dev.db"` |
| `PH_SWITCHBOARD_DATABASE_URL` | Alias for DATABASE_URL                                 | `"dev.db"` |
| `BASE_PATH`                   | Base URL path for the API                              | `"/"`      |
| `PH_PACKAGES`                 | Comma-separated list of packages to install at startup | `""`       |

#### Authentication

| Variable                       | Description                                                  | Default   |
| ------------------------------ | ------------------------------------------------------------ | --------- |
| `AUTH_ENABLED`                 | Enable authentication                                        | `"false"` |
| `ADMINS`                       | Comma-separated list of admin wallet addresses (full access) | `""`      |
| `DEFAULT_PROTECTION`           | Make all new documents protected by default                  | `"false"` |
| `DOCUMENT_PERMISSIONS_ENABLED` | Enable per-document permission management                    | `"false"` |

#### Error Tracking & Monitoring

| Variable                   | Description                                             | Default |
| -------------------------- | ------------------------------------------------------- | ------- |
| `SENTRY_DSN`               | Sentry DSN for error tracking                           | `""`    |
| `SENTRY_ENV`               | Sentry environment name (e.g., "production", "staging") | `""`    |
| `PYROSCOPE_SERVER_ADDRESS` | Pyroscope server address for performance profiling      | `""`    |

## Installing Custom Packages

Connect loads custom packages via the `PH_REGISTRY_PACKAGES` environment variable (written to a registry config at startup). Switchboard installs packages via `PH_PACKAGES`.

```yaml
services:
  connect:
    image: ghcr.io/powerhouse-inc/powerhouse/connect:dev
    environment:
      - PH_REGISTRY_PACKAGES=@powerhousedao/todo-demo-package,@powerhousedao/another-package
```

Packages are installed using the `ph install` command before the service starts.

## Image Architecture

### Connect Image

The Connect image is based on Alpine Linux and includes:

- Node.js and pnpm
- Nginx with Brotli compression
- The `ph-cmd` CLI tool
- A pre-initialized Powerhouse project

At startup, the entrypoint script:

1. Loads any packages specified in `PH_REGISTRY_PACKAGES`
2. Builds the Connect frontend with `ph connect build`
3. Configures and starts Nginx to serve the built files

### Switchboard Image

The Switchboard image is based on Node.js 24 and includes:

- pnpm package manager
- The `ph-cmd` CLI tool
- Prisma CLI for database migrations
- A pre-initialized Powerhouse project

At startup, the entrypoint script:

1. Installs any packages specified in `PH_PACKAGES`
2. Runs Prisma database migrations (if `PH_REACTOR_DATABASE_URL` is set)
3. Starts the Switchboard server via Node.js

## Production Considerations

### Using Specific Version Tags

For production deployments, always use specific version tags instead of `latest` or `dev`:

```yaml
services:
  connect:
    image: ghcr.io/powerhouse-inc/powerhouse/connect:v1.0.0
  switchboard:
    image: ghcr.io/powerhouse-inc/powerhouse/switchboard:v1.0.0
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

The provided docker-compose.yml includes health checks for PostgreSQL. Services wait for the database to be healthy before starting, preventing connection errors during startup.

### Network Security

The example configuration binds ports to `127.0.0.1` only:

```yaml
ports:
  - "127.0.0.1:3000:4000"
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
DATABASE_URL=postgres://powerhouse:your-secure-password@postgres:5432/powerhouse
```

```yaml
services:
  switchboard:
    image: ghcr.io/powerhouse-inc/powerhouse/switchboard:latest
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

Verify the `DATABASE_URL` format:

```
postgres://user:password@host:port/database
```

### Package Installation Fails

If custom packages fail to install, check:

1. Package name is correct
2. Network connectivity from container
3. Container has access to npm registry

### Permission Issues

If you encounter permission issues with volumes:

```bash
# Fix ownership
sudo chown -R 1000:1000 ./data
```

## Building Custom Images

You can extend the official images for custom deployments:

```dockerfile
FROM ghcr.io/powerhouse-inc/powerhouse/connect:latest

# Install additional packages at build time
RUN ph install @powerhousedao/my-custom-package

# Add custom configuration
COPY my-nginx.conf /etc/nginx/nginx.conf.template
```

Build and push your custom image:

```bash
docker build -t my-registry/my-connect:latest .
docker push my-registry/my-connect:latest
```

## Next Steps

- Learn about [Environment Configuration](./04-ConfigureEnvironment.md) for more detailed setup options
- Explore [Publishing Your Project](./02-PublishYourProject.md) to create your own packages
- Check the [Setup Environment Guide](./03-SetupEnvironment.md) for VM-based deployments
