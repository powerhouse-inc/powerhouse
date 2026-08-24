# Design: Docker Compose files per release channel

Date: 2026-08-24
Branch: `fix/docker-compose-channels`

## Context

The root `docker-compose.yml` was written for the pre-2026-03-29 Docker layout
(commit `08207df3d`, "feat(docker): redesign Docker strategy with runtime
package loading") and is stale in several ways:

1. **Wrong registry.** It pulls
   `ghcr.io/powerhouse-inc/powerhouse/{connect,switchboard}`. Since the
   redesign, connect and switchboard images are published **only** to Harbor
   (`cr.vetra.io/powerhouse-inc-powerhouse/*`). GHCR copies are frozen at the
   pre-redesign builds.
2. **Wrong container ports.** It maps `:3000:4000` / `:4000:4001` and
   healthchecks `:4000` / `:4001`, but the images listen on
   **connect=3001** (`ENV PORT=3001`) and **switchboard=3000**
   (`ENV PORT=3000`, entrypoint exports `PH_SWITCHBOARD_PORT`).
3. **Ineffective env vars.** `DATABASE_URL` and `BASE_PATH` on connect do
   nothing (connect is a static nginx SPA). Switchboard reads:
   - `PH_REACTOR_DATABASE_URL` / `PH_SWITCHBOARD_DATABASE_URL` — reactor
     storage (`server.mts`: `reactorDbUrl`). With only `DATABASE_URL` set,
     the **reactor silently falls back to ephemeral PGlite** while the read
     model uses postgres.
   - `DATABASE_URL` / `PH_SWITCHBOARD_DATABASE_URL` — read-model storage.
   - `PH_REACTOR_DATABASE_URL` — gates the entrypoint's postgres migration
     run.
4. **No connect→switchboard wiring.** The SPA auto-adds remote drives from
   `connect.drives.defaultDrives` in the runtime config
   (`apps/connect/src/utils/reactor.ts`). The connect entrypoint deep-merges
   a `PH_CONNECT_CONFIG_JSON` env var into `powerhouse.config.json`
   (operator-wins). Without it the SPA boots with no drives.
5. **No postgres data volume** — data lost on `docker compose down`.

## Release channels → image tags

From `.github/workflows/publish-docker-images.yml` ("Determine additional
tag") and verified by pulling from Harbor on 2026-08-24, the floating tags
are:

| Channel | Branch | Floating tag |
| --- | --- | --- |
| dev | `main` | `dev` |
| staging | `release/staging/*` | `staging` |
| test (release candidate) | `release/rc/*` | `rc` |
| production | `release/production/*` | `latest` |

Promotion flow per coredev: **dev → staging → rc → latest**.

## Design

Five standalone compose files in the repo root. Standalone (no
`include`/`extends`) because compose `include` cannot partially override an
included service (same-name conflict), and each file must be usable on its
own: `docker compose -f docker-compose.dev.yml up -d`.

| File | Project name | Image tag | Backend |
| --- | --- | --- | --- |
| `docker-compose.yml` | `powerhouse` | `latest` | postgres |
| `docker-compose.dev.yml` | `powerhouse-dev` | `dev` | postgres |
| `docker-compose.test.yml` | `powerhouse-test` | `rc` | postgres |
| `docker-compose.staging.yml` | `powerhouse-staging` | `staging` | postgres |
| `docker-compose.pglite.yml` | `powerhouse-pglite` | `latest` | embedded PGlite |

Per-file project `name:` gives each stack its own network (no fixed
`networks[].name:` — a shared fixed network would collide on the `postgres`
service alias across stacks).

### Common service shape (postgres variant)

- **connect** — `cr.vetra.io/powerhouse-inc-powerhouse/connect:<tag>`
  - `PH_CONNECT_CONFIG_JSON` = `{"connect":{"drives":{"defaultDrives":[{"url":"http://localhost:4000","name":null,"icon":null}]}}}`
    → SPA auto-connects to the local switchboard; the first default drive's
    origin also configures the attachment service.
  - host port `127.0.0.1:3000` → container `3001`
  - healthcheck: `wget -q --spider http://localhost:3001/health`
    (nginx:alpine has no curl)
- **switchboard** — `cr.vetra.io/powerhouse-inc-powerhouse/switchboard:<tag>`
  - `PH_REACTOR_DATABASE_URL` and `PH_SWITCHBOARD_DATABASE_URL` =
    `postgres://postgres:postgres@postgres:5432/postgres` (reactor + read
    model in one DB; entrypoint runs migrations because
    `PH_REACTOR_DATABASE_URL` is set)
  - host port `127.0.0.1:4000` → container `3000`
  - depends on postgres `service_healthy`
  - healthcheck: `curl -f http://localhost:3000/health`
- **postgres** — `postgres:16.1`, host port `127.0.0.1:5444` → `5432`,
  named volume `postgres_data` at `/var/lib/postgresql/data`

### PGlite variant

`docker-compose.pglite.yml`: same as the default file, but **no postgres
service** and **no DB env vars** — switchboard falls back to embedded PGlite
(`./.ph/reactor-storage`, `.ph/read-storage` relative to `WORKDIR /app`).
A named volume mounted at `/app/.ph` persists both. PGlite migrations run
automatically on startup. Single file (not per-tag): it is a local-dev
convenience, not a deployment shape.

Host ports are identical across files, so the stacks are mutually exclusive
while running — same as before the change.

### Host ports (unchanged from prior convention)

| Service | Host (127.0.0.1) | Container |
| --- | --- | --- |
| connect | 3000 | 3001 |
| switchboard | 4000 | 3000 |
| postgres | 5444 | 5432 |

## Docs

- Root `README.md` "Using Docker" section rewritten to match (it still
  references `--build`, a nonexistent `docker-compose.prod.yml`, and the old
  single-file workflow).
- `apps/academy/docs/academy/03-Build/05-Launch/05-DockerDeployment.md` has
  the same stale ghcr/ports content; updated to point at Harbor + the new
  files.

## Verification

- `docker compose config -q` for each file.
- For each stack: `up -d`, wait for healthy, `curl` both `/health` endpoints
  via the host ports, verify the connect SPA serves and the switchboard is
  reachable, `down`.
- Real images pulled from `cr.vetra.io` (publicly pullable).
