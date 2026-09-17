# 10 — Package-hosted HTTP routes and webhooks

Status: **implemented and settled**, awaiting release. Layers 0-2 and the workflow port are
built and tested; §8 records what shipped, what changed under contact with the
code, and what was deliberately deferred. `webhook-router.ts` is deleted.

The one thing not yet done is the release ordering: the workflow port depends on
a `@powerhousedao/reactor-api` that carries the route service, which is not
published. Until it is, `reactor-workflow` builds against a local `link:`
override that must stay out of the manifest (see §8.4).

Companion to `02-feature-spec.md` §7.2 (fleet behaviour of webhooks) and
`09-secrets-service-spec.md` (signing secrets by ref). Answers the open spike in
`03-implementation-plan.md` about `IHttpAdapter.mountNodeRoute` and raw bodies:
the answer is **no, it cannot deliver raw bytes today**, and §2 fixes that.

## 1. Why

`reactor-workflow` needs an inbound HTTP endpoint so providers can deliver
webhooks. The implementation this document replaced reached through
`GraphQLManager`'s private fields for the `http.Server` and mounted a listener
itself, because `mountNodeRoute` could not honour a signature computed over the
request bytes. That was 303 lines of transport plumbing in a workflow package,
and about 300 of the 489 lines in its `webhook.ts` were not about workflows
either.

The generic capability is **route hosting**; a webhook is a *policy preset* on
top of it. Three consumers already exist in the monorepo with nothing shared
between them (`packages/reactor-mcp/src/mcp-routes.ts`, the switchboard
attachment routes, the workflow webhook), and `apps/switchboard` has already
grown the missing layer locally: `mountAuthenticatedNodeRoute` in
`apps/switchboard/src/attachments/mount-auth.ts` wraps every route in
`requireAuth` and documents that the way to skip auth is to call the adapter
directly. That is a route service living in an app.

### Naming

Two names, deliberately:

* **Route hosting** — the generic thing. Any package may serve REST alongside
  the switchboard API.
* **Webhook** — a route where (a) the caller cannot hold Renown credentials, so
  the URL *is* the credential; (b) the bytes are cryptographically load-bearing,
  so byte-exactness is a hard requirement; (c) redeliveries are expected, so
  dedupe is mandatory; (d) the provider probes for a challenge before it will
  register. None of that applies to a normal route, and all four are
  security-relevant defaults worth owning once.

Calling everything "webhook" drags ordinary read endpoints through token
minting. Calling everything "route" loses those four constraints and lets each
package re-decide them.

## 2. Layer 0 — `IHttpAdapter` guarantees

Four capability gaps that no consumer can work around, so they land first. All
four were confirmed against the worktree; citations are to
`packages/reactor-api/src/graphql/gateway/`.

### 2.1 Raw bodies

The guarantee is not merely missing — it is **content-type-dependent, in
opposite directions per adapter**, which is worse than a flat "no".

*Express.* The constructor does `app.use(this.#router)`
(`adapter-http-express.ts:27-28`), `setupMiddleware` appends `cors` and the body
parsers *inside* that already-mounted router (`:73-77`), and `mountNodeRoute`
registers on `#app` (`:61`) — a later app-stack layer. But body-parser reads the
stream only when the content type matches (`body-parser/lib/types/json.js:120`).
So `application/json` and `application/x-www-form-urlencoded` arrive consumed and
re-parsed, while `application/octet-stream`, `multipart/*`, `text/plain` and a
missing `Content-Type` arrive **unconsumed** with `req.body === {}`. The
switchboard attachment upload streams successfully today on that accident, not by
design.

*Fastify.* `mountNodeRoute` registers no framework route; it pushes into
`#nodeRoutes` (`adapter-http-fastify.ts:118-128`) behind a single catch-all
(`:213-217`). Content-type parsing runs before the handler, so the JSON parser
and `@fastify/formbody` (`:191`) have drained `req.raw` — and a content type with
no registered parser is refused with 415 before the handler is reached at all.
`reply.hijack()` happens too late to help.

Both Fetch bridges additionally reconstruct the body as
`JSON.stringify(req.body)` (`adapter-http-express.ts:205`,
`adapter-http-fastify.ts:301-304`), destroying key order, whitespace and
duplicate keys — so an HMAC over a Fetch-delivered body can never verify.

**Fix.** Express: a pre-parse router created in the constructor, ahead of
`#router`, with node routes registered there. Fastify: match node routes in an
`onRequest` hook — which runs after routing but before parsing — then
`reply.hijack()` and hand over a genuinely unread `req.raw`; this also removes
the 415 wall. Registering the hook after `fastifyCors` (`:195`) keeps CORS
headers applied. A cheaper Express variant that yields byte-exact bytes without
reordering layers is to stash the buffer from body-parser's `verify` callback
(which receives a `Buffer`, since `read.js` forces `encoding = null`); it is
worth knowing, but it does not give an unread stream, so it does not serve
streaming uploads.

### 2.2 Response streaming

**Fetch-mounted handlers cannot stream on either adapter.** Both terminate a
response by fully buffering it: `res.send(await response.text())`
(`adapter-http-express.ts:220-221`) and
`reply.send(await response.text())` (`adapter-http-fastify.ts:308-309`);
`getRoute` has the same defect (`adapter-http-fastify.ts:287-289`).

A `graphql-sse` response body is an open `ReadableStream` that closes only when
the subscription completes, so `await response.text()` never resolves. That means
**GraphQL-over-SSE, mounted at `graphql-manager.ts:915`, cannot be delivering
events today** — WebSocket (`:761-765`) is the only working subscription
transport. Independently of this spec, that is a bug worth filing.

Consequence for the design: a Fetch handler signature is necessary but not
sufficient. Layer 0 must add a real response-streaming path — pipe a
`ReadableStream` body to the socket rather than awaiting `.text()` — before any
package can be told to serve downloads or event streams through a scope.

### 2.3 Route removal

Packages hot-reload, so a route scope must be disposable — a capability
`IHttpAdapter` does not have in any form.

The two adapters have half-converged on the answer already. Fastify registers no
per-call framework routes: everything lives in `#fetchRoutes` / `#getRoutes` /
`#nodeRoutes` (`adapter-http-fastify.ts:68-73`) behind one `/*` route, so removal
is a splice. Express is halfway: `mount()`'s exact-match `#handlers` Map is
removable *precisely because* dispatch goes through one permanently-registered
middleware (`adapter-http-express.ts:80-88`), while `getRoute` (`:113`),
`mountNodeRoute` (`:61`) and prefix `mount()` (`:97`) register on the framework
directly and cannot be undone — Express 4.21.1 has no route-removal API, and
splicing `app._router.stack` is not an option we should take.

**Decision: dispatch every route through a mutable registry behind one stable
framework route per adapter**, with every registration returning an
`AdapterRouteHandle` carrying `dispose()`. Give Express Fastify's shape — two constructor-time
layers (a pre-parse router for node routes, which also fixes §2.1, and the
dispatching router), with `getRoute` moved off `#app.get` into a map. Then
`dispose()` is synchronous, framework-independent and identical in both adapters.

Two details this forces:

* Registry entries need a **monotonic id**, not a path key. Fastify's
  `#fetchRoutes.push` has no identity, so two `mount("/graphql")` calls are
  indistinguishable (hence the last-mounted-wins reverse iteration at `:265`),
  and `#getRoutes` is keyed by the *raw* path while matching uses the normalized
  one.
* A catch-all bypasses the framework's own 404/405. Fastify already synthesizes
  404 (`:272`); Express will need that, plus 405 for a path that has node routes
  only under other methods.

Post-`listen` registration must keep working — the contract-test harnesses
register every route after `listen(0)` — which independently rules out anything
but a registry.

### 2.4 Smaller interface defects to fix in passing

* **`mount()` delivers no path params.** Three call sites already hand-roll
  recovery: `graphql-manager.ts:215-219` builds its own `path-to-regexp` matcher
  for `d/:drive`, `server.ts:736-738` string-slices the explorer segment, and
  `attachments/routes.ts:411-418` reads the framework-injected `req.params`.
  Decoded params become a first-class handler argument.
* **No `PATCH`.** `mountNodeRoute`'s method union is
  `DELETE | GET | HEAD | POST | PUT` (`types.ts:125`); Fastify's catch-all does
  register PATCH (`adapter-http-fastify.ts:214`) then casts it away (`:232-237`),
  so a PATCH can only ever reach a Fetch route.
* **`{ exact: true }` means prefix, not exact** (`types.ts:83-87`). Name it
  honestly in the scope (`prefix: true`).
* **Precedence flips** once node routes move ahead of the parsers: today the
  method-agnostic Fetch dispatcher wins a shared path; afterwards the node route
  wins for its method. Fastify already behaves the new way (`#dispatch` checks
  `#nodeRoutes` first, `:242`). Pin it with a contract test rather than leaving
  it implicit.
* **`cors` sits on `#router`**, after where the pre-parse router goes. Do not add
  a second `cors()` there — it would double `Access-Control-Allow-Origin` on
  router-served responses. Install a mutable slot in the constructor and have
  `setupMiddleware` assign into it.
* **`readonly handle: unknown` (`types.ts:145`) has zero production consumers.**
  Do not carry an equivalent onto the scope.

### 2.5 Conformance tests

`packages/reactor-api/test/gateway/http-adapter-contract.ts` exports
`runHttpAdapterContractTests(name, createHarness)` (`:61`) and is consumed by two
28-line files that only build a harness
(`test/gateway/adapter-http-express.test.ts:28`,
`adapter-http-fastify.test.ts:28`). All new cases go into the contract file with
no change to the consumers:

* raw-body byte-exactness — must cover a non-JSON content type and a POST with no
  `Content-Type`, since that is exactly where the adapters diverge today;
* response streaming — assert first byte arrives before the stream closes;
* route removal via `dispose()`;
* method+path collision refusal, and node-route-vs-Fetch precedence.

Route-removal cases need the handle in `types.ts` first, plus updating the
`vi.fn()` adapter mocks at `test/graphql-manager.test.ts:129-135` and
`packages/reactor-mcp/test/setup-mcp-server.test.ts:71` to return handles.

## 3. Layer 1 — `IHttpScope`

One object per package, handed in already bound. The package never sees an
unscoped registrar and cannot express an absolute path, which is what makes the
namespace forced rather than conventional.

```ts
export interface IHttpScope {
  /**
   * Who the scope belongs to: a package's resolved npm name, or the host's name
   * for one of its own groups (§3.4). An identity, not a URL fragment — it is in
   * the path for a package scope and absent from a host one.
   */
  readonly owner: string;
  /** Absolute public base for this scope: https://host/api/<owner> */
  readonly baseUrl: string;

  // Fastify-style: shorthands for the common case, the object form for the rest.
  get(path: string, handler: RouteHandler): RouteHandle;
  get(path: string, options: RouteOptions, handler: RouteHandler): RouteHandle;
  post(path: string, handler: RouteHandler): RouteHandle;
  // ...put, patch, delete, head — head registrable independently of get
  route(spec: RouteSpec): RouteHandle;

  /** Escape hatch for hijacked connections, still inside the namespace. */
  nodeRoute(spec: NodeRouteSpec): RouteHandle;

  readonly webhooks: IWebhookScope;

  /** Release every route this scope registered. Called on package teardown. */
  dispose(): void;
}

export interface RouteOptions {
  /** Defaults to "renown". Widening must be written out. */
  auth?: "renown" | "renown-optional" | "public" | RouteAuthorizer;
  body?: "parsed" | "raw" | "stream" | "none";
  maxBodyBytes?: number;
  /** Per client, where "client" depends on the host's `trustProxy` (§3.5). */
  rateLimit?: { perMinute: number };
  /** Prefix match; the handler also serves sub-paths. */
  prefix?: boolean;
}

export interface RouteSpec extends RouteOptions {
  method: HttpMethod | HttpMethod[];   // includes PATCH; excludes OPTIONS
  /** Relative to the scope: "runs/:id", never "/api/workflow/runs/:id". */
  path: string;
  handler: RouteHandler;
}

export type RouteHandler = (
  request: Request,
  ctx: RouteContext,
) => Response | Promise<Response>;

export interface RouteContext {
  /** Decoded, including optional segments. */
  params: Record<string, string>;
  /** Resolved by the scope, not smuggled through a WeakMap. */
  actor: Actor | undefined;
  /** Present only when body: "raw" — the exact octets received. */
  rawBody: Buffer | undefined;
  /** Aborts when the client disconnects. */
  signal: AbortSignal;
  /** Proxy-resolved, so no handler touches req.socket. */
  transport: { proto: string; host: string; prefix: string; baseUrl: string };
}

export interface RouteHandle {
  readonly url: string;
  dispose(): void;
}
```

Two handle types exist, and the distinction is load-bearing: this one carries
the public URL the route answers on, while the adapter's `AdapterRouteHandle`
(§2.3) carries only `dispose()`. At the adapter layer there is no namespace to
build a URL from. They were briefly both called `RouteHandle` and collided in
the bundled `.d.mts`; see §8.2.

`method` is typed `RouteMethod` in the shipped code rather than `HttpMethod` —
the latter name belongs to the adapter layer.

### 3.1 Ergonomics, measured against Express and Fastify

The scope is not a new idea; it is the idiom both frameworks already use, which
is the main argument that it will feel normal.

* Express: `const r = Router(); r.post("/runs/:id", h); app.use("/api/workflow", r)`.
  The router neither knows nor chooses its mount path — it reads it back from
  `req.baseUrl`. `IHttpScope` is a Router the host has already mounted.
* Fastify: `fastify.register(plugin, { prefix: "/api/workflow" })`, where
  encapsulation confines the plugin's routes to the prefix. Fastify's
  `fastify.route({ method, url, handler, schema, config, bodyLimit })` is the
  direct precedent for `RouteSpec` — per-route `bodyLimit` included.

Decisions that follow:

1. **Method shorthands, not spec-objects-only.** Nobody writes
   `route({ method: "GET", ... })` for a simple GET; Fastify ships both forms.
2. **`auth` defaults to `renown`, and widening must be written.** Requiring
   `auth: "renown"` everywhere is noise; what needs to be visible in review is
   the widening — after which `grep 'auth: "public"'` is the complete inventory
   of unauthenticated routes in the fleet. Four modes are needed, because the
   codebase already uses four: unauthenticated (`server.ts:723-726`),
   bearer-required-401 (`attachments/auth.ts:73-78`), bearer-optional with an
   anonymous actor (`attachments/index.ts:56`, the `allowAnonymous` flag), and a
   custom policy gate (MCP's supreme-admin check,
   `services/mcp-request-authorizer.ts:45-51`).
3. **Fetch handlers, not a third convention.** `mount()` is already Fetch-based,
   and a Fetch handler tests without a server. `nodeRoute()` stays for hijacked
   connections — MCP's `StreamableHTTPServerTransport.handleRequest(req, res)`
   writes to the response itself and checks `res.headersSent`
   (`mcp-routes.ts:104-131`), which has no Fetch equivalent — so even the escape
   hatch is namespaced.
4. **`HEAD` is handler-owned, never auto-derived from `GET`.**
   `HEAD /attachments/:hash` (`attachments/routes.ts:331-374`) is a deliberate
   metadata-only response; running the GET and dropping the body would compute
   different headers and stream the whole object to do it.
5. **`OPTIONS` stays framework-owned.** Fastify deliberately excludes it from the
   catch-all so `@fastify/cors` owns preflight
   (`adapter-http-fastify.ts:210-212`), and the require-auth middleware lets it
   through unauthenticated by design (`require-auth-middleware.ts:36-38`). A
   package cannot register `OPTIONS`; the scope guarantees preflight works for
   the namespace.

**Deliberately omitted: `scope.use()` middleware.** Auth, rate limit and body
policy are declarative fields precisely so they can be audited across packages.
Free-form middleware reintroduces "every package decides", which is the problem
this replaces.

### 3.2 Namespacing rules

* URL shape `/api/<namespace>/<route path>`, mirroring `/graphql/<package>`.
* **The namespace is derived by core from the package's *resolved* identity — not
  from the `PackageManager` map key.** The map key is the package specifier as
  configured (`packages/reactor-api/src/packages/package-manager.ts:294`), which
  in practice can be an npm name, an **absolute filesystem path** (switchboard
  pushes `process.cwd()` for the local project,
  `apps/switchboard/src/server.mts:647`), or a **version-suffixed spec** such as
  `@scope/pkg@1.3.9` from `PH_REGISTRY_PACKAGES` (`http-loader.ts:80-95`; only
  the loader strips the tag). Deriving a URL segment from that key would give a
  developer's home directory a route namespace. Resolve the package's real name
  from its `package.json` and use it verbatim, as below.
* Relative paths only: a leading `/`, a `..` segment, or an absolute URL is
  rejected at registration.
* **No deny-list. Collision is prevented structurally.** Nothing in production
  code mounts anything under `/api` today, so a forced `/api/<namespace>/`
  prefix makes shadowing a core route impossible by construction, and the list
  shrinks to the empty set. See §3.3 for why a list — or a snapshot of one — was
  the wrong mechanism.
* **The namespace is the package name verbatim, not a slug.** An earlier draft
  slugged `@powerhousedao/workflow` to `workflow`; that transform is lossy in
  three ways given npm's name grammar
  (`/^(@[a-z0-9][-a-z0-9._]*\/)?[a-z0-9][-a-z0-9._]*$/i`,
  `packages/reactor-api/src/packages/http-loader.ts:219-222`): it drops the
  scope, so `@acme/workflow` and `@powerhousedao/workflow` land on one segment;
  it would fold `.` and `_` to `-`, so `analytics.engine`, `analytics_engine`
  and `analytics-engine` collapse together; and the grammar is
  case-insensitive, so `Workflow` and `workflow` collapse too. Using the name
  verbatim is injective, so there is no collision to detect:

  ```
  /api/@powerhousedao/workflow/runs/:id
  /api/document-model/...
  ```

  `@` is a legal `pchar` under RFC 3986 and `/` is just the segment separator,
  so a scoped name is two segments — the addressing unpkg and jsdelivr already
  use. The URL then names the npm package that serves it.
* **Percent-encoded `@` is normalized, narrowly.** Verified against both
  routers: path-to-regexp v8 and Express 4 both match
  `/api/@powerhousedao/workflow/runs/:id` and bind params correctly, and
  variable depth is a non-issue because each package registers a *literal*
  prefix (ambiguity appears only with a parameterised `/api/:pkg/*rest`
  pattern, which we do not use). But both match the **raw** path, so
  `/api/%40powerhousedao/workflow/runs/42` 404s. `@` is a legal `pchar` so
  browsers, curl and fetch leave it alone, but an SDK that
  `encodeURIComponent`s each segment will not. Normalize exactly one sequence,
  `%40` → `@`, in the shared matching path. **Do not `decodeURIComponent` the
  pathname**: that would turn `%2f` into `/` and let a crafted URL cross segment
  boundaries. `%40` cannot introduce a segment boundary, which is what makes the
  narrow substitution safe.
  *Rejected alternative:* a single segment with the separator substituted
  (`powerhousedao~workflow`) — `~` is unreserved so never encoded, and is
  outside npm's grammar so the mapping stays injective, but the URL stops
  announcing the package.
* Validation is therefore per segment, not "one segment": each of the one or two
  segments must match npm's name grammar. That also excludes `.`/`..`, `:` and
  `*` — `mount()` matches with `path-to-regexp` over an insertion-ordered map
  (`adapter-http-express.ts:80-88`), so those characters would be hazardous
  rather than merely colliding.
* One genuine duplicate survives and is unrelated to naming: **two config
  entries resolving to the same package at different versions.**
  `PH_REGISTRY_PACKAGES` specs keep their tag in the map key
  (`http-loader.ts:80-95`; only the loader strips it), so `@scope/pkg@1.0.0` and
  `@scope/pkg@2.0.0` are distinct keys today and would both load and claim one
  namespace. Refuse that loudly at load.
* A second registration of the same method+path inside one scope **throws**. The
  subgraph precedent is silent first-writer-wins — two same-named subgraphs
  produce the same path and `#setupSubgraphs` skips the second because the handler
  cache already holds it (`graphql-manager.ts:734-736`) — which for routes is the
  wrong default, because a shadowed route fails as a security surprise rather
  than a missing query.

This is stronger than both existing precedents, which are advisory:
`createNamespace(namespace)` takes the string from its caller
(`packages/shared/processors/relational/utils.ts:50`), and a subgraph's path
derives from a `name` the subgraph itself sets.

### 3.3 Why the namespace prefix is structural rather than a deny-list

A hardcoded list drifts as core adds routes, so the first instinct is to build it
dynamically. Neither dynamic form works.

*A snapshot at scope-creation time is badly incomplete*, because registration is
interleaved and packages land in the middle of it. Only `/health`, `/ready` and
`${basePath}/explorer/:endpoint?` are registered before packages
(`server.ts:723-743`). Processor factories receive their module at
`server.ts:955` — *before* `d/:drive`, every subgraph path, the supergraph, SSE,
`/mcp` (`server.ts:1079`), all seven `/attachments/*` routes
(`apps/switchboard/src/server.mts:747`) and the Vite middleware (`:858`). A
processor's snapshot would contain three entries out of dozens. Worse, two
registrants are indefinitely late: `onSubgraphsChange` (`server.ts:497-506`) and
`regenerateDocumentModelSubgraphs` (`graphql-manager.ts:283-296`) mount new paths
whenever a package or document model hot-loads.

*A live-registry check is order-dependent and has one permanent blind spot.*
After the §2.3 refactor the registry does see `getRoute` and `mountNodeRoute`,
covering health/ready/explorer, `/mcp` and `/attachments/*`. But
`mountRawMiddleware` has no path by construction (`types.ts:114`) and, as
`app.use(middleware)`, can answer any path — Vite's dev middleware claims the
whole tree. And the ordering problem remains: a check is only as complete as
what has registered so far, so a processor could claim `mcp` at boot and be
silently shadowed minutes later, with the winner decided by framework matching
order rather than by any rule.

So: force the prefix, drop the list. The one thing that can still break it is
**`BASE_PATH`**. `config.basePath` (`config.ts:5`) is prefixed onto `explorer`,
`d/:drive`, every subgraph path and the supergraph — so `BASE_PATH=/api` moves
core *into* the package prefix and reinstates exactly the collisions the list was
guarding. Therefore:

* derive the prefix as `path.posix.join(config.basePath, "api")`, so it nests
  under `BASE_PATH` instead of racing it;
* assert at boot that no core route registers under it. That assertion is the
  only thing that can drift, and it is checkable mechanically.

A live-registry check is still worth having as *additional* defence, but as a
boot-complete audit that **logs** shadowing — run after
`registerAttachmentRoutes` and the Vite mount — never as an admission gate at
scope creation.

Deployment note: `apps/switchboard-lb/conf/routes.conf` is an allow-list of four
locations (`/graphql/subscriptions`, `/graphql`, `~ ^/d/[^/]+$`, `/health`) with
no rewrites, so `/api/*` currently has no location at all and would fall through
to the nginx default. Package routes behind the LB need a location added. Note
`/health`, `/ready`, `/mcp` and `/attachments/*` are *not* basePath-prefixed, so
a non-root `BASE_PATH` already yields an inconsistent surface today.

**Namespace source.** Derive from the npm package name the `PackageManager`
already keys by — no new plumbing. `powerhouse.manifest.json`'s `ManifestSchema`
(`packages/shared/document-model/schemas.ts:908-921`) is a non-strict `z.object`
so a declared-namespace field would be schema-feasible, but the runtime never
reads the manifest: `PackageManager` loads only document models, upgrade
manifests, subgraphs and processors. Adding manifest loading to `IPackageLoader`
for this would be new plumbing for no gain.

**Related hole worth closing in the same change.** `ISubgraph.path` is an
optional, package-writable field (`graphql/types.ts:36`). The manager injects
`path: this.path` (`graphql-manager.ts:505`) and `BaseSubgraph` assigns
`this.path = args.path ?? ""` (`base-subgraph.ts:73`) — but a subclass field
initializer runs *after* `super()`, so a package subgraph that declares
`path = "/anything"` as a class field silently mounts itself wherever it likes.
Nothing validates it.

### 3.4 Host scopes: who owns the URL space

Revised after the fact. The first pass baked the namespace into the scope
itself, so the only thing a scope could be was a package namespace. That is
wrong in one direction: it made *the host's own* endpoints inexpressible, and
the proof was in this branch — the webhook service (§4) mounted
`/webhooks/:token` straight on the adapter, bypassing the very layer it is
documented as sitting on.

`HttpRouteService.hostScope(name, mountPath)` closes it. **Namespacing is a
package policy, not a property of route hosting.** A package is handed a scope
it did not choose precisely because it is not trusted with the URL space; the
host owns that space already — it holds the adapter — and its endpoints answer
at paths that are part of a published contract a third party already holds: a
webhook URL a provider registered, a protocol endpoint a client is configured
with. Those cannot move under a namespace, and they cannot move when
`basePath` changes either, so the mount path is taken verbatim rather than
joined onto it.

The containment property of §3.3 is untouched:

* `hostScope` is on the **service**, not on `IHttpScope`. A package only ever
  receives a scope, so it holds nothing it could name another path with.
* A host mount **may not sit inside the package prefix**, so a host group can
  never shadow a package's namespace — the one thing the structural prefix
  exists to prevent.
* A host mount must be one literal prefix: absolute, not the root, no traversal
  segment, no pattern segment.
* A host scope has **no webhooks of its own**. A token-addressed endpoint
  belongs to whoever minted the token, which is always a package.

How this was arrived at is worth recording, because it is the method §8.3 asked
for. Two subagents were given the two in-tree consumers — attachments (7 routes,
streaming both ways, real `HEAD`, forwarded-header base URLs, two auth modes)
and MCP (a socket-owning transport at a client-configured path) — on separate
throwaway branches, and told to resolve the URL-ownership problem or to argue
the migration should not happen. Neither saw the other's work. Both concluded
the scope was sufficient *except* for the base, and both proposed the same
primitive under different names. Neither migration is taken here; the primitive
is.

### 3.5 Who a rate limit is charged to

`rateLimit` keyed on `req.socket.remoteAddress` alone, which behind
switchboard-lb is the balancer for every caller — so a declared limit throttled
unrelated clients into one bucket. `X-Forwarded-For` names the real client and
is also client-written, so believing it with no proxy in front lets a caller
rotate its own key past every limit.

There is no value that is right for both topologies, so the host declares which
it is: `trustProxy` on `HttpRouteServiceOptions`, off by default, set on by the
reactor because a balancer is always in front of a deployed one. Written down
here because the option looks like a nicety and is actually the difference
between a limit that is unsafe and one that is useless.

## 4. Layer 2 — `IWebhookScope`

```ts
export interface IWebhookScope {
  register(spec: WebhookSpec): Promise<IWebhookEndpoints>;
}

export interface IWebhookEndpoints {
  /** The caller passes its own key (e.g. a document id); the service mints the token. */
  endpointFor(key: string): Promise<Omit<WebhookEndpointInfo, "key">>;
  revoke(key: string): Promise<void>;
  list(): Promise<WebhookEndpointInfo[]>;
}

export interface WebhookSpec extends WebhookPolicy {
  /** Distinguishes several endpoint families within one package. */
  name: string;
  onRequest: (request: WebhookRequest) => Promise<WebhookReply> | WebhookReply;
  /**
   * The policy for one endpoint, merged over the registration's own.
   * Undefined means "not currently armed", answered exactly as an unknown
   * token is.
   */
  policyFor?: (key: string) => Promise<WebhookPolicy | undefined> | WebhookPolicy | undefined;
  rateLimit?: { perMinute: number };
}

export interface WebhookPolicy {
  verify?: WebhookVerification;
  /** Uppercase. Undefined accepts every method. */
  methods?: string[];
  dedupe?: { field: string; ttlSeconds?: number };
  challengeField?: string;
  maxBodyBytes?: number;
}
```

**The policy resolves per endpoint, not per registration.** This is the seam that
matters in practice: a package registers *one* family and serves thousands of
endpoints from it, each with its own secret, its own dedupe field, its own
allowed methods and its own challenge field — because for a workflow all of that
is document configuration. A registration-level field is the wrong place for
anything an author edits. Three of the four defects a review later found lived
exactly here; see §8.2.

`endpointFor` answers with `createdAt` as well as the URL and token, so a caller
wanting the mint date does not have to `list()` every endpoint in the package to
find one — that call is on the editor's query path and grows with workflow count.

The advertised URL is **always absolute**. A relative path is useless to the
third party that has to call it, and worse than useless once a package has
registered one upstream, so the origin falls back through `PUBLIC_URL`,
`RENDER_EXTERNAL_URL` and a bare deploy domain to the local origin.

Owned by core: token minting and lookup, the signature schemes (shared-token
header, bare hex HMAC, GitHub's `sha256=`, Stripe's `t=`/`v1=` with a replay
window) with constant-time comparison, the dedupe store, the challenge echo,
header redaction in logs, the body-size cap, the rate limiter, and public
base-URL resolution.

Four properties this buys:

* **The service owns the token; the caller owns the key.** "Never the document
  id in the URL" becomes structural rather than advisory.
* **Verification runs before the handler.** Secrets resolve by ref through the
  secrets service; the handler never sees an unverified request. It is also the
  one place to make rejection uniform in *timing* as well as body — today an
  unknown token returns after a DB lookup and a bad signature after an HMAC.
* **One governed hole in auth.** Providers hold no Renown credentials, so these
  routes are authenticated by token. Better a declared property of a
  service-owned route family than each package bypassing auth its own way.
* **Fleet behaviour falls out.** Tokens in a core relational namespace mean any
  host serves any endpoint — what `02-feature-spec.md` §7.2 already assumes.

Webhook routes are always `body: "raw"` — which is why §2.1 is a hard
prerequisite rather than a nicety.

**Revised from POST-only.** All six methods are mounted, and which ones an
endpoint accepts is `policy.methods`, defaulting to all. A provider's
verification round may probe with `GET` even when its deliveries are `POST`, and
refusing a method is the registration's decision, not the transport's. Mounting
`POST` alone would have let a `GET` probe fall through to the framework's own
404, which both leaks the difference between a live and a dead endpoint and fails
the probe for no reason.

### 4.1 URL shape

`/webhooks/<token>` — flat, no namespace segment. The namespace lives in the
token record, so a token minted by one package can never dispatch into another,
and the URL leaks neither the package nor the document.

Not `/hooks/`: the convention developers actually meet is `/webhooks/<provider>`
(every Stripe, SendGrid and Twilio integration guide), and published REST
standards go further, prescribing an explicit `/_webhooks/` prefix with
`/_webhooks/<product>/<event>`, POST-only and HTTPS-only. `/hooks/` appears
mainly in self-hosted webhook *daemons* rather than application APIs. The
provider segment those conventions carry does not apply here — one
token-addressed endpoint serves any provider — so the prefix is purely a routing
marker, and the spelled-out word is what people will grep for. The `_` prefix
buys nothing once a reserved-prefix deny-list exists.

### 4.2 What stays in the workflow package

Editor-facing config parsing (`parseWebhookConfig`), which body field carries the
dedupe key, sync-vs-async response, and firing the run. `webhook-router.ts`
disappeared entirely, including `reactorHandles()`; `webhook.ts` went from 489
lines to 198, and the port removed 2,690 lines net.

Two things the port had to keep that read as transport but are not:

* **The sync-mode delivery timeout.** Sync mode holds the provider's socket, so
  the wait is bounded at 30s (`WORKFLOW_WEBHOOK_TIMEOUT_MS`) and answers 504
  while letting the run continue — cancelling would lose work the provider has
  already been told about, and the retry that follows is what the dedupe field
  absorbs. This is a workflow decision because only workflows have runs that
  outlive a request.
* **The response content type.** Core defaults an unlabelled body to
  `text/plain`; the sync reply is JSON and says so.

Revised from earlier thinking: **dedupe and the challenge echo are not
workflow-specific.** Every provider redelivers and most probe before they will
register an endpoint. They belong in layer 2, with the field names as config.

## 5. Wiring

### 5.1 Subgraphs

`SubgraphArgs` (`packages/reactor-api/src/graphql/types.ts:46`) gains
`http: IHttpScope`. Deliberately not `httpAdapter`: `API.httpAdapter`
(`types.ts:42`) is the escape hatch, and a subgraph holding it can mount
anywhere.

The package name must be threaded first, because **both registration sites
discard it**: `server.ts:425` (`for (const [, collection] of
subgraphs.extended.entries())`) and `server.ts:499` (`for (const [, subgraphs] of
packagedSubgraphs)`). `registerSubgraph` (`graphql-manager.ts:494-512`) has no
parameter that could carry it, so it gains one, and constructs the scope where it
builds the instance (`:499`).

### 5.2 Processors

The host module gains `http?: IHttpScope` — optional, because processors also run
in the browser, where there is no HTTP server. Scoped per *package*, not per
drive: unlike the relational namespace, a route is not a per-drive resource, so a
drive-specific route puts the drive in the path or in the webhook token record.

The call sites already know the package name (`server.ts:951`, `:510`) but pass
one shared `hostModule`, built once at `server.ts:926-936` and containing nothing
package-specific. It must become per-package — built inside the loop, or a
shallow spread with `http` bound — which is the whole change on this side.

### 5.3 Core subgraphs

Core gets a reserved scope; it is what legitimately owns `/graphql`,
`/d/:drive`, `/mcp` and friends, and what keeps direct `IHttpAdapter` access.

### 5.4 Disposal

**Nothing is unmounted anywhere today**, so all of this is new:

* `#removeSubgraphInstance` (`graphql-manager.ts:419-464`) is the most complete
  teardown that exists — `onDisconnect`, bucket removal, handler-cache delete, WS
  disposer disposal — and it unmounts no route. It is the natural call site, but
  it is per-*instance* and has no package identity available, which is a second
  reason to thread the package name through registration.
* `unregisterFactory` (`packages/reactor/src/processors/processor-manager.ts:116-139`)
  is the one existing teardown point that is already package-scoped, because the
  factory id *is* the package name. The processor-side scope disposal hangs here.
* `onSubgraphsChange` (`server.ts:497-506`) is purely additive and never removes a
  subgraph that disappeared from a package; `PackageManager.updateSubgraphsMap`
  only *logs* `Removed Subgraphs from: <pkg>` (`package-manager.ts:496-506`), and
  a per-package update writes only that key into a copy of the old map, so a
  package is never actually dropped by that path. Fixing that is out of scope
  here, but a scope registry makes the leak visible instead of invisible.
* `PackageManagementService.uninstallPackage`
  (`services/package-management.service.ts:108-132`) touches no subgraphs, no
  processors and no routes — it is a separate registry that cannot even see the
  `PackageManager` maps.

Webhook endpoints are **not** revoked on reload — a redeploy must not force
re-registration with every provider. Routes unmount; token rows persist and go
unrouted until the package returns.

## 6. Findings from the worktree audit

Recorded so the reasoning is not re-derived later. Worktree:
`_worktrees/core-http-routes`, branch `feat/core-http-routes` off `origin/main`.

### 6.1 Existing consumers

| Consumer | Style | Needs |
| --- | --- | --- |
| MCP `/mcp` ×3 (`reactor-mcp/src/mcp-routes.ts:104,136,144`) | Node req/res | hijacked connection, parsed body arg, `res.on("close")`, custom authorizer |
| Attachments ×7 (`apps/switchboard/src/attachments/index.ts:16-66`) | Node req/res + actor | params, real `HEAD`, request *and* response streaming, forwarded-header base URL, two auth modes |
| Drive info `d/:drive` (`graphql-manager.ts:216`) | Fetch | params (hand-rolled today), forwarded headers |
| Subgraph + supergraph GraphQL (`:751`, `:859`) | Fetch | core-owned routing spine |
| GraphQL SSE (`:915`) | Fetch | response streaming — **broken today**, see §2.2 |
| `/health`, `/ready`, `/explorer/:endpoint?` (`server.ts:723-743`) | Fetch, GET-only | unauthenticated by design; core-owned |
| Vite dev middleware (`apps/switchboard/src/server.mts:858`) | Connect | root-mounted, own upgrade handling — **un-namespaceable**, keeps adapter access |

`packages/registry` hosts its own REST surface including `GET/POST/DELETE
/-/webhooks` (`registry/src/middleware.ts:123-195`) on a plain `express.Router()`
with its own `app.listen` (`registry/src/run.ts:175-198`). It never touches
`IHttpAdapter` and is not a migration target, but it is a useful shape reference.

### 6.2 Adapter facts

See §2. Headline: raw-body behaviour is content-type-dependent in opposite
directions per adapter; Fetch responses never stream; nothing can be unmounted;
`handle` has no consumers.

Fetch-response streaming is fixed here (§2.2). The *GraphQL-over-SSE* symptom it
caused is filed as
[#2971](https://github.com/powerhouse-inc/powerhouse/issues/2971) and left
alone: the buffering bug is gone, but nothing in this work re-tests the
subscription path end to end.

### 6.3 Identity and teardown facts

See §3.2 and §5.4. Headline: the map key is not a package name; `ISubgraph.path`
is package-writable and overridable by a field initializer; `unregisterFactory`
is the only package-scoped teardown that exists.

Both of the pre-existing holes are filed rather than fixed here, because both are
older than this work and neither is reachable through `IHttpScope`:
[#2972](https://github.com/powerhouse-inc/powerhouse/issues/2972)
(`ISubgraph.path` lets a package mount itself anywhere) and
[#2973](https://github.com/powerhouse-inc/powerhouse/issues/2973) (removed
packages are never torn down, so subgraphs, routes and processors leak on reload
and uninstall). `IHttpScope.dispose()` and the `RouteHandle` handles are the half
of #2973 this work *can* supply — the teardown call site still does not exist.

### 6.4 Reserved prefixes

`config.basePath` is `process.env.BASE_PATH || "/"` (`config.ts:5`).

Not basePath-prefixed: `/health`, `/ready` (`server.ts:723,726`); `POST|GET|DELETE
/mcp` (`mcp-routes.ts:104-146`); the seven `/attachments/...` routes
(`attachments/index.ts:19-64`); the WebSocket upgrade path
`/graphql/subscriptions` (`server.ts:568-572`).

BasePath-prefixed: `${basePath}/explorer/:endpoint?` (`server.ts:733-743`);
`${basePath}/d/:drive` (`graphql-manager.ts:214-216`); `${basePath}/graphql`
(`:851,859`); `${basePath}/graphql/stream` (`:878-891`);
`${basePath}/graphql/<subgraph-name>` (`:698-700`, mounted `:751`);
`${basePath}/graphql/<subgraph-name>/stream` (`:785`).

Core subgraph names already occupying that last namespace: `analytics`, `system`,
`r`, `auth`, `packages`, `reactor-drive` — plus one kebab-case name per loaded
document model when `enableDocumentModelSubgraphs`
(`document-model-subgraph.ts:144`). That last set is open-ended, so it is itself a
collision surface for package namespaces and an argument for keeping package
routes under `/api/` rather than under `/graphql/`.

## 7. Sequencing

Status per step is in §8.1.

1. **Layer 0**, as one change to both adapters: registry-based dispatch behind a
   stable framework route, raw-body guarantee, response streaming, `dispose()`
   handles, params, `PATCH`, honest `prefix`, 404/405 synthesis — with the
   contract cases in §2.5. This is the largest step and the one everything else
   waits on.
2. `IHttpScope` in `reactor-api`: namespace derivation from resolved package
   identity, the structural prefix (§3.3) with its `BASE_PATH` boot assertion,
   duplicate-package refusal, disposal, the four auth modes. Tests: a
   `BASE_PATH` matrix (`""`, `/`, `/api`, `/api/v1`, `/foo`) — the existing
   `graphql-manager.test.ts:276-284` already parameterises `path: "/api/v1"`; a
   hot-load test that fires `onSubgraphsChange` and
   `regenerateDocumentModelSubgraphs` and asserts a package route still
   resolves; a scoped name routing correctly as two segments; and two specs of
   one package at different versions failing loudly rather than
   last-write-wins.
3. Thread it through `SubgraphArgs` (plus the discarded package name) and the
   per-package processor host module. Close the `ISubgraph.path` hole — *split
   out to [#2972](https://github.com/powerhouse-inc/powerhouse/issues/2972);
   the threading is done, the hole is not.*
4. Migrate the in-tree consumers that fit — attachments first, since it exercises
   nearly every capability and its `mountAuthenticatedNodeRoute` wrapper is the
   thing being replaced.
5. `IWebhookScope` on top, token table in a core relational namespace.
6. Port `reactor-workflow` onto it and delete `webhook-router.ts`.

Filed separately, not blocking: GraphQL-over-SSE has been non-functional since
the Fetch bridge buffered responses (§2.2).

## 8. Implementation record

### 8.1 What shipped

Monorepo branch `feat/core-http-routes`, [powerhouse#2980][pr-core];
`reactor-workflow` branch `workflow/webhook-trigger`,
[reactor-workflow#4][pr-wf].

[pr-core]: https://github.com/powerhouse-inc/powerhouse/pull/2980
[pr-wf]: https://github.com/powerhouse-inc/reactor-workflow/pull/4

| Step | State |
| --- | --- |
| 1. Layer 0 — registry dispatch, raw bodies, streaming, `dispose()`, params, `PATCH`, honest `prefix` | done |
| 2. `IHttpScope` — verbatim-name namespace, structural prefix, four auth modes, disposal | done |
| 3. Threaded through `SubgraphArgs`, `BaseSubgraph.http`, processor host module | done; `ISubgraph.path` hole deferred to #2972 |
| 4. Migrate in-tree consumers (attachments, MCP; **not** `d/:drive`, which never used the adapter) | **not taken, deliberately** — see §8.3 |
| 5. `IWebhookScope` + token table in a core relational namespace | done |
| 6. Port `reactor-workflow`, delete `webhook-router.ts` | done |
| — Load balancer route classes for `/webhooks` and `/api` | done, not in the original plan |
| — `hostScope`, and the webhook family moved off the adapter onto layer 1 | done, not in the original plan — §3.4 |
| — `rateLimit` says who it charges; two inert `NodeRouteSpec` fields removed | done, not in the original plan — §3.5 |

Tests: reactor-api 950, switchboard 163, reactor-mcp 43, reactor-workflow 332,
switchboard-lb busted 18; root `tsc --build` and `pnpm lint` clean across all 21
packages. `reactor-workflow` — the one real consumer of layer 1 — typechecks and
passes unchanged against the reshaped interface, which is the evidence that the
settling pass cost its consumer nothing. End-to-end against a real switchboard with a real
PGlite store and a workflow armed through GraphQL: absolute URL minted, challenge
echoed without firing a run, 202 on delivery, 200 and no second run on
redelivery, token stable across restart, and disarmed / unknown / malformed
tokens answering byte-identically.

### 8.2 Defects found after the first pass

Recorded because each one is a place the design was right and the code was not,
and three of the four sit on the same seam — registration versus endpoint (§4).

* **The challenge field was read off the registration.** So it was always
  undefined, and a provider's verification round started a run and got a 202
  instead of the echo. Slack and Facebook send that round *before* they will
  accept a URL, so the integration could never be established. The single most
  consequential defect in the work, and invisible to every unit test that
  supplied the field at registration.
* **`rateLimit` was never read.** One shared limiter at its default served every
  registration, so a declared limit was inert and one package's flood came out of
  another's bucket.
* **Dedupe was inverted.** `numInsertedOrUpdatedRows` is unreliable against
  PGlite and returned zero every time, so every delivery read as a redelivery
  and no workflow would ever have run. Only an integration test against the real
  store could show this; it now claims by a random id and reads the claim back.
* **A relative advertised URL** when the host knew no public origin (§4).

And two in the workflow port: `onSetup` awaited the registration unguarded, so a
host merely lacking a webhook store lost the *entire* subgraph — resolvers,
document-event and schedule triggers included, because the manager awaits
`onSetup`; and seeding, which starts from the subgraph constructor before
`onSetup`, raced the registration and left a restored webhook workflow with no
token.

The naming collision: the adapter handle and the scope handle were both
`RouteHandle`, which the bundler resolved to `RouteHandle$1` and left
`subgraph.http.webhooks.register` untyped downstream. The adapter's is now
`AdapterRouteHandle`.

### 8.3 Deliberately not done

* **The in-tree consumers are not migrated** (step 4), deliberately rather than
  for lack of time. Attachments and MCP still call the adapter directly and
  `apps/switchboard/src/attachments/mount-auth.ts` still exists. Both *were*
  migrated on throwaway branches to answer the design question — §3.4 has the
  method and the result — and what those branches were for has been taken:
  `hostScope`, `AuthorizerResult` carrying its own response, and the removal of
  two inert `NodeRouteSpec` fields. The migrations themselves are host work, and
  this pass is about the package-facing contract.

  Step 4 named three consumers and there are two: **`d/:drive` never used
  `mountNodeRoute` at all.**

  What the branches paid for beyond the primitive, recorded because these are
  the next real questions about layer 1 rather than hypotheticals: attachments
  cannot use `transport.baseUrl` for a download target, because it carries
  `x-forwarded-prefix` while the byte route it points at does not; and MCP loses
  `/mcp`'s body-size cap, because `nodeRoute` has no "parsed body *and* the
  socket" mode and the protocol implementation reads the stream itself. Neither
  is fixed here.
* **No token migration** from the workflow-local `webhook_endpoint` table. That
  table is dropped; the earlier endpoint never reached `main`, so no provider has
  a URL registered, and minting fresh under the new path beats a half-migration.
* `#2971`, `#2972`, `#2973` as above.

### 8.6 What only the workspace build could see

Per-package `tsc` was green while `tsc --build` at the repo root — what CI runs
as `pnpm typecheck` — had **seven errors**, so the first CI run on the PR failed.
The root build resolves Express's `ParamsDictionary` and the DOM lib that makes
`reply.send()`'s return type visible; neither package config surfaced them.

One of the seven hid a runtime bug rather than a typing nit. Fastify treats a
handler resolving to the reply as "this request is handled", and one resolving to
`undefined` as nothing to send — so `sendResponse` returning the reply was
load-bearing. Typing it `Promise<void>` and dropping that return emptied **every
streamed body**; twelve adapter cases went red at once. The reply is threaded
back through `#dispatch` instead.

`SubgraphArgs.http` being required also broke two existing construction sites,
which now supply a scope rather than the type being softened.

The lesson for this plan: the gate is the workspace build. A package-local
typecheck is not evidence, and neither is a package-local test run — the
branch's own suites never reached any of the seven.

### 8.4 Release ordering

The two branches cannot merge in either order freely:

1. Merge the monorepo branch and publish `@powerhousedao/reactor-api`.
2. Bump `reactor-workflow` to that version and delete the local `link:`
   override.
3. Merge `reactor-workflow`.

Step 2 is not optional. The override was briefly committed — an absolute path
under one developer's home, with the lockfile regenerated around it, which fails
`pnpm install` for everyone else and for CI. It is reverted; keep it a working-tree
change only.

### 8.5 Unrelated bug found while testing

`reactor-connectors` builds its piece-worker entry to
`reactor-connectors/dist/worker-entry.js` (`tsdown.config.ts:6`), but
`src/activepieces/worker/host.ts:80` resolves it against the *workflow* package's
`dist/`. The processor that feeds the trigger registry fails to create, so no
operations reach it and both webhook and piece triggers are silently dead in local
dev — with an error message that points at a missing build rather than a wrong
path. Not filed.
