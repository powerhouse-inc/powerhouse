# switchboard-lb — Architecture

This document is the design spec. `CLAUDE.md` covers _how we work_; this covers _what we're building and why_.

**Implementation target: OpenResty** (nginx + Lua). See §2 for why.

## 1. Goals and non-goals

### Goals

1. **Correctness first**: a given drive is always routed to the same `switchboard` instance for the lifetime of that pinning. The receiving switchboard validates ownership and returns a structured wrong-shard error if the request landed on the wrong instance — making routing advisory rather than load-bearing for correctness.
2. **Header-driven routing**: clients declare the owning drive via a `Drive-Id` request header. The LB hashes that header value and forwards. No body inspection on the hot path.
3. **Low, predictable tail latency**: LB-added latency in the low hundreds of microseconds.
4. **Operable**: structured logs, Prometheus metrics, graceful reload of the backend list without dropping connections.
5. **Small, well-understood surface area**: we'd rather run a stock binary with a few hundred lines of config than maintain a bespoke network daemon.

### Non-goals (initially)

- TLS termination. Assume a TLS-terminating edge (ALB / cloud LB / another nginx) in front. Revisit once the core is solid.
- HTTP/2 or HTTP/3 to the client. HTTP/1.1 only in the MVP. (nginx supports h2 trivially; we just don't enable it yet.)
- Authn/authz. We forward headers untouched; `switchboard` remains the policy decision point.
- Rate limiting, WAF, caching. Out of scope, even though nginx could do them.
- Dynamic service discovery (Consul / Kubernetes API). Backends come from a config file; reload on `SIGHUP` / `nginx -s reload`.
- Rebalancing existing documents across backends. Pinning is sticky once established.

## 2. Why OpenResty (and not X)

We evaluated four implementation strategies:

| Approach                    | Verdict                                                                                                                                                                                         |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Custom C daemon             | Rejected for MVP. Large surface area, long timeline, and the interesting problems (pinning invariant, migration story) are independent of language. Revisit only if we outgrow OpenResty.       |
| Plain nginx                 | Rejected. `hash $var consistent` can hash on URL params or headers, but cannot read a JSON request body. The path-scoped route would work; the `POST /graphql` route would not.                 |
| HAProxy + Lua               | Viable. `http-buffer-request` + a Lua converter can set a variable, then `balance hash <var> consistent` routes. Slightly less mature Lua ecosystem than OpenResty for this specific shape.     |
| **OpenResty (nginx + Lua)** | **Chosen.** First-class body access via `ngx.req.read_body()`, mature `cjson`, native `hash $var consistent` in the upstream block, rich `lua-resty-*` ecosystem for health checks and metrics. |

What OpenResty buys us concretely:

- **nginx** handles accept loop, HTTP parsing, keep-alive, upstream pooling, graceful reload, worker supervision.
- **`rewrite_by_lua` / `access_by_lua`** is the exact phase we need to inspect the body and set a routing variable _before_ the upstream is chosen.
- **`hash $doc_id consistent`** in the upstream block does rendezvous-style consistent hashing natively.
- **`ngx.timer.every` + cosocket + `lua_shared_dict`** are enough to run our own active probe loop without taking the off-the-shelf `lua-resty-upstream-healthcheck` library — see §5.2 for why pinning forced custom probing.
- **`nginx-lua-prometheus`** gives us Prometheus-format metrics without a sidecar.

The tradeoff we accept: Lua on the hot path. For GQL-sized payloads (sub-MB), `cjson.decode` is a few tens of microseconds — dominated by the network round trip. We gate this assumption with load tests (see §8 M0).

## 3. System context

```
┌─────────┐     HTTP       ┌───────────────┐    HTTP    ┌───────────────┐
│ clients │ ──────────────▶│ switchboard-  │ ─────────▶ │ switchboard #1│
└─────────┘                │     lb        │            └───────────────┘
                           │  (OpenResty)  │            ┌───────────────┐
                           │               │ ─────────▶ │ switchboard #2│
                           │               │            └───────────────┘
                           │               │            ┌───────────────┐
                           │               │ ─────────▶ │ switchboard #N│
                           └───────────────┘            └───────────────┘
```

Each `switchboard` instance:

- Runs an independent Reactor.
- Owns a subset of documents (the ones pinned to it).
- Exposes GraphQL at `/graphql` (global) and `/d/:drive/graphql` (per-drive).
- Is otherwise identical to its siblings.

The LB is the only component that knows the pinning map.

## 4. Request lifecycle (mapped to nginx phases)

```
accept ─▶ parse headers ─▶ rewrite_by_lua: copy Drive-Id header → $doc_id
                                │
                                ▼
                        $doc_id set ─▶ upstream { hash $doc_id consistent }
                                                       │
                                                       ▼
                                       proxy_pass ─▶ upstream conn pool
                                                       │
                                                       ▼
                                         stream response back to client
```

The Lua block runs in the nginx **rewrite phase** — after headers are parsed, before the upstream is chosen. It sets `ngx.var.doc_id`, which the `hash` directive reads when picking a backend.

### 4.1 Route classes

| Class                         | Example                                                                                                             | Where `$doc_id` comes from                                                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| **Drive-scoped (`/graphql`)** | `POST /graphql`, `POST /graphql/r`, `POST /graphql/<model>`, `POST /graphql/stream`, `POST /graphql/<model>/stream` | Lua reads the `Drive-Id` request header (exposed as `$http_drive_id`) and writes it to `$doc_id`. Empty / missing → round-robin. §4.3. |
| **Drive metadata**            | `GET /d/:drive`                                                                                                     | REST; returns the same payload from any backend. Routed to any healthy backend.                                                        |
| **Global**                    | `GET /health`, introspection queries                                                                                | handled by the LB directly or routed to any backend.                                                                                   |
| **Subscription**              | `WS /graphql/subscriptions`                                                                                         | upgrade forwarded to the pool; sticky for the connection's lifetime.                                                                   |

The LB does not parse the body at all. It is method-agnostic on `/graphql`: any request with a `Drive-Id` header pins, any request without it round-robins. Whether the request is a POST, a GET, a request batch, or persisted-query-only is the upstream's problem.

### 4.2 Concrete config sketch

The upstream block below is shown for production hostnames and switchboard's default port (`4001`, see `apps/switchboard/src/server.mts`). The committed `conf/upstreams.conf` instead points at the dev compose stubs (`sb-1:8080` / `sb-2:8080` / `sb-3:8080`) — same shape, different `server` lines. Production swaps the `server` entries; nothing else moves.

```nginx
# upstreams.conf
upstream switchboards {
    hash $doc_id consistent;
    # max_fails=0 disables passive mark-down so the hash module never
    # skips a peer at selection time — see §5.2 "Pinning under failure".
    server sb-1.internal:4001 max_fails=0;
    server sb-2.internal:4001 max_fails=0;
    server sb-3.internal:4001 max_fails=0;
    keepalive 64;
}

# routes.conf
server {
    listen 8080;

    # Subscriptions: WebSocket upgrade. Exact match so it wins over
    # the /graphql prefix below.
    location = /graphql/subscriptions {
        proxy_pass http://switchboards;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 1h;
        proxy_send_timeout 1h;
        proxy_next_upstream off;
    }

    # Drive-scoped: supergraph, reactor subgraph, and every
    # document-model subgraph all share this prefix. Owning drive
    # comes from the `Drive-Id` request header; missing → round-robin.
    location /graphql {
        rewrite_by_lua_block { require("route").from_header() }
        proxy_pass http://switchboards;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_next_upstream off;
    }

    # Drive metadata (REST). Safe to any healthy backend.
    location ~ ^/d/[^/]+$ {
        proxy_pass http://switchboards;
        proxy_http_version 1.1;
        proxy_set_header Connection "";
        proxy_next_upstream off;
    }

    # Global health check, handled locally.
    location = /health {
        access_log off;
        return 200 "ok\n";
    }

    # /metrics served on a separate listener (see §6.4).
}
```

```lua
-- lua/route.lua — the entire module.
local M = {}

-- Pull the routing key off the `Drive-Id` request header. nginx exposes
-- HTTP headers as $http_<lowercased name with dashes turned into
-- underscores>, so `Drive-Id` is `$http_drive_id`. When the header is
-- missing or empty, $doc_id stays empty and the upstream `hash`
-- directive falls back to round-robin (documented nginx behavior).
-- The receiving switchboard validates ownership and returns a structured
-- wrong-shard error if the request landed on the wrong instance.
function M.from_header()
    ngx.var.doc_id = ngx.var.http_drive_id or ""
end

return M
```

The LB does not parse the request body. There is no body-size cap to coordinate, no JSON parser on the hot path, no key-precedence rules to maintain across schema changes. Multi-document requests are not the LB's concern: clients pick one drive's worth of work per request and stamp it on the header, and the switchboard validates ownership and returns a structured wrong-shard error if the request landed wrong. See §4.3 for the header rules and §9 Q7 for the multi-document policy.

### 4.3 Header rules

1. Read the `Drive-Id` request header into `$doc_id`. nginx exposes HTTP headers as `$http_<lowercased name, dashes → underscores>`, so `Drive-Id` is `$http_drive_id`. The Lua module is two effective lines (see §4.2).
2. **Empty or missing header → empty `$doc_id` → round-robin.** Documented nginx behavior: an empty hash key falls back to round-robin selection across the upstream peers. This serves legacy clients and any operation without a single owning drive (e.g. `node` queries by id, introspection) without rejecting them.
3. **Header present but advisory.** The LB does not validate the header value — that's the receiving switchboard's job. A correctly-routed request lands on the instance that owns the drive; a misrouted request gets a structured wrong-shard error from the switchboard's drive-validation middleware. Routing is optimistic; correctness lives downstream.
4. **No body inspection.** The LB never calls `ngx.req.read_body()` on `/graphql`. Bodies stream straight through to the upstream. This is what lets the LB stay GraphQL-agnostic — POST, GET-with-query, request batches, persisted queries, future schema changes are all the upstream's problem.
5. **Header name is part of the contract.** The LB hashes on `Drive-Id`. Renaming the header is a coordinated client-and-server change; document it here and version it.

The contract with clients: if a request belongs to a single drive, send `Drive-Id: <drive-uuid>` and the LB pins. Otherwise, omit the header and accept round-robin distribution. The wrong-shard error from the switchboard is the safety net for misroutes.

### 4.4 Multi-document requests

Multi-document requests are not the LB's problem under the header model. The client picks one drive (typically the one most of the work belongs to) and stamps it on the header. The receiving switchboard owns that drive and processes the operation; cross-drive concerns are handled instance-to-instance via reactor RPC, not at the LB. If a request legitimately spans drives the client doesn't know how to pick from, omitting the header (round-robin) is acceptable — the receiving switchboard validates per-document ownership and returns the structured wrong-shard error for any document it doesn't own.

See §9 Q7 for the policy rationale and the historical body-parsing options that were ruled out.

### 4.5 Failure modes

- **Upstream refuses connection** → `proxy_pass` fails at TCP. We set `proxy_next_upstream off` (no retry across backends) **and** `max_fails=0` per `server` entry (no passive mark-down — see §5.2 for why). The request surfaces as `503` (translation note below); pinning is preserved — subsequent requests for the same doc keep targeting the same dead backend until it recovers.
- **Upstream times out mid-request** → same rule: no retry, `503` to the client.
- **Upstream returns 5xx** → pass through unchanged. The backend made a decision; the LB doesn't second-guess it.
- **Backend marked unhealthy by active checks** → reported on `/__hc/status` for observability. **No effect on peer selection**: the peer stays in the consistent-hash ring so pinned docs continue to fail closed (`503` via the TCP-refused path above) rather than silently re-routing to another backend. See §5.2.

**Status translation.** All of "no live upstream", "connection refused", and "upstream timed out" surface to clients as `503` via `proxy_intercept_errors on; error_page 502 504 = @no_backend;` in `routes.conf`. nginx's raw distinctions (`502` for connect failure / no live upstream, `504` for read timeout) are preserved in access logs via `$upstream_status`, but the wire response is uniformly `503` because the LB's contract is "this document is currently unavailable, retry later" — the cause distinction is for operators reading logs, not clients deciding retry policy. The over-translation is intentional; revisit only if a real client need to differentiate appears.

## 5. Pinning and routing

This is the heart of the system. Getting it wrong means data corruption.

### 5.1 Invariant

> For a given document id `D`, all successful mutations land on the same backend `B(D)` for as long as `D` exists. Reads **may** go anywhere, but in the MVP we route reads with the same function for simplicity and cache affinity.

### 5.2 Mechanism

nginx's `hash $var consistent` implements [Ketama](https://en.wikipedia.org/wiki/Consistent_hashing)-style consistent hashing across the `server` entries in the upstream block. Weight of each server is configurable. Adding or removing a server remaps ~1/N of keys — the same fundamental tradeoff any stateless scheme has.

**Pinning under failure.** Standard nginx behavior is to skip peers marked `down` — whether by passive `max_fails` tracking or by an active healthcheck calling `set_peer_down` — and pick the next slot in the ring. That's catastrophic under §5.1's invariant: a doc pinned to a dead backend would silently re-route to a different one and split-brain its write log. We disable both paths. `upstreams.conf` sets `max_fails=0` so passive checks never mark peers down. `lua/healthcheck.lua` runs its own probe loop, tracking state in `lua_shared_dict healthcheck` for `/__hc/status` to read; it never calls `set_peer_down`. Net effect: peers always look "up" to the upstream module, the hash module always picks the originally-hashed peer, and a dead pin fails at TCP → 502 → §4.5's `@no_backend` → 503. The healthcheck's job is observability, not routing.

### 5.3 Caching

The consistent hash is cheap enough that we don't need a cache for correctness. We **may** add a per-worker `lua-resty-lrucache` keyed by `doc_id` as an optimization once we have numbers, but the MVP ships without it. If we add one, it must be invalidated on config reload.

### 5.4 Alternative: external directory (deferred)

Long-term we probably want an explicit `doc_id → backend` directory (Redis or Postgres) so that adding a backend doesn't remap a fraction of documents. This requires coordinated migration support in `switchboard`, which doesn't exist yet. Until it does, the MVP's "backend list is effectively immutable in prod" rule stands (see §6.3).

## 6. Configuration & operations

### 6.1 Config files

Everything lives under `conf/` and is mounted into the container. The layout is in `CLAUDE.md` §"Repo layout". Backends are defined in `upstreams.conf` as `server` entries in the `switchboards` upstream.

Runtime knobs like `client_max_body_size`, keepalive counts, and health-check intervals are in those files too — we don't introduce a parallel config format.

### 6.2 Reload semantics

`nginx -s reload`:

1. Master parses the new config. If it fails, the old workers keep running.
2. On success, master starts new workers with the new config.
3. Old workers finish their in-flight requests and exit.
4. Zero dropped connections.

This is a well-understood operation; we don't need to reinvent it. `scripts/reload.sh` wraps `nginx -t` (validate) → `nginx -s reload` (apply) and fails loudly if the test step fails.

### 6.3 Adding / removing backends

- **Adding**: `hash $doc_id consistent` remaps ~1/N of documents. Until `switchboard` supports migration, this is a coordinated maintenance event, not a self-serve operation.
- **Removing**: documents pinned to the removed server become unroutable. Same rule.

This is the biggest operational sharp edge of the MVP. Called out here and in `CLAUDE.md` so we don't forget.

### 6.4 Observability

- **Metrics** (Prometheus, via `nginx-lua-prometheus`, served on a separate internal listener like `:9090/metrics`):
  - `lb_requests_total{class,backend,status}`
  - `lb_request_duration_seconds{class,backend}` (histogram)
  - `lb_upstream_errors_total{backend,kind}`
  - standard nginx stubs via `stub_status`
- **Logs**: custom `log_format` in `log_format.conf` emitting key=value. Include `request_id`, `remote_addr`, `doc_id` (when set from the `Drive-Id` header), `upstream_addr`, `status`, `request_time`, `upstream_response_time`.
- **Traces**: out of scope for the MVP. Slot reserved for OpenTelemetry (`opentelemetry-nginx` module) later.
- **`X-LB-Upstream` response header** on `/graphql` and `/d/:drive` responses, exposing `$upstream_addr`. Dev-only debug aid for the `lb-loadtest` harness (§8 M4) — lets a test process observe per-request which backend served the response without log scraping. Not a production feature; the LB is dev-only-published anyway and the header is harmless if it leaks.

## 7. Concurrency model

nginx decides this for us, and that's part of the appeal:

- **`worker_processes auto;`** — one worker per core.
- **`SO_REUSEPORT`** via `listen ... reuseport;` so the kernel balances accepts.
- **Lua state is per-worker.** Shared state across workers (e.g., the healthcheck's view of upstream health) uses `lua_shared_dict`.
- **No thread pool, no work stealing.** Each request is handled end-to-end on the worker that accepted it.

We do not write our own event loop; we do not manage our own thread pool. This is a feature.

## 8. Milestones

Thin vertical slices, each end-to-end runnable.

- **M0 — Skeleton.** _Done._ `Dockerfile` (dev + runtime), `docker-compose.yml` with LB + 3 stub upstreams, `nginx.conf` serving `/health`, `busted` wired up, k6 baseline measuring nginx-alone overhead — see `test/integration/BASELINE.md` for the reference numbers we regression-check against.
- **M1 — Proxy plumbing.** _Done._ `POST /graphql` / `POST /graphql/*` / `GET /d/:drive` / `WS /graphql/subscriptions` proxied to the pool, `/health` served locally, `proxy_next_upstream off` throughout. `m1.sh` asserts path preservation, `X-Request-Id` passthrough, and that the WS upgrade reaches the pool.
- **M2 — Header-based routing.** _Done._ `lua/route.lua` copies the `Drive-Id` request header into `$doc_id` (§4.3); `upstreams.conf` is on `hash $doc_id consistent`. Missing/empty header → empty `$doc_id` → round-robin (documented nginx behavior). The receiving switchboard validates drive ownership via cached middleware and returns a structured wrong-shard error if misrouted (see `packages/reactor-api/src/graphql/gateway/drive-middleware.ts`). `m2.sh` covers pinning (5/5 same backend for one `Drive-Id`), spread across distinct values, missing-header round-robin, and the no-Lua-on-non-`/graphql` invariant. The earlier body-parsing implementation (M2 v1) was deleted in favor of this layering — the LB no longer touches request bodies on `/graphql`.
- **M3 — Health checks + reload-survival.** _Done._ Active probing for observability + a pinning-preserving 503 on dead backends per §4.5, plus integration coverage of WS reload-survival per §9 Q3. Concretely:
  - `lua_shared_dict healthcheck 1m;` and `init_worker_by_lua_block { require("healthcheck").run() }` in `nginx.conf` — shared state across workers per §7.
  - `lua/healthcheck.lua` runs a per-worker cosocket probe loop against every peer in the `switchboards` upstream every 2s (timeout 1s, fall=3, rise=2) hitting `GET /health`. State (`up`/`down`) is written to `lua_shared_dict healthcheck`; the loop **does not** call `set_peer_down` — see §5.2 for the pinning rationale. Switchboard's `/health` is liveness-only (registered before auth middleware in `packages/reactor-api/src/server.ts:379`); a true `/readyz` that 503s during init/drain is a switchboard-side follow-up.
  - `upstreams.conf` sets `max_fails=0` per server to disable nginx's passive mark-down. Combined with the healthcheck not calling `set_peer_down`, this is the load-bearing piece of "pinning under failure": the hash module always picks the same peer for a given `$doc_id`, even when that peer is dead — see §5.2.
  - `routes.conf` translates the resulting 502/504 (TCP refused, upstream timeout) into 503 via `proxy_intercept_errors on; error_page 502 504 = @no_backend;`. Underlying nginx status survives in access logs as `$upstream_status`. See §4.5.
  - `proxy_next_upstream off` stays — even before status translation, no backend swap is attempted on a transport error.
  - `/__hc/status` (localhost-only) renders peer state from the `lua_shared_dict`. `m3.sh` resolves docker-compose service names → IPs via `docker inspect` (peers in the status page are reported by `IP:port` — that's what `ngx.upstream.get_primary_peers` returns) and polls for transitions instead of time-waiting. Will move to the M4 metrics listener.
  - `m3.sh` covers eject, other-pin-survival, recovery, and the strict-pinning property: 5/5 requests pinned to a stopped backend get 503, never 200 from a different one. `m3_ws_reload.sh` (Q3) opens a real WS via `websocat` (added to the dev Dockerfile alongside `curl`), reloads nginx mid-flight, and asserts both the connection and frame round-trip survive.
  - Stubs in `test/fixtures/` now speak real WebSocket via `lua-resty-websocket-server`; `m1.sh`'s upgrade-check was updated from `200` to `101` accordingly.
- **M4 — Observability.** _Done._ Prometheus metrics + dedicated `:9090` observability listener, plus the `/__hc/status` move from M3. Concretely:
  - `nginx-lua-prometheus` 0.20240525 fetched as three pure-Lua files into `/usr/local/openresty/site/lualib/` from the dev + runtime Dockerfile stages. We deliberately avoid `/usr/local/openresty/nginx/lua/` because the dev compose mounts `./lua` there read-only, masking image-baked files. The `-alpine-fat` base is _not_ used — it does not bundle this library either, so its +400MB buys nothing.
  - `lua_shared_dict prometheus_metrics 2m;` in `nginx.conf`. `init_worker_by_lua_block` runs `metrics.run()` alongside `healthcheck.run()`. A parallel `map "" $route_class { default ""; }` declares the variable at http scope so the server-level `log_by_lua_block` can read it unconditionally.
  - `lua/metrics.lua` registers the §6.4 pair (`lb_requests_total`, `lb_request_duration_seconds`) with the bucket boundaries `{0.0001, 0.0005, 0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1}` (M0 baseline 84µs median / 172µs p95 — default Prometheus buckets are useless at this scale). With the header-based routing model the LB no longer parses bodies, so the previously-tracked `lb_body_parse_errors_total{reason}` counter is gone — the LB has no decode path that can fail.
  - Each `location` block in `routes.conf` sets `$route_class` to `graphql|drive|health|subscription`. A single server-level `log_by_lua_block { require("metrics").record_request() }` covers every location including the `@no_backend` internal redirect (which reuses the original request's log phase — no double counting). Subscription duration observation is skipped (WS lifetime against a 1s-top histogram would dump every connection in `+Inf`); request count is still recorded.
  - `conf/metrics.conf` defines a `listen 9090` server with `/metrics` and `/__hc/status`. The listener is reachable from the LB container's docker network only — nothing is published to the host in `docker-compose.yml`, so it's accessible from sibling compose services (e.g. the optional `prometheus` profile below) and via `docker exec <lb> curl 127.0.0.1:9090/...`, but never from off-host. `/__hc/status` moved here from `:8080` (M3 placeholder); `m3.sh` updated to scrape via `:9090`.
  - `m4.sh` covers: `/metrics` 200 on `:9090` and 404 on `:8080`, label combinations after a representative traffic mix across `graphql|drive|health` route classes, `/__hc/status` move. `metrics_spec.lua` covers `record_request`'s class/backend/status label assembly and the empty/`-` `$upstream_addr → "none"` normalisation, mocking `package.loaded["prometheus"]` so it runs without a live container.
  - **Optional local visualisation.** `docker-compose.yml` carries an opt-in `--profile observability` that brings up `prom/prometheus:v2.55.0` (scraping `lb:9090` every 5s) and `grafana/grafana:11.3.0` (anonymous Admin, no login wall) with a file-provisioned starter dashboard at `observability/grafana/dashboards/switchboard-lb.json` covering the §6.4 trio plus a backend-distribution panel for visually validating consistent-hash pinning. Launch with `docker compose --profile observability up -d`, then open Grafana at `http://127.0.0.1:3001` and (optionally) Prometheus at `http://127.0.0.1:9091`. No persistence — provisioning YAML/JSON is the source of truth; restarts re-render the same dashboard.
  - **Real-backend harness (developer aid).** `docker-compose.real.yml` is an override that swaps the three `sb-N` openresty stubs for real switchboard containers (`docker/Dockerfile --target switchboard` pinned to `6.0.0-dev.202` — the first published image exposing the in-repo reactor schema; PGlite storage in per-instance named volumes, no postgres dependency). Bring up with `docker compose -f docker-compose.yml -f docker-compose.real.yml --profile observability up -d --build` (the `observability` profile co-launches Prometheus + Grafana on `127.0.0.1:9091` / `127.0.0.1:3001` so a run is watchable live; the lb-loadtest README treats this as the canonical bring-up), then in another terminal run `pnpm --filter @powerhousedao/lb-loadtest verify`. The harness is a sustained-load consistency tester: a configurable mix of `createDocument` / `mutateDocument` / `document(identifier:)` calls is driven through the LB at `--concurrency` × `--rate-rps` for `--duration-sec`, and every response is checked for backend pinning (against the doc's create backend), `mutateDocument` write-state round-trip (`state.global.name` matches the last action sent), and `document(identifier:)` id round-trip. Failures are categorized (`mutate.pin`, `read.id`, `*.transport`, …), counted, and printed at the end with up to five samples per category — `PASS` exits 0, any failure exits 1. Distinct from the `m1`/`m2`/`m3`/`m4` integration suites (which test the LB against canned stubs) — this harness verifies §5.1 end-to-end against the real switchboard image. M1–M4 tests still pass against stubs unchanged because they don't load the override. Operational reference (full CLI, run table, failure-category cheatsheet): `test/lb-loadtest/README.md`.
  - Trace export remains out of scope (slot reserved for OpenTelemetry post-M5). `lb_upstream_errors_total` and `stub_status` from §6.4's longer list are deferred — no operational signal that warrants them yet.
- **M5 — Production hardening.** _Open-ended._ Pick a fuzz approach for `lua/route.lua` — Lua-side property tests in `busted` over `extract()` are the path of least resistance, since `cjson.safe` already short-circuits malformed JSON; the interesting target is the post-decode walk. ASAN: requires building OpenResty with debug + ASAN flags or using the `openresty-debug` packaging — the stock alpine image is **not** ASAN-built, so this is a custom-image task, not a flag flip. Author `RUNBOOK.md` (reload procedure via `scripts/reload.sh`, the "backend list is immutable in prod" rule from §6.3, the §9 Q6 TLS-edge requirement, and pointer to §9 Q4 for the still-open document migration story).

After M5 we reassess: directory-based pinning (§5.4)? TLS termination moved into the LB (§9 Q6)? HTTP/2 upstream?

End-to-end this is **~2–3 weeks of calendar time**, not months.

## 9. Open questions

Unresolved. Decide before the relevant milestone and record the decision here.

1. **Do we need a `balancer_by_lua_block` instead of `hash $doc_id consistent`?**

   **Decided (2026-04-21):** use the native `hash $doc_id consistent` directive. The MVP routing function is a pure function of `$doc_id`, which the built-in directive handles in C with Ketama-style consistent hashing. `balancer_by_lua_block` is the right tool only when the routing decision depends on state the directive cannot express (external directory, per-request migration hint, load-aware override) — none of which are MVP requirements. Adopting Lua on the balancer phase would add per-request overhead on top of the M2 body parse, duplicate `server`-directive behavior, and enlarge what we have to reason about under reload.

   **M3 footnote (2026-04-27).** The directive's built-in mark-down/skip behavior — both passive (`max_fails`) and active (via libraries that call `set_peer_down`) — is the _opposite_ of what §5.1's pinning invariant wants: skipping a down peer silently re-routes a pinned doc. M3 considered switching to `balancer_by_lua_block` to enforce strict pinning explicitly, but it was unnecessary. Setting `max_fails=0` and writing the active healthcheck to track state in a `lua_shared_dict` without calling `set_peer_down` (see §5.2) keeps every peer "up" from nginx's view, so the directive's selection math always picks the originally-hashed peer. Dead pin → TCP refused → 503 via `@no_backend`. The decision above stands.

   **Revisit trigger:** introduction of an external pinning directory (§5.4), or a per-request decision that is not a pure function of `$doc_id`.

   **M1/M2 config reconciliation _(historical, both stages now landed)_.** The M1 commit ran `least_conn` so the upstream wasn't hashing on an unpopulated `$doc_id`; the M2 commit that introduced `lua/route.lua` flipped the upstream back to `hash $doc_id consistent` atomically, so there was never a window where the config hashed on an empty key. The `map "" $doc_id { default ""; }` block in `conf/nginx.conf` stays across every milestone — `conf/log_format.conf` references `$doc_id` directly, and nginx fails config parse with `unknown variable "$doc_id"` if the map is absent.

2. **Read vs write routing.** MVP routes both with the same function. Is there a case for fanning reads to any healthy backend? Only if reads tolerate stale data, and Reactor semantics suggest they don't. _Defer until after M5._
3. **Subscription stickiness across reloads.** A long-lived WS/SSE connection stays on the same worker's upstream connection across a reload because old workers drain gracefully. We need an integration test that actually proves this. _Owner: M3._
4. **How do operators migrate a document between backends?** Cross-cutting design touching `switchboard` and `reactor`. Until it exists, the backend list is immutable in prod. _Decide before we operate this at any meaningful scale._
5. **`POST /graphql` with no `Drive-Id` header.**

   **Decided (2026-05-05):** round-robin across the upstream pool (documented nginx behavior when the hash key is empty). Old/legacy clients that don't know about the header still work; reads without drive context (`node` queries, introspection, the supergraph's `_service` introspection) reach _some_ healthy backend. The receiving switchboard still validates per-document drive ownership and returns a structured wrong-shard error if it doesn't own a referenced drive — so the safety net catches misroutes without the LB needing to reject.

   **Historical note (2026-04-21).** The earlier body-parsing model rejected such requests with `409 Conflict` because the LB couldn't pick a backend without a doc id. Under the header model the LB never needs a routing key for correctness — pinning is advisory, validation is downstream — so round-robin is safe and strictly more useful than rejecting. The 409 path and the `lua/errors.lua` module that powered it are gone.

6. **Where does TLS terminate?** MVP assumes a TLS-terminating edge in front. If that's not available in a given deploy, we enable `listen 443 ssl;` in this LB.

   **Decided (2026-04-21, M1 scope):**
   - **Dev / CI:** plain HTTP on `:8080` (unchanged).
   - **Prod:** LB stays plain HTTP on `:8080` behind a separate TLS-terminating edge (cloud LB, ALB, or upstream nginx) that forwards plain HTTP to the LB's internal interface. This matches §1's non-goal and keeps the MVP out of cert-rotation / cipher-policy territory.
   - **In-LB TLS (`listen 443 ssl;`):** not built in M1. Add only when a specific deploy demands it — no speculative scaffolding.

   **Operational requirements this creates** (to be captured in a future `DEPLOY.md`; not a blocker for M1 code): the LB listener MUST NOT be exposed to the public internet directly; the TLS edge is responsible for `X-Forwarded-For` / `X-Forwarded-Proto`, which the LB will honor via `set_real_ip_from <edge CIDR>; real_ip_header X-Forwarded-For;` once we add that config (deferrable to M3/M4).

   **Revisit trigger:** a specific deploy where no upstream TLS terminator is available, or a client that requires direct mTLS to the LB.

7. **Multi-document and cross-drive operations.**

   **Decided (2026-05-05):** the LB does not solve this; the client + the receiving switchboard do. Clients pick a drive (whichever owns most of the work) and stamp it on the `Drive-Id` header. The receiving switchboard validates per-document ownership at resolver time; documents in foreign drives surface a structured wrong-shard error from the drive-validation middleware (or are handled instance-to-instance via reactor RPC for the small set of mutations that legitimately span drives).

   This applies to the historically-thorny operations:
   - `deleteDocuments(identifiers: [ID!]!)` — client picks one drive's worth per call; cross-drive deletes are split client-side or fail at the switchboard.
   - `moveRelationship`, `addRelationship`, `removeRelationship` — pinned on whichever drive the client claims; both endpoints validated downstream.
   - `pushSyncEnvelopes` — every batch is produced by a single `GqlRequestChannel` stamping one `channelId` on every envelope (`gql-req-channel.ts:785-843`), so the client knows which drive owns the channel and sets the header accordingly.

   **Historical options considered** (under the body-parsing model, none viable; all moot under the header model): (a) reject multi-id requests at the LB with 409 — was M2 v1; deleted; (b) server-side split-and-merge; (c) client pre-grouping; (d) coordinator backend; (e) federation-aware switchboard.

8. **Nested identifier paths.**

   **Decided (2026-05-05):** moot. The header model never reads the request body, so there is no notion of "where in the body does the routing key live". The drive id is on the `Drive-Id` HTTP header; what's inside the body is the upstream's problem. The Lua module (`lua/route.lua`) is two effective lines; the §4.3 nested-path table from the body-parsing era is gone.

   **Historical options considered** (all under the body-parsing model): (a) hard-code paths in `lua/route.lua`; (b) generate the path table from the schema; (c) client-supplied routing header. Option (c) is what we ended up doing — but as the only routing input rather than a supplement to body parsing.

9. **Supergraph vs. subgraph routing.** Today `POST /graphql` (supergraph), `POST /graphql/r` (reactor), and `POST /graphql/<model>` are all served by the same switchboard per request, so the LB treats them identically. If the supergraph ever federates across multiple switchboards — or if model-specific subgraphs move to dedicated processes — path-based routing re-enters the picture. _Not a blocker for M2; revisit when real traffic or deployment topology forces the question._

10. **GET `/graphql`, request batching, and APQ-only requests.** Today the LB is POST-only with a single JSON object and routable identifier in `variables` (§4.1). Anything else (GET with a query string, JSON-array request batching, persisted-query-only requests with no `variables`) is rejected with 400 because there's no body shape we can extract a routing key from.

    **Decided (2026-04-27):** keep the POST-only contract. We do not synthesize a doc id from a query string, do not split request batches at the LB, and do not parse `extensions.persistedQuery` to look up the underlying operation. The contract published to clients is simple, the failure mode is loud, and the alternative is either a GraphQL parser at the LB (not happening) or a coordinator backend (hotspot, ruled out under §9 Q7).

    **Revisit trigger:** a real client need we don't already control. If introspection over GET becomes important, route GETs on `/graphql` to any healthy backend without body parsing. If batching becomes important, push the split to clients first; only consider LB-side splitting once a measured pain exists.

## 10. Appendix — references

- nginx `ngx_http_upstream_hash_module` — the `hash $var consistent` directive we rely on.
- OpenResty `ngx.req.read_body` docs — the primitive that makes body inspection possible.
- OpenResty `ngx.timer` and cosocket APIs — the primitives our custom probe loop in `lua/healthcheck.lua` is built on. (We considered `lua-resty-upstream-healthcheck` for this; §5.2 has the rejection rationale.)
- `nginx-lua-prometheus` — metrics exporter.
- Jump consistent hash (Lamping & Veach) and rendezvous hashing (Thaler & Ravishankar) — background on the scheme nginx implements.
- HAProxy's `balance hash <var> consistent` — the closest drop-in alternative if we ever move off OpenResty.
