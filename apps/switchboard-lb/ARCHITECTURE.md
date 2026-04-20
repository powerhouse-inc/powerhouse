# switchboard-lb — Architecture

This document is the design spec. `CLAUDE.md` covers *how we work*; this covers *what we're building and why*.

**Implementation target: OpenResty** (nginx + Lua). See §2 for why.

## 1. Goals and non-goals

### Goals

1. **Correctness first**: a given document is always routed to the same `switchboard` instance for the lifetime of that pinning. No split-brain writes.
2. **Payload-aware routing**: inspect GraphQL requests deeply enough to find the document being touched, cheaply.
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

| Approach | Verdict |
| --- | --- |
| Custom C daemon | Rejected for MVP. Large surface area, long timeline, and the interesting problems (pinning invariant, migration story) are independent of language. Revisit only if we outgrow OpenResty. |
| Plain nginx | Rejected. `hash $var consistent` can hash on URL params or headers, but cannot read a JSON request body. The path-scoped route would work; the `POST /graphql` route would not. |
| HAProxy + Lua | Viable. `http-buffer-request` + a Lua converter can set a variable, then `balance hash <var> consistent` routes. Slightly less mature Lua ecosystem than OpenResty for this specific shape. |
| **OpenResty (nginx + Lua)** | **Chosen.** First-class body access via `ngx.req.read_body()`, mature `cjson`, native `hash $var consistent` in the upstream block, rich `lua-resty-*` ecosystem for health checks and metrics. |

What OpenResty buys us concretely:

- **nginx** handles accept loop, HTTP parsing, keep-alive, upstream pooling, graceful reload, worker supervision.
- **`rewrite_by_lua` / `access_by_lua`** is the exact phase we need to inspect the body and set a routing variable *before* the upstream is chosen.
- **`hash $doc_id consistent`** in the upstream block does rendezvous-style consistent hashing natively.
- **`lua-resty-upstream-healthcheck`** handles active probing with well-understood semantics.
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
accept ─▶ parse headers ─▶ rewrite_by_lua: classify + extract doc id
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

| Class                        | Example                                                       | Where `$doc_id` comes from                                                                                  |
| ---------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| **Subgraph (document-scoped)** | `POST /graphql`, `POST /graphql/r`, `POST /graphql/<model>` | Lua reads body, parses JSON, pulls the owning identifier from `variables`. Key set documented in §4.3.      |
| **Drive metadata**           | `GET /d/:drive`                                               | REST; returns the same payload from any backend. Routed to any healthy backend.                             |
| **Global**                   | `GET /health`, introspection queries                          | handled by the LB directly or routed to any backend.                                                        |
| **Subscription**             | `WS /graphql/subscriptions`                                   | upgrade forwarded to the pool; sticky for the connection's lifetime.                                        |

Every document-touching request pays a body read + JSON decode. There is no path-only fast path — the real switchboard GraphQL surface (see `packages/reactor-api/src/graphql/reactor/subgraph.ts` and `document-model-subgraph.ts`) never encodes the owning document in the URL. The body-parse cost dominates the LB's per-request overhead; see §2 for the tradeoff we accepted in picking OpenResty.

### 4.2 Concrete config sketch

```nginx
# upstreams.conf
upstream switchboards {
    hash $doc_id consistent;
    server sb-1.internal:4001 max_fails=3 fail_timeout=10s;
    server sb-2.internal:4001 max_fails=3 fail_timeout=10s;
    server sb-3.internal:4001 max_fails=3 fail_timeout=10s;
    keepalive 64;
}

# routes.conf
server {
    listen 8080;
    client_max_body_size 256k;

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

    # Document-scoped: supergraph, reactor subgraph, and every
    # document-model subgraph all share this prefix. Owning id
    # comes from the JSON body.
    location /graphql {
        rewrite_by_lua_block { require("route").from_body() }
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
-- lua/route.lua — illustrative single-identifier path only.
-- Multi-identifier and nested-path cases are deferred to §9 Q7/Q8.
local cjson = require("cjson.safe")

local M = {}

-- Top-level identifier keys across ReactorSubgraph and DocumentModelSubgraph.
-- See §4.3 for the full set and which operations use each.
local ID_KEYS = {
  "identifier",          -- document, deleteDocument, doc-model queries
  "documentIdentifier",  -- mutateDocument{,Async}, renameDocument
  "parentIdentifier",    -- addChildren, removeChildren, createDocument
  "childIdentifier",     -- documentParents
  "docId",               -- every per-operation mutation on document models
}

function M.from_body()
  ngx.req.read_body()
  local body = ngx.req.get_body_data()
  if not body then return require("errors").bad_request("empty body") end

  local payload = cjson.decode(body)
  if type(payload) ~= "table" or type(payload.variables) ~= "table" then
    return require("errors").bad_request("missing or malformed variables")
  end

  local found
  for _, k in ipairs(ID_KEYS) do
    local v = payload.variables[k]
    if type(v) == "string" and #v > 0 then
      if found and found ~= v then
        return require("errors").conflict("multiple identifiers in variables")
      end
      found = v
    end
  end

  if not found then
    return require("errors").conflict("no identifier in variables")
  end

  ngx.var.doc_id = found
end

return M
```

This is illustrative, not final — it handles only the single-top-level-key case. The real Lua module has to deal with nested paths (`filter.documentId`, `envelopes[].operations[].context.documentId`), array-valued identifier fields (`identifiers[]`), and legitimate multi-identifier operations (`moveChildren`, `deleteDocuments`). Those cases are open design (§9 Q7/Q8) and will shape what `route.lua` ends up looking like. Every module in `lua/` is still expected to fit on one screen once the design settles.

### 4.3 Body inspection rules

1. Cap the body via `client_max_body_size 256k` in the server block. Oversize bodies get `413` before Lua runs.
2. `ngx.req.read_body()` buffers the body into memory (never to disk for our sizes; see `client_body_buffer_size`).
3. Parse with `cjson.safe` — never the raising variant.
4. Look for the owning identifier in `variables`. The documented key set, derived from the real subgraph resolvers:

    | Key | Operations |
    | --- | --- |
    | `identifier` | `document`, `deleteDocument`, all `<Model>.document` queries |
    | `identifiers` *(array)* | `deleteDocuments` — see §4.4 |
    | `documentIdentifier` | `mutateDocument`, `mutateDocumentAsync`, `renameDocument` |
    | `parentIdentifier` | `createDocument(parentIdentifier?)`, `createEmptyDocument(parentIdentifier?)`, `addChildren`, `removeChildren`, `documentChildren` |
    | `childIdentifier` | `documentParents` |
    | `sourceParentIdentifier`, `targetParentIdentifier` | `moveChildren` — both present — see §4.4 |
    | `docId` | every per-operation mutation generated for a document model (sync + async) |
    | `filter.documentId` (nested) | `documentOperations` query |
    | `input.filter.documentId` (nested, list variant) | `touchChannel` |
    | `envelopes[].operations[].context.documentId` (nested + list) | `pushSyncEnvelopes` — see §4.4 |

5. If no identifier is found, return `409` with a message pointing at the documented key set. We **do not guess**.

We explicitly do **not** run a GraphQL operation parser. The contract with clients is: the owning identifier appears in one of the documented `variables` keys above. We publish and version that contract.

### 4.4 Multi-document requests

Several real mutations carry more than one document identifier by design:

- `deleteDocuments(identifiers: [ID!]!)` — arbitrary batch.
- `moveChildren(sourceParentIdentifier, targetParentIdentifier, …)` — two parents, potentially on different backends.
- `pushSyncEnvelopes(envelopes: [...])` — each envelope's operations can target a different `documentId`.

Rejecting these with `409` would break legitimate traffic. Forwarding them blindly to a single backend is correct only when every referenced document happens to pin there. The resolution is an open design decision (§9 Q7) and blocks the final M2 implementation. Until it's resolved, the LB forwards multi-identifier requests to any healthy backend; the correctness gap for those specific operations is explicit and tracked.

### 4.5 Failure modes

- **Upstream refuses connection** → nginx marks it failed per `max_fails` / `fail_timeout`. The request fails with `502`. **We set `proxy_next_upstream off`** — retrying on another backend would violate the pinning invariant.
- **Upstream times out mid-request** → `504`, same rule: no retry.
- **Upstream returns 5xx** → pass through unchanged.
- **Backend marked unhealthy by active checks** → removed from the consistent hash ring for that worker. Documents pinned to it become unroutable and return `503` until the backend recovers or an operator intervenes.

## 5. Pinning and routing

This is the heart of the system. Getting it wrong means data corruption.

### 5.1 Invariant

> For a given document id `D`, all successful mutations land on the same backend `B(D)` for as long as `D` exists. Reads **may** go anywhere, but in the MVP we route reads with the same function for simplicity and cache affinity.

### 5.2 Mechanism

nginx's `hash $var consistent` implements [Ketama](https://en.wikipedia.org/wiki/Consistent_hashing)-style consistent hashing across the `server` entries in the upstream block. Weight of each server is configurable. Adding or removing a server remaps ~1/N of keys — the same fundamental tradeoff any stateless scheme has.

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
  - `lb_body_parse_errors_total{reason}`
  - standard nginx stubs via `stub_status`
- **Logs**: custom `log_format` in `log_format.conf` emitting key=value. Include `request_id`, `remote_addr`, `doc_id` (when extracted), `upstream_addr`, `status`, `request_time`, `upstream_response_time`.
- **Traces**: out of scope for the MVP. Slot reserved for OpenTelemetry (`opentelemetry-nginx` module) later.

## 7. Concurrency model

nginx decides this for us, and that's part of the appeal:

- **`worker_processes auto;`** — one worker per core.
- **`SO_REUSEPORT`** via `listen ... reuseport;` so the kernel balances accepts.
- **Lua state is per-worker.** Shared state across workers (e.g., the healthcheck's view of upstream health) uses `lua_shared_dict`.
- **No thread pool, no work stealing.** Each request is handled end-to-end on the worker that accepted it.

We do not write our own event loop; we do not manage our own thread pool. This is a feature.

## 8. Milestones

Thin vertical slices, each end-to-end runnable.

- **M0 — Skeleton.** `Dockerfile`, `docker-compose.yml` with LB + 3 stub upstreams, `nginx.conf` serving `/health`. `busted` wired up. Load-test baseline to measure nginx-alone overhead before Lua enters the path. *(≈2 days)*
- **M1 — Proxy plumbing.** `POST /graphql` and `POST /graphql/*` proxied to the upstream pool with an interim non-pinning balancer (`least_conn`); `GET /d/:drive` and `WS /graphql/subscriptions` likewise. `/health` still served locally. `proxy_next_upstream off` throughout. Integration tests assert path preservation, `X-Request-Id` passthrough, and that the subscription upgrade reaches the pool. No consistent hashing yet — the real API never encodes the owning document in the URL, so path-based pinning is impossible. *(≈2 days)*
- **M2 — Body-based routing.** `lua/route.lua` reads the body, extracts the owning identifier from `variables` per the §4.3 key set, sets `$doc_id`, and `upstreams.conf` switches from `least_conn` back to `hash $doc_id consistent`. Unit tests cover every documented key and every error path. Integration tests prove pinning per identifier. Multi-identifier operations (`deleteDocuments`, `moveChildren`, `pushSyncEnvelopes`) and nested-path identifiers (`filter.documentId`, `envelopes[].operations[].context.documentId`) depend on resolving §9 Q7/Q8 first. *(sized open — pending §9 Q7)*
- **M3 — Health checks + error policy.** `lua-resty-upstream-healthcheck` configured. `proxy_next_upstream off`. Explicit 409 for multi-doc requests and missing doc ids. *(≈2 days)*
- **M4 — Observability.** `nginx-lua-prometheus` wired up, custom `log_format`, `/metrics` on a separate listener. *(≈2 days)*
- **M5 — Production hardening.** Fuzz the body parser, run ASAN on the openresty image (the one upstream provides is fine), document the reload runbook, document the "backend list is immutable" operational rule. *(open-ended)*

After M5 we reassess: directory-based pinning? TLS termination moved into the LB? HTTP/2 upstream?

End-to-end this is **~2–3 weeks of calendar time**, not months.

## 9. Open questions

Unresolved. Decide before the relevant milestone and record the decision here.

1. **Do we need a `balancer_by_lua_block` instead of `hash $doc_id consistent`?** The native `hash` directive is simpler and faster, but it doesn't give us per-request control (e.g., to consult an external directory). MVP answer: `hash`. Revisit when/if we introduce a directory. *Decide before M1.*
2. **Read vs write routing.** MVP routes both with the same function. Is there a case for fanning reads to any healthy backend? Only if reads tolerate stale data, and Reactor semantics suggest they don't. *Defer until after M5.*
3. **Subscription stickiness across reloads.** A long-lived WS/SSE connection stays on the same worker's upstream connection across a reload because old workers drain gracefully. We need an integration test that actually proves this. *Owner: M3.*
4. **How do operators migrate a document between backends?** Cross-cutting design touching `switchboard` and `reactor`. Until it exists, the backend list is immutable in prod. *Decide before we operate this at any meaningful scale.*
5. **`POST /graphql` with no extractable doc id.** MVP rejects with `409`. Revisit if real traffic demands a "broadcast" or "default backend" escape hatch — but the default should be "reject loudly," not "guess."
6. **Where does TLS terminate?** MVP assumes a TLS-terminating edge in front. If that's not available in a given deploy, we enable `listen 443 ssl;` in this LB. *Decide per environment, not globally.*
7. **Multi-identifier operations.** `deleteDocuments(identifiers: [ID!]!)`, `moveChildren(sourceParentIdentifier, targetParentIdentifier, …)`, and `pushSyncEnvelopes(envelopes: [...])` carry several identifiers that may pin to different backends. Options: (a) server-side split-and-fan-out with response merge — complex, transparent to clients; (b) require clients to pre-group by owning backend — pushes complexity to every client; (c) route all multi-identifier requests to a designated coordinator backend — simple, but introduces a hotspot; (d) forward to any backend and require `switchboard` to handle cross-backend coordination internally — turns the LB into a correctness-only gate and makes `switchboard` federation-aware. *Decide before M2 starts. Blocks M2.*
8. **Nested identifier paths.** `documentOperations(filter: {documentId})`, `touchChannel(input: {filter: {documentId: [...]}} )`, and `pushSyncEnvelopes(envelopes: [{operations: [{context: {documentId}}]}])` place the owning id inside nested (and sometimes array) structures. The Lua body walk needs to know these shapes, which couples the LB to the subgraph schemas more tightly than we'd like. Options: (a) hard-code the paths in `lua/route.lua`; (b) generate the path list from the GraphQL schema at build time; (c) require a client-supplied header carrying the owning id so the LB doesn't walk the body at all for these cases. *Decide alongside Q7.*
9. **Supergraph vs. subgraph routing.** Today `POST /graphql` (supergraph), `POST /graphql/r` (reactor), and `POST /graphql/<model>` are all served by the same switchboard per request, so the LB treats them identically. If the supergraph ever federates across multiple switchboards — or if model-specific subgraphs move to dedicated processes — path-based routing re-enters the picture. *Not a blocker for M2; revisit when real traffic or deployment topology forces the question.*

## 10. Appendix — references

- nginx `ngx_http_upstream_hash_module` — the `hash $var consistent` directive we rely on.
- OpenResty `ngx.req.read_body` docs — the primitive that makes body inspection possible.
- `lua-resty-upstream-healthcheck` — active health probes.
- `nginx-lua-prometheus` — metrics exporter.
- Jump consistent hash (Lamping & Veach) and rendezvous hashing (Thaler & Ravishankar) — background on the scheme nginx implements.
- HAProxy's `balance hash <var> consistent` — the closest drop-in alternative if we ever move off OpenResty.
