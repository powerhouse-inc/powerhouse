# switchboard-lb — Architecture

This document is the design spec. `CLAUDE.md` covers _how we work_; this covers _what we're building and why_.

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

| Class                          | Example                                                     | Where `$doc_id` comes from                                                                             |
| ------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| **Subgraph (document-scoped)** | `POST /graphql`, `POST /graphql/r`, `POST /graphql/<model>` | Lua reads body, parses JSON, pulls the owning identifier from `variables`. Key set documented in §4.3. |
| **Drive metadata**             | `GET /d/:drive`                                             | REST; returns the same payload from any backend. Routed to any healthy backend.                        |
| **Global**                     | `GET /health`, introspection queries                        | handled by the LB directly or routed to any backend.                                                   |
| **Subscription**               | `WS /graphql/subscriptions`                                 | upgrade forwarded to the pool; sticky for the connection's lifetime.                                   |

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

This is illustrative, not final — it handles only the single-top-level-key case. The M2 `lua/route.lua` additionally walks nested paths (`filter.documentId`, `input.filter.documentId`), rejects multi-identifier batches (`identifiers[]`, cross-parent `moveChildren`, cross-channel `pushSyncEnvelopes`) with 409, and routes `pushSyncEnvelopes` on `envelopes[0].channelMeta.id`. See §4.3 for the key set, §4.4 for multi-document policy, and §9 Q7/Q8 for rationale. Every module in `lua/` still fits on one screen.

### 4.3 Body inspection rules

1. Cap the body via `client_max_body_size 256k` in the server block. Oversize bodies get `413` before Lua runs.
2. `ngx.req.read_body()` buffers the body into memory (never to disk for our sizes; see `client_body_buffer_size`).
3. Parse with `cjson.safe` — never the raising variant.
4. Look for the owning identifier in `variables`. The documented key set, derived from the real subgraph resolvers:

   | Key                                                | Operations                                                                                                                         |
   | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
   | `identifier`                                       | `document`, `deleteDocument`, all `<Model>.document` queries                                                                       |
   | `identifiers` _(array)_                            | `deleteDocuments` — see §4.4                                                                                                       |
   | `documentIdentifier`                               | `mutateDocument`, `mutateDocumentAsync`, `renameDocument`                                                                          |
   | `parentIdentifier`                                 | `createDocument(parentIdentifier?)`, `createEmptyDocument(parentIdentifier?)`, `addChildren`, `removeChildren`, `documentChildren` |
   | `childIdentifier`                                  | `documentParents`                                                                                                                  |
   | `sourceParentIdentifier`, `targetParentIdentifier` | `moveChildren` — both present — see §4.4                                                                                           |
   | `docId`                                            | every per-operation mutation generated for a document model (sync + async)                                                         |
   | `filter.documentId` (nested)                       | `documentOperations` query                                                                                                         |
   | `input.filter.documentId` (nested, list variant)   | `touchChannel`                                                                                                                     |
   | `envelopes[0].channelMeta.id` (nested)             | `pushSyncEnvelopes` — route on this; supersedes the old operations-walk. See §4.4 and §9 Q7.                                       |

5. If no identifier is found, return `409` with a message pointing at the documented key set. We **do not guess**.

We explicitly do **not** run a GraphQL operation parser. The contract with clients is: the owning identifier appears in one of the documented `variables` keys above. We publish and version that contract.

### 4.4 Multi-document requests

Several real mutations carry more than one document identifier. MVP policy is **reject with 409** whenever the correct single backend cannot be determined. Forwarding multi-id requests to any healthy backend is never acceptable — it silently violates the pinning invariant.

- `deleteDocuments` — `variables.identifiers[]` array present → 409.
- `moveChildren` — both parents present and equal → route on that value; both present and different → 409.
- `pushSyncEnvelopes` — route on `envelopes[0].channelMeta.id`; envelopes spanning multiple channels → 409.
- `touchChannel` — `variables.input.filter.documentId` single element → route; list > 1 → 409.
- Any request with no identifier after all rules run → 409.

See §9 Q7 for rationale and the historical options that were ruled out.

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

- **M0 — Skeleton.** `Dockerfile`, `docker-compose.yml` with LB + 3 stub upstreams, `nginx.conf` serving `/health`. `busted` wired up. Load-test baseline to measure nginx-alone overhead before Lua enters the path. _(≈2 days)_
- **M1 — Proxy plumbing.** `POST /graphql` and `POST /graphql/*` proxied to the upstream pool with an interim non-pinning balancer (`least_conn`); `GET /d/:drive` and `WS /graphql/subscriptions` likewise. `/health` still served locally. `proxy_next_upstream off` throughout. Integration tests assert path preservation, `X-Request-Id` passthrough, and that the subscription upgrade reaches the pool. No consistent hashing yet — the real API never encodes the owning document in the URL, so path-based pinning is impossible. _(≈2 days)_
- **M2 — Body-based routing.** `lua/route.lua` reads the body, extracts the owning identifier per the §4.3 key set and the §9 Q7/Q8 policies, and sets `$doc_id`. Ships in three stages: (1) docs-only update reflecting §9 Q5/Q7/Q8 decisions; (2) Lua + unit + integration tests land while `upstreams.conf` still uses `least_conn` — Lua runs but is ignored for routing, and `m1.sh` must still pass; (3) `upstreams.conf` flips to `hash $doc_id consistent` — pinning goes live. Multi-identifier operations reject with 409 per §4.4; `pushSyncEnvelopes` routes on `envelopes[0].channelMeta.id`. _(≈2 days)_
- **M3 — Health checks + error policy.** `lua-resty-upstream-healthcheck` configured. `proxy_next_upstream off`. Explicit 409 for multi-doc requests and missing doc ids. _(≈2 days)_
- **M4 — Observability.** `nginx-lua-prometheus` wired up, custom `log_format`, `/metrics` on a separate listener. _(≈2 days)_
- **M5 — Production hardening.** Fuzz the body parser, run ASAN on the openresty image (the one upstream provides is fine), document the reload runbook, document the "backend list is immutable" operational rule. _(open-ended)_

After M5 we reassess: directory-based pinning? TLS termination moved into the LB? HTTP/2 upstream?

End-to-end this is **~2–3 weeks of calendar time**, not months.

## 9. Open questions

Unresolved. Decide before the relevant milestone and record the decision here.

1. **Do we need a `balancer_by_lua_block` instead of `hash $doc_id consistent`?**

   **Decided (2026-04-21):** use the native `hash $doc_id consistent` directive. The MVP routing function is a pure function of `$doc_id`, which the built-in directive handles in C with Ketama-style consistent hashing and free integration with `server ... max_fails/fail_timeout` and active health checks. `balancer_by_lua_block` is the right tool only when the routing decision depends on state the directive cannot express (external directory, per-request migration hint, load-aware override) — none of which are MVP requirements. Adopting Lua on the balancer phase would add per-request overhead on top of the M2 body parse, duplicate `server`-directive behavior, and enlarge what we have to reason about under reload.

   **Revisit trigger:** introduction of an external pinning directory (§5.4), or a per-request decision that is not a pure function of `$doc_id`.

   **M1 config reconciliation.** `conf/upstreams.conf` currently declares `hash $doc_id consistent` even though nothing populates `$doc_id` — every request would hash to the same backend. The M1 commit reverts the upstream to `least_conn` per §8; M2 restores `hash $doc_id consistent` in the same commit that introduces `lua/route.lua`, so the swap and the Lua that populates `$doc_id` land atomically — never a window where the config hashes on an empty key.

   _Amendment (2026-04-21):_ the `map "" $doc_id { default ""; }` block in `conf/nginx.conf` stays across every milestone. `conf/log_format.conf` references `$doc_id` directly, and nginx fails config parse with `unknown variable "$doc_id"` if the map is absent. Only the upstream directive changes between M1 and M2.

2. **Read vs write routing.** MVP routes both with the same function. Is there a case for fanning reads to any healthy backend? Only if reads tolerate stale data, and Reactor semantics suggest they don't. _Defer until after M5._
3. **Subscription stickiness across reloads.** A long-lived WS/SSE connection stays on the same worker's upstream connection across a reload because old workers drain gracefully. We need an integration test that actually proves this. _Owner: M3._
4. **How do operators migrate a document between backends?** Cross-cutting design touching `switchboard` and `reactor`. Until it exists, the backend list is immutable in prod. _Decide before we operate this at any meaningful scale._
5. **`POST /graphql` with no extractable doc id.**

   **Decided (2026-04-21):** reject with `409 Conflict`. The LB does not guess and does not forward to a default backend. If real traffic ever demands a broadcast escape hatch, that decision is revisited explicitly. Rule: fail loudly, never silently incorrect.

6. **Where does TLS terminate?** MVP assumes a TLS-terminating edge in front. If that's not available in a given deploy, we enable `listen 443 ssl;` in this LB.

   **Decided (2026-04-21, M1 scope):**
   - **Dev / CI:** plain HTTP on `:8080` (unchanged).
   - **Prod:** LB stays plain HTTP on `:8080` behind a separate TLS-terminating edge (cloud LB, ALB, or upstream nginx) that forwards plain HTTP to the LB's internal interface. This matches §1's non-goal and keeps the MVP out of cert-rotation / cipher-policy territory.
   - **In-LB TLS (`listen 443 ssl;`):** not built in M1. Add only when a specific deploy demands it — no speculative scaffolding.

   **Operational requirements this creates** (to be captured in a future `DEPLOY.md`; not a blocker for M1 code): the LB listener MUST NOT be exposed to the public internet directly; the TLS edge is responsible for `X-Forwarded-For` / `X-Forwarded-Proto`, which the LB will honor via `set_real_ip_from <edge CIDR>; real_ip_header X-Forwarded-For;` once we add that config (deferrable to M3/M4).

   **Revisit trigger:** a specific deploy where no upstream TLS terminator is available, or a client that requires direct mTLS to the LB.

7. **Multi-identifier operations.**

   **Decided (2026-04-21):** MVP policy is reject-with-409 whenever the correct single backend cannot be determined.
   - `deleteDocuments(identifiers: [ID!]!)` — non-empty `variables.identifiers` array → 409. Split-and-fan-out deferred.
   - `moveChildren(sourceParentIdentifier, targetParentIdentifier, …)` — both parents present and equal → route on that value; both present and different → 409; only one present → route on it.
   - `pushSyncEnvelopes(envelopes: [...])` — reactor-to-reactor sync protocol. Route on `variables.envelopes[0].channelMeta.id`; if any envelope has a different `channelMeta.id`, return 409. Schema-verified 2026-04-21: `SyncEnvelopeInput.channelMeta: ChannelMetaInput!` and `ChannelMetaInput.id: String!` are both non-null (`packages/reactor-api/src/graphql/reactor/schema.graphql:325-332`), and every batch is produced by a single `GqlRequestChannel` stamping its own `channelId` on every envelope (`gql-req-channel.ts:785-843`) — all envelopes in one call share one `channelMeta.id` by construction.

   **Historical options considered** (none viable for MVP): (a) server-side split-and-merge — complex, deferred; (b) client pre-grouping — pushes complexity to every caller; (c) coordinator backend — hotspot; (d) federation-aware switchboard — no cross-Reactor coordinator exists today, so this option is impossible rather than undesirable.

8. **Nested identifier paths.**

   **Decided (2026-04-21):** hard-code the paths in `lua/route.lua` (option a). The schema shapes are stable internal protocol; generating from the schema (option b) adds build-time complexity; a client-supplied header (option c) pushes work to every caller.
   - `documentOperations` → `variables.filter.documentId` (string).
   - `touchChannel` → `variables.input.filter.documentId` (list). Accept single-element list; reject multi-element with 409.
   - `pushSyncEnvelopes` → `variables.envelopes[0].channelMeta.id`. This **supersedes** the nested `envelopes[].operations[].context.documentId` path listed in §4.3; `channelMeta.id` is the first-class routing key — always present, same for every envelope in a push.

   **Historical options considered**: (a) hard-code — chosen; (b) generate from schema — deferred; (c) client-supplied header — rejected (breaks the "no client changes" property).

9. **Supergraph vs. subgraph routing.** Today `POST /graphql` (supergraph), `POST /graphql/r` (reactor), and `POST /graphql/<model>` are all served by the same switchboard per request, so the LB treats them identically. If the supergraph ever federates across multiple switchboards — or if model-specific subgraphs move to dedicated processes — path-based routing re-enters the picture. _Not a blocker for M2; revisit when real traffic or deployment topology forces the question._

## 10. Appendix — references

- nginx `ngx_http_upstream_hash_module` — the `hash $var consistent` directive we rely on.
- OpenResty `ngx.req.read_body` docs — the primitive that makes body inspection possible.
- `lua-resty-upstream-healthcheck` — active health probes.
- `nginx-lua-prometheus` — metrics exporter.
- Jump consistent hash (Lamping & Veach) and rendezvous hashing (Thaler & Ravishankar) — background on the scheme nginx implements.
- HAProxy's `balance hash <var> consistent` — the closest drop-in alternative if we ever move off OpenResty.
