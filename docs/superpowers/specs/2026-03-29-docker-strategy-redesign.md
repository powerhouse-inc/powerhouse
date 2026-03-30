# Docker Strategy Redesign: Runtime Package Loading

## Context

The team implemented dynamic importing of packages at runtime via an HTTP registry. Packages no longer need to be installed at build time — the application loads them at runtime. Additionally, `document-drive` and Prisma have been fully removed from the stack. Database operations now use Kysely with PostgreSQL or PGlite.

This means the Docker images can be drastically simplified: no build-time package installation, no Prisma, no document-drive.

## Goals

- Simplify Connect and Switchboard Dockerfiles to a minimum
- Build Docker images as part of the release pipeline (after successful publish)
- Push to Harbor (`cr.vetra.io`) only
- Accept runtime env vars instead of build-time `PH_PACKAGES`
- Remove the Heroku deploy workflow entirely

## Design

### Single Multi-Stage Dockerfile with Build Targets

One Dockerfile with a shared base stage and two target stages, built via `--target connect` or `--target switchboard`.

```
┌─────────────────────────┐
│  base                   │  node:24-alpine + pnpm + ph-cmd@TAG
│                         │  ph init project
├─────────────────────────┤
│  connect-build          │  base → ph connect build (vanilla, no packages)
├─────────────────────────┤
│  connect                │  nginx:alpine + static dist from connect-build
│  (target)               │  entrypoint: envsubst + nginx
├─────────────────────────┤
│  switchboard            │  node:24-alpine + ph-cmd@TAG + project from base
│  (target)               │  entrypoint: ph migrate + ph switchboard
└─────────────────────────┘
```

### Dockerfile Location

`docker/Dockerfile` at the repo root.

### Connect Target

**Build stages:**

1. `base`: Install node, pnpm, ph-cmd. Run `ph init project`.
2. `connect-build`: Run `ph connect build --base $PH_CONNECT_BASE_PATH` (no packages).
3. `connect` (final): `nginx:alpine`, copy static dist, copy nginx config template and entrypoint.

**Runtime:** Nginx serves pre-built static SPA. Packages are loaded in the browser at runtime from the registry via `BrowserPackageManager`.

**Entrypoint:** `envsubst` on nginx config template, then `nginx -g "daemon off;"` (same as current).

### Switchboard Target

**Build stages:**

1. `base`: Install node, pnpm, ph-cmd. Run `ph init project`.
2. `switchboard` (final): `node:24-alpine` with pnpm + ph-cmd. Copy project from base.

**Runtime:** `ph switchboard` starts the server. Packages loaded via `HttpPackageLoader` from the registry.

**Entrypoint:**

```sh
#!/bin/sh
set -e
if [ -n "$PH_REACTOR_DATABASE_URL" ] && [ "$SKIP_DB_MIGRATIONS" != "true" ]; then
    ph migrate
fi
exec ph switchboard --port ${PORT:-3000}
```

### Runtime Environment Variables

| Variable                  | Connect | Switchboard | Description                                      |
| ------------------------- | ------- | ----------- | ------------------------------------------------ |
| `PORT`                    | yes     | yes         | Listen port (connect: nginx, switchboard: node)  |
| `PH_CONNECT_BASE_PATH`    | yes     | -           | Nginx base path for SPA routing                  |
| `PH_REGISTRY_URL`         | -       | yes         | HTTP registry URL for dynamic package loading    |
| `PH_REGISTRY_PACKAGES`    | -       | yes         | Comma-separated package names to load at startup |
| `PH_REACTOR_DATABASE_URL` | -       | yes         | PostgreSQL URL (optional, defaults to PGlite)    |
| `SKIP_DB_MIGRATIONS`      | -       | yes         | Skip running migrations on startup               |

### CI/CD Changes

#### `publish-docker-images.yml`

Add `connect` and `switchboard` to the build matrix:

```yaml
matrix:
  include:
    - image: registry
      context: ./packages/registry
    - image: academy
      context: ./apps/academy
    - image: connect
      context: .
      dockerfile: docker/Dockerfile
      target: connect
    - image: switchboard
      context: .
      dockerfile: docker/Dockerfile
      target: switchboard
```

For connect and switchboard:

- Push to **Harbor only** (not GHCR)
- Use `target` parameter in `docker/build-push-action`
- Pass `TAG` build arg (matching release version)
- Tag with version tag + channel alias (`dev`, `staging`, `latest`)

#### Delete `deploy-powerhouse.yml`

The Heroku deploy workflow is removed entirely. Connect and switchboard are no longer deployed to Heroku.

#### Optionally add k8s-hosting update jobs

Similar to the existing `update-k8s-academy` and `update-k8s-registry` jobs, add jobs to update connect and switchboard image tags in the k8s-hosting repo.

### What Gets Removed

- `apps/connect/Dockerfile` — replaced by shared `docker/Dockerfile`
- `apps/connect/heroku/Dockerfile` — Heroku is gone
- `apps/connect/heroku/` directory — all Heroku-specific files
- `apps/switchboard/Dockerfile` — replaced by shared `docker/Dockerfile`
- `apps/switchboard/entrypoint.sh` — replaced by new minimal entrypoint
- `.github/workflows/deploy-powerhouse.yml` — Heroku deploy workflow
- All Prisma references in Docker-related files
- All build-time `PH_PACKAGES` installation in Dockerfiles

### What Stays

- `apps/connect/nginx.conf` — moved/copied to `docker/` for the shared Dockerfile
- `apps/connect/docker-entrypoint.sh` — moved/adapted to `docker/`
- `publish-docker-images.yml` — extended with new matrix entries
- `release-branch.yml` — unchanged (already calls `publish-docker-images.yml`)

### Files to Create

1. `docker/Dockerfile` — multi-stage Dockerfile with connect and switchboard targets
2. `docker/nginx.conf.template` — nginx config template (from existing `apps/connect/nginx.conf`)
3. `docker/connect-entrypoint.sh` — connect entrypoint (from existing)
4. `docker/switchboard-entrypoint.sh` — new minimal switchboard entrypoint

### Files to Modify

1. `.github/workflows/publish-docker-images.yml` — add connect/switchboard to matrix, Harbor-only for those entries

### Files to Delete

1. `.github/workflows/deploy-powerhouse.yml`
2. `apps/connect/Dockerfile`
3. `apps/connect/heroku/Dockerfile`
4. `apps/connect/heroku/heroku-entrypoint.sh` (if exists)
5. `apps/switchboard/Dockerfile`
6. `apps/switchboard/entrypoint.sh`
