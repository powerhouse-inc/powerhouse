# Docker deployment guide

## Introduction

Powerhouse projects include Docker support out of the box. When you create a new project with `ph init`, all necessary Docker files are automatically generated, allowing you to build and deploy containerized versions of your Connect frontend and Switchboard backend.

Docker deployment is ideal for:

- **Production environments** that require consistent, reproducible deployments
- **Development teams** that want to share a common environment
- **CI/CD pipelines** that need automated testing and deployment
- **Cloud platforms** like AWS ECS, Google Cloud Run, or Kubernetes

:::tip Deployment Options
This guide covers **Docker-based deployment**. If you prefer **traditional VM/server deployment** with direct installation, see the [Setup Environment Guide](./03-SetupEnvironment.md).

**Choose Docker if:** You want containerized workflows, consistent environments, or are deploying to cloud platforms.
**Choose Direct Installation if:** You need maximum performance, want full control, or are setting up a dedicated server.
:::

## Generated Docker Files

When you run `ph init my-project`, the following Docker-related files are automatically created:

```
my-project/
├── Dockerfile                      # Multi-stage Dockerfile for Connect and Switchboard
└── docker/
    ├── nginx.conf                  # Nginx configuration template for Connect
    ├── connect-entrypoint.sh       # Startup script for Connect container
    └── switchboard-entrypoint.sh   # Startup script for Switchboard container
```

## Building Docker Images

The generated Dockerfile uses multi-stage builds to create two separate images:

### Build the Connect Image (Frontend)

```bash
docker build --target connect -t my-registry/my-project/connect:latest .
```

### Build the Switchboard Image (Backend)

```bash
docker build --target switchboard -t my-registry/my-project/switchboard:latest .
```

### Build Arguments

The Dockerfile accepts several build arguments:

| Argument               | Description                                                                | Default            |
| ---------------------- | -------------------------------------------------------------------------- | ------------------ |
| `TAG`                  | Powerhouse package version tag (latest, dev, staging, or specific version) | `latest`           |
| `PH_CONNECT_BASE_PATH` | Base URL path for Connect                                                  | `/`                |
| `PACKAGE_NAME`         | Your published package name to install                                     | (uses local build) |

Example with build arguments:

```bash
docker build --target connect \
  --build-arg TAG=v1.0.0 \
  --build-arg PH_CONNECT_BASE_PATH=/app \
  --build-arg PACKAGE_NAME=@myorg/my-package \
  -t my-registry/my-project/connect:v1.0.0 .
```

## Running with Docker Compose

Create a `docker-compose.yml` file to run your application stack:

```yaml
name: my-project

services:
  connect:
    build:
      context: .
      target: connect
      args:
        TAG: latest
        PH_CONNECT_BASE_PATH: /
    environment:
      - PORT=3001
      - PH_CONNECT_BASE_PATH=/
    ports:
      - "127.0.0.1:3000:3001"
    networks:
      - app_network
    depends_on:
      switchboard:
        condition: service_healthy

  switchboard:
    build:
      context: .
      target: switchboard
      args:
        TAG: latest
    environment:
      - PORT=3000
      - DATABASE_URL=postgres://postgres:postgres@postgres:5432/postgres
    ports:
      - "127.0.0.1:4000:3000"
    networks:
      - app_network
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 3s
      start_period: 30s
      retries: 3

  postgres:
    image: postgres:16-alpine
    ports:
      - "127.0.0.1:5432:5432"
    environment:
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=postgres
      - POSTGRES_USER=postgres
    networks:
      - app_network
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 3

networks:
  app_network:
    name: app_network

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

## Environment Variables

### Connect Environment Variables

| Variable               | Description                       | Default |
| ---------------------- | --------------------------------- | ------- |
| `PORT`                 | Port the server listens on        | `3001`  |
| `PH_CONNECT_BASE_PATH` | Base URL path for the application | `/`     |

#### Feature Flags

| Variable                                            | Description                        | Default   |
| --------------------------------------------------- | ---------------------------------- | --------- |
| `PH_CONNECT_DEFAULT_DRIVES_URL`                     | Default drives URL to load         | `""`      |
| `PH_CONNECT_ENABLED_EDITORS`                        | Enabled editor types (`*` for all) | `"*"`     |
| `PH_CONNECT_DISABLED_EDITORS`                       | Disabled editor types              | `""`      |
| `PH_CONNECT_PUBLIC_DRIVES_ENABLED`                  | Enable public drives               | `"true"`  |
| `PH_CONNECT_CLOUD_DRIVES_ENABLED`                   | Enable cloud drives                | `"true"`  |
| `PH_CONNECT_LOCAL_DRIVES_ENABLED`                   | Enable local drives                | `"true"`  |
| `PH_CONNECT_SEARCH_BAR_ENABLED`                     | Enable search bar                  | `"false"` |
| `PH_CONNECT_DISABLE_ADD_PUBLIC_DRIVES`              | Disable adding public drives       | `"false"` |
| `PH_CONNECT_DISABLE_ADD_CLOUD_DRIVES`               | Disable adding cloud drives        | `"false"` |
| `PH_CONNECT_DISABLE_ADD_LOCAL_DRIVES`               | Disable adding local drives        | `"false"` |
| `PH_CONNECT_DISABLE_DELETE_PUBLIC_DRIVES`           | Disable deleting public drives     | `"false"` |
| `PH_CONNECT_DISABLE_DELETE_CLOUD_DRIVES`            | Disable deleting cloud drives      | `"false"` |
| `PH_CONNECT_DISABLE_DELETE_LOCAL_DRIVES`            | Disable deleting local drives      | `"false"` |
| `PH_CONNECT_HIDE_DOCUMENT_MODEL_SELECTION_SETTINGS` | Hide document model selection      | `"true"`  |

#### Renown Authentication

| Variable                       | Description                       | Default                    |
| ------------------------------ | --------------------------------- | -------------------------- |
| `PH_CONNECT_RENOWN_URL`        | Renown authentication service URL | `"https://auth.renown.id"` |
| `PH_CONNECT_RENOWN_NETWORK_ID` | Renown network identifier         | `"eip155"`                 |
| `PH_CONNECT_RENOWN_CHAIN_ID`   | Renown chain ID                   | `1`                        |

### Switchboard Environment Variables

#### Core Configuration

| Variable             | Description                            | Default    |
| -------------------- | -------------------------------------- | ---------- |
| `PORT`               | Port the server listens on             | `3000`     |
| `DATABASE_URL`       | PostgreSQL or SQLite connection string | `"dev.db"` |
| `SKIP_DB_MIGRATIONS` | Skip database migrations on startup    | `"false"`  |

#### Authentication

| Variable       | Description                                       | Default   |
| -------------- | ------------------------------------------------- | --------- |
| `AUTH_ENABLED` | Enable authentication                             | `"false"` |
| `ADMINS`       | Comma-separated list of admin wallet addresses    | `""`      |
| `USERS`        | Comma-separated list of user wallet addresses     | `""`      |
| `GUESTS`       | Comma-separated list of guest wallet addresses    | `""`      |
| `FREE_ENTRY`   | Allow unauthenticated access when auth is enabled | `"false"` |

#### Error Tracking & Monitoring

| Variable                   | Description                                             | Default |
| -------------------------- | ------------------------------------------------------- | ------- |
| `SENTRY_DSN`               | Sentry DSN for error tracking                           | `""`    |
| `SENTRY_ENV`               | Sentry environment name (e.g., "production", "staging") | `""`    |
| `PYROSCOPE_SERVER_ADDRESS` | Pyroscope server address for performance profiling      | `""`    |

## Image Architecture

### Connect Image

The Connect image is based on Alpine Linux with Nginx and includes:

- Nginx with gzip compression
- Optimized caching for static assets
- Health check endpoint at `/health`
- Environment variable substitution for runtime configuration

At startup, the entrypoint script:

1. Substitutes environment variables in the nginx configuration
2. Validates the nginx configuration
3. Starts Nginx to serve the built frontend

### Switchboard Image

The Switchboard image is based on Node.js 24 Alpine and includes:

- pnpm package manager
- The `ph-cmd` CLI tool
- Prisma CLI for database migrations

At startup, the entrypoint script:

1. Regenerates Prisma client for the current platform
2. Runs database migrations (if using PostgreSQL and not skipped)
3. Starts the Switchboard server

## Production Considerations

### Using Specific Version Tags

For production deployments, use specific version tags when building:

```bash
docker build --target connect --build-arg TAG=v1.0.0 -t my-registry/connect:v1.0.0 .
docker build --target switchboard --build-arg TAG=v1.0.0 -t my-registry/switchboard:v1.0.0 .
```

### Database Persistence

Ensure your PostgreSQL data is persisted using volumes:

```yaml
services:
  postgres:
    image: postgres:16-alpine
    volumes:
      - postgres_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_PASSWORD=your-secure-password
      - POSTGRES_DB=powerhouse
      - POSTGRES_USER=powerhouse

volumes:
  postgres_data:
```

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
DATABASE_URL=postgres://powerhouse:your-secure-password@postgres:5432/powerhouse
```

```yaml
services:
  switchboard:
    build:
      context: .
      target: switchboard
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

### Build Failures

If the build fails, check:

1. Docker has enough memory allocated (at least 4GB recommended)
2. Network connectivity for downloading dependencies
3. Build arguments are correctly specified

### Permission Issues

If you encounter permission issues with volumes:

```bash
# Fix ownership
sudo chown -R 1000:1000 ./data
```

## CI/CD Integration

The generated `.github/workflows/sync-and-publish.yml` workflow automatically builds and pushes Docker images when you release your package. The workflow handles:

- Syncing Powerhouse dependencies when new versions are released
- Publishing your package to npm
- Building and pushing Docker images to your configured registry

### Required GitHub Secrets

To enable the full CI/CD pipeline, configure these secrets in your GitHub repository settings (**Settings > Secrets and variables > Actions**):

| Secret             | Required | Description                                                                   |
| ------------------ | -------- | ----------------------------------------------------------------------------- |
| `NPM_ACCESS_TOKEN` | Yes      | npm access token for publishing packages. Create at npmjs.com > Access Tokens |
| `DOCKER_USERNAME`  | Yes      | Username for the Docker registry                                              |
| `DOCKER_PASSWORD`  | Yes      | Password for the Docker registry                                              |
| `DOCKER_REGISTRY`  | No       | Docker registry URL. Defaults to `cr.vetra.io` if not set                     |
| `DOCKER_PROJECT`   | No       | Custom Docker project name. Defaults to repository name if not set            |

:::tip Getting Docker Registry Credentials
Contact the Powerhouse team to get credentials for the default Vetra Docker registry (cr.vetra.io). If you prefer to use a different registry (e.g., ghcr.io), set the `DOCKER_REGISTRY` secret accordingly.
:::

### Setting Up Secrets

1. Go to your GitHub repository
2. Navigate to **Settings > Secrets and variables > Actions**
3. Click **New repository secret**
4. Add each secret with its corresponding value

### Workflow Triggers

The workflow runs automatically in two scenarios:

1. **Repository dispatch**: When the Powerhouse monorepo releases a new version, it triggers downstream projects to sync and rebuild
2. **Manual dispatch**: You can manually trigger the workflow from the GitHub Actions tab

### Manual Workflow Options

When triggering manually, you can configure:

| Input         | Description                            | Default   |
| ------------- | -------------------------------------- | --------- |
| `channel`     | Release channel (dev, staging, latest) | `staging` |
| `version`     | Specific Powerhouse version to sync to | (latest)  |
| `dry-run`     | Skip publishing, only test the build   | `false`   |
| `skip-docker` | Skip Docker build and push             | `false`   |

### Docker Image Tags

The workflow pushes images to your configured registry (default: `cr.vetra.io`) with the following tag patterns:

- `<registry>/<project>/connect:v<version>`
- `<registry>/<project>/connect:<channel>` (dev, staging, or latest)
- `<registry>/<project>/switchboard:v<version>`
- `<registry>/<project>/switchboard:<channel>` (dev, staging, or latest)

## Next Steps

- Learn about [Environment Configuration](./04-ConfigureEnvironment.md) for more detailed setup options
- Explore [Publishing Your Project](./02-PublishYourProject.md) to create your own packages
- Check the [Setup Environment Guide](./03-SetupEnvironment.md) for VM-based deployments
