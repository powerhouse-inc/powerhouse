# Docker Strategy Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current per-app Dockerfiles and Heroku deploy with a single multi-stage Dockerfile (build targets for connect and switchboard), pushed to Harbor as part of the release pipeline.

**Architecture:** One `docker/Dockerfile` with a shared `base` stage (node + pnpm + ph-cmd), a `connect` target (nginx serving a vanilla SPA build), and a `switchboard` target (node running ph-cmd). Packages are loaded at runtime — not at build time. The Heroku deploy workflow is deleted; `publish-docker-images.yml` is extended with the two new matrix entries (Harbor only).

**Tech Stack:** Docker multi-stage builds, nginx:alpine, node:24-alpine, pnpm, ph-cmd, GitHub Actions

**Spec:** `docs/superpowers/specs/2026-03-29-docker-strategy-redesign.md`

**Commit rule:** Do NOT include Co-Authored-By lines in commits.

---

## File Structure

### Create

| File                               | Responsibility                                                                                |
| ---------------------------------- | --------------------------------------------------------------------------------------------- |
| `docker/Dockerfile`                | Multi-stage Dockerfile with `base`, `connect-build`, `connect`, and `switchboard` targets     |
| `docker/nginx.conf.template`       | Nginx config template for Connect (with `${PORT}` and `${PH_CONNECT_BASE_PATH}` substitution) |
| `docker/connect-entrypoint.sh`     | Entrypoint for Connect: envsubst + nginx                                                      |
| `docker/switchboard-entrypoint.sh` | Entrypoint for Switchboard: optional migrate + ph switchboard                                 |

### Modify

| File                                          | Change                                                                                                            |
| --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `.github/workflows/publish-docker-images.yml` | Add `connect` and `switchboard` to build matrix (Harbor only), support `dockerfile` and `target` per matrix entry |

### Delete

| File                                             | Reason                                             |
| ------------------------------------------------ | -------------------------------------------------- |
| `.github/workflows/deploy-powerhouse.yml`        | Heroku deploy — no longer needed                   |
| `apps/connect/Dockerfile`                        | Replaced by `docker/Dockerfile` connect target     |
| `apps/connect/docker-entrypoint.sh`              | Replaced by `docker/connect-entrypoint.sh`         |
| `apps/connect/nginx.conf`                        | Replaced by `docker/nginx.conf.template`           |
| `apps/connect/heroku/Dockerfile`                 | Heroku — removed                                   |
| `apps/connect/heroku/heroku-entrypoint.sh`       | Heroku — removed                                   |
| `apps/connect/heroku/Procfile`                   | Heroku — removed                                   |
| `apps/connect/heroku/config/nginx.conf.template` | Heroku — removed                                   |
| `apps/switchboard/Dockerfile`                    | Replaced by `docker/Dockerfile` switchboard target |
| `apps/switchboard/entrypoint.sh`                 | Replaced by `docker/switchboard-entrypoint.sh`     |

---

## Task 1: Create the multi-stage Dockerfile

**Files:**

- Create: `docker/Dockerfile`

- [ ] **Step 1: Create `docker/Dockerfile`**

```dockerfile
# ============================================================
# Base stage: node + pnpm + ph-cmd + initialized project
# ============================================================
FROM node:24-alpine AS base

WORKDIR /app

RUN apk add --no-cache python3 make g++ git bash \
    && ln -sf /usr/bin/python3 /usr/bin/python

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm config set @jsr:registry https://npm.jsr.io

ARG TAG=latest
RUN pnpm add -g ph-cmd@$TAG prettier

RUN case "$TAG" in \
        *dev*) ph init project --dev --package-manager pnpm ;; \
        *staging*) ph init project --staging --package-manager pnpm ;; \
        *) ph init project --package-manager pnpm ;; \
    esac

# ============================================================
# Connect build stage: build vanilla SPA (no packages)
# ============================================================
FROM base AS connect-build

ARG PH_CONNECT_BASE_PATH="/"

WORKDIR /app/project
RUN ph connect build --base ${PH_CONNECT_BASE_PATH}

# ============================================================
# Connect target: nginx serving static files
# ============================================================
FROM nginx:alpine AS connect

RUN apk add --no-cache gettext

COPY docker/nginx.conf.template /etc/nginx/nginx.conf.template
COPY --from=connect-build /app/project/.ph/connect-build/dist /var/www/html/project
COPY docker/connect-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV PORT=3001
ENV PH_CONNECT_BASE_PATH="/"

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
    CMD wget -q --spider http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]

# ============================================================
# Switchboard target: node running ph switchboard
# ============================================================
FROM node:24-alpine AS switchboard

WORKDIR /app

RUN apk add --no-cache curl

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@latest --activate

RUN pnpm config set @jsr:registry https://npm.jsr.io

ARG TAG=latest
RUN pnpm add -g ph-cmd@$TAG

COPY --from=base /app/project /app/project

WORKDIR /app/project

COPY docker/switchboard-entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE ${PORT}

HEALTHCHECK --interval=30s --timeout=3s --start-period=30s --retries=3 \
    CMD curl -f http://localhost:${PORT}/health || exit 1

ENTRYPOINT ["/app/entrypoint.sh"]
```

- [ ] **Step 2: Commit**

```bash
git add docker/Dockerfile
git commit -m "feat(docker): add multi-stage Dockerfile with connect and switchboard targets"
```

---

## Task 2: Create entrypoint scripts and nginx config

**Files:**

- Create: `docker/connect-entrypoint.sh`
- Create: `docker/switchboard-entrypoint.sh`
- Create: `docker/nginx.conf.template`

- [ ] **Step 1: Create `docker/connect-entrypoint.sh`**

```sh
#!/bin/sh
set -e

envsubst '${PORT},${PH_CONNECT_BASE_PATH}' < /etc/nginx/nginx.conf.template > /etc/nginx/nginx.conf

echo "Testing nginx configuration..."
nginx -t

if [ $? -eq 0 ]; then
    echo "Connect available at: http://localhost:${PORT}${PH_CONNECT_BASE_PATH}"
    exec nginx -g "daemon off;"
else
    echo "Nginx configuration test failed"
    exit 1
fi
```

- [ ] **Step 2: Create `docker/switchboard-entrypoint.sh`**

```sh
#!/bin/sh
set -e

if [ -n "$PH_REACTOR_DATABASE_URL" ] && [ "$SKIP_DB_MIGRATIONS" != "true" ]; then
    echo "[entrypoint] Running migrations..."
    ph migrate
fi

echo "[entrypoint] Starting switchboard on port ${PORT:-3000}..."
exec ph switchboard --port ${PORT:-3000}
```

- [ ] **Step 3: Create `docker/nginx.conf.template`**

This is the existing `apps/connect/nginx.conf` (which already uses `${PORT}` and `${PH_CONNECT_BASE_PATH}` substitution variables):

```nginx
user nginx;
worker_processes auto;
error_log /var/log/nginx/error.log warn;
pid /var/run/nginx.pid;

events {
    worker_connections 1024;
}

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;

    gzip on;
    gzip_vary on;
    gzip_proxied any;
    gzip_comp_level 6;
    gzip_buffers 16 8k;
    gzip_http_version 1.1;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml application/xml+rss image/avif;

    server {
        listen 0.0.0.0:${PORT};
        server_name _;
        root /var/www/html/project;

        location /health {
            access_log off;
            add_header Content-Type text/plain;
            return 200 'OK';
        }

        location ${PH_CONNECT_BASE_PATH}/assets/ {
            alias /var/www/html/project/assets/;
            access_log off;
            log_not_found off;
            etag off;
            expires max;
            add_header Cache-Control "public, max-age=31536000, immutable";
        }

        location ${PH_CONNECT_BASE_PATH}/fonts/ {
            alias /var/www/html/project/fonts/;
            access_log off;
            log_not_found off;
            expires max;
            add_header Cache-Control "public, max-age=31536000, immutable";
        }

        location = ${PH_CONNECT_BASE_PATH}/service-worker.js {
            alias /var/www/html/project/service-worker.js;

            access_log off;
            log_not_found off;
            etag off;

            add_header Cache-Control "no-cache, no-store, must-revalidate";
            add_header Pragma "no-cache";
            add_header Expires "0";
        }

        location ~ ${PH_CONNECT_BASE_PATH}/(?!index\.html$)([^/]+\.[a-z0-9]+)$ {
            alias /var/www/html/project/$1;
            access_log off;
            log_not_found off;
            etag on;
            add_header Cache-Control "public, must-revalidate";
        }

        location ${PH_CONNECT_BASE_PATH} {
            try_files $uri $uri/ /index.html;
        }
    }
}
```

- [ ] **Step 4: Make entrypoints executable and commit**

```bash
chmod +x docker/connect-entrypoint.sh docker/switchboard-entrypoint.sh
git add docker/connect-entrypoint.sh docker/switchboard-entrypoint.sh docker/nginx.conf.template
git commit -m "feat(docker): add entrypoint scripts and nginx config template"
```

---

## Task 3: Update `publish-docker-images.yml`

**Files:**

- Modify: `.github/workflows/publish-docker-images.yml`

- [ ] **Step 1: Add connect and switchboard to the build matrix**

In `.github/workflows/publish-docker-images.yml`, replace the current `matrix` block and update the build step to support per-entry `dockerfile`, `target`, and registry selection.

Replace the entire `strategy` block (lines 18-24):

```yaml
strategy:
  fail-fast: false
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
        harbor_only: true
      - image: switchboard
        context: .
        dockerfile: docker/Dockerfile
        target: switchboard
        harbor_only: true
```

- [ ] **Step 2: Update the "Build and push Docker image" step to support `dockerfile`, `target`, and Harbor-only entries**

Replace the existing `docker/build-push-action` step (lines 82-94) with:

```yaml
- name: Build and push Docker image
  uses: docker/build-push-action@v5
  with:
    context: ${{ matrix.context }}
    file: ${{ matrix.dockerfile || format('{0}/Dockerfile', matrix.context) }}
    target: ${{ matrix.target || '' }}
    push: true
    tags: |
      ${{ matrix.harbor_only != true && format('{0}/{1}/{2}:{3}', env.REGISTRY, github.repository, matrix.image, env.GITHUB_TAG) || '' }}
      ${{ format('{0}/{1}:{2}', env.HARBOR_REGISTRY, env.HARBOR_PATH, env.GITHUB_TAG) }}
      ${{ matrix.harbor_only != true && env.ADDITIONAL_TAG != '' && format('{0}/{1}/{2}:{3}', env.REGISTRY, github.repository, matrix.image, env.ADDITIONAL_TAG) || '' }}
      ${{ env.ADDITIONAL_TAG != '' && format('{0}/{1}:{2}', env.HARBOR_REGISTRY, env.HARBOR_PATH, env.ADDITIONAL_TAG) || '' }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
    build-args: TAG=${{ env.GITHUB_TAG }}
```

- [ ] **Step 3: Conditionally skip GHCR login for Harbor-only entries**

Replace the GHCR login step (lines 68-73) with:

```yaml
- name: Log in to GHCR
  if: ${{ matrix.harbor_only != true }}
  uses: docker/login-action@v3
  with:
    registry: ${{ env.REGISTRY }}
    username: ${{ github.actor }}
    password: ${{ secrets.PATNAME }}
```

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/publish-docker-images.yml
git commit -m "feat(ci): add connect and switchboard Docker builds to release pipeline (Harbor only)"
```

---

## Task 4: Delete old Dockerfiles, Heroku files, and deploy workflow

**Files:**

- Delete: `.github/workflows/deploy-powerhouse.yml`
- Delete: `apps/connect/Dockerfile`
- Delete: `apps/connect/docker-entrypoint.sh`
- Delete: `apps/connect/nginx.conf`
- Delete: `apps/connect/heroku/Dockerfile`
- Delete: `apps/connect/heroku/heroku-entrypoint.sh`
- Delete: `apps/connect/heroku/Procfile`
- Delete: `apps/connect/heroku/config/nginx.conf.template`
- Delete: `apps/switchboard/Dockerfile`
- Delete: `apps/switchboard/entrypoint.sh`

- [ ] **Step 1: Delete the Heroku deploy workflow**

```bash
git rm .github/workflows/deploy-powerhouse.yml
```

- [ ] **Step 2: Delete old Connect Docker and Heroku files**

```bash
git rm apps/connect/Dockerfile
git rm apps/connect/docker-entrypoint.sh
git rm apps/connect/nginx.conf
git rm -r apps/connect/heroku/
```

- [ ] **Step 3: Delete old Switchboard Docker files**

```bash
git rm apps/switchboard/Dockerfile
git rm apps/switchboard/entrypoint.sh
```

- [ ] **Step 4: Commit**

```bash
git commit -m "chore(docker): remove old Dockerfiles, Heroku deploy workflow, and entrypoints"
```

---

## Task 5: Test Docker builds locally

**Files:** None (validation only)

- [ ] **Step 1: Build the Connect target locally**

```bash
docker build -f docker/Dockerfile --target connect -t ph-connect:test --build-arg TAG=latest .
```

Expected: Build completes successfully. The image is based on `nginx:alpine` and contains the static SPA files.

- [ ] **Step 2: Run the Connect image and verify it serves**

```bash
docker run --rm -d -p 3001:3001 --name ph-connect-test ph-connect:test
curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health
```

Expected: Returns `200`.

```bash
docker stop ph-connect-test
```

- [ ] **Step 3: Build the Switchboard target locally**

```bash
docker build -f docker/Dockerfile --target switchboard -t ph-switchboard:test --build-arg TAG=latest .
```

Expected: Build completes successfully. The image is based on `node:24-alpine` and has ph-cmd installed.

- [ ] **Step 4: Run the Switchboard image and verify it starts**

```bash
docker run --rm -d -p 3000:3000 --name ph-switchboard-test ph-switchboard:test
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health
```

Expected: Returns `200`.

```bash
docker stop ph-switchboard-test
```

- [ ] **Step 5: Commit (if any fixes were needed)**

Only if changes were made during testing:

```bash
git add -A
git commit -m "fix(docker): fixes from local Docker build testing"
```
