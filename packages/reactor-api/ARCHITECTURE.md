# HTTP & Gateway Abstraction

`reactor-api` separates GraphQL and HTTP concerns into two independent interfaces,
`IGatewayAdapter` and `IHttpAdapter`, with authentication threaded between them
using the Fetch API `Request` object as a shared key. This makes it possible to
swap the underlying HTTP framework (currently Express) or GraphQL execution engine
(currently Apollo) without touching application logic.

---

## Interfaces

### `IHttpAdapter`: HTTP transport

Owns everything related to the underlying HTTP server: binding ports, registering
routes, and bridging framework-native request/response objects into the Fetch API
types that the rest of the system speaks.

```
src/graphql/gateway/types.ts
```

| Method                           | Purpose                                                                                                                                                                                                                       |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setupMiddleware(config)`        | Install CORS and body-parser. Called once during init.                                                                                                                                                                        |
| `mount(path, handler, opts?)`    | Register a `FetchHandler` at a path. `prefix: false` (default) is an exact-path match stored in an internal dispatch map; `prefix: true` is a prefix match (router `.use()` semantics).                                         |
| `getRoute(path, handler)`        | Register a read-only GET route directly on the underlying app (used for `/health`, `/explorer`).                                                                                                                              |
| `mountRawMiddleware(middleware)` | Mount a raw Connect/Express-compatible middleware function (e.g. the Vite dev server). The cast to the framework's native type is contained inside the adapter implementation; call sites need no framework-specific imports. |
| `listen(port, tls?)`             | Start the HTTP server. Returns the `http.Server` so callers can attach WebSocket servers. Supports three TLS modes: `true` (devcert), `{ keyPath, certPath }` (files), `{ cert, key }` (in-memory buffers).                   |
| `handle`                         | Read-only escape hatch returning the raw framework object (e.g. the Express `app`). Use only for integrations that have no framework-agnostic equivalent yet (e.g. Express-specific SSE handlers with a path argument).       |

### `IGatewayAdapter<TContext>`: GraphQL execution

Handles GraphQL-specific concerns: compiling schemas into request handlers,
composing a federation supergraph, and attaching WebSocket subscription support.

```
src/graphql/gateway/types.ts
```

| Method                                                              | Purpose                                                                                                                                                                 |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `start(httpServer)`                                                 | One-time startup (e.g. drain-on-close plugin).                                                                                                                          |
| `createHandler(schema, contextFactory)`                             | Returns a `FetchHandler` for a single subgraph schema.                                                                                                                  |
| `createSupergraphHandler(getSubgraphs, httpServer, contextFactory)` | Composes all subgraphs via federation and returns a single `FetchHandler` for the supergraph. `getSubgraphs` is called eagerly and again on every `updateSupergraph()`. |
| `updateSupergraph()`                                                | Re-composes the supergraph SDL from the current subgraph list and hot-reloads the running gateway. No-op before `createSupergraphHandler` is called.                    |
| `stop()`                                                            | Graceful shutdown.                                                                                                                                                      |

### `FetchHandler`: the boundary

```typescript
type FetchHandler = (request: Request) => Promise<Response>;
```

This is the shared contract between the two interfaces. `IGatewayAdapter` produces
`FetchHandler` values; `IHttpAdapter` consumes them via `mount()`. Both use the
standard Fetch API `Request` and `Response` types. No Express types cross this
boundary.

---

## Auth threading

Authentication context flows from the HTTP edge to GraphQL resolvers via a
`WeakMap` keyed on the Fetch API `Request` object. Because the same `Request`
instance travels from `IHttpAdapter.mount()` through to `IGatewayAdapter.createHandler()`,
the WeakMap lookup is always guaranteed to find the context set during
authentication, without mutating shared state or passing extra arguments.

```
src/graphql/gateway/auth-middleware.ts
src/services/auth.service.ts
```

### Types

```typescript
// The context stored per-request
interface AuthContext {
  user?: User; // undefined when the request carries no token
  admins: string[];
  auth_enabled: boolean;
}

// Middleware wraps a FetchHandler, adding auth
type AuthFetchMiddleware = (handler: FetchHandler) => FetchHandler;
```

### How it works

```
Incoming HTTP request
  → IHttpAdapter  (bridges Express req → Fetch Request)
  → authFetchMiddleware(handler)(request)
      → AuthService.authenticateRequest(request)
          → invalid token  ──→  401 Response returned immediately
          → valid / no token ──→  AuthContext
      → authContextMap.set(request, authCtx)   // WeakMap entry
      → next(request)   // original FetchHandler
  → IGatewayAdapter FetchHandler (Apollo Server)
      → contextFactory(request)
          → getAuthContext(request)   // WeakMap lookup (same Request instance)
          → builds GraphQL Context { user, isAdmin, headers, db, ... }
  → Resolver receives Context
```

`getAuthContext` is intentionally not exported from the package index. It is an
internal coupling point between `auth-middleware.ts` and `graphql-manager.ts`.

### Bearer kinds

`AuthService.verifyBearer(header, options)` reads three kinds of bearer:

| Bearer | Verified by | `ctx.user.via` |
| ------ | ----------- | -------------- |
| none | nothing: the caller is anonymous | (no user) |
| a self-signed JWT of a session key, carrying or naming its credential | the token's signature, then the credential verifier (the store's records, then Renown) | `record`, `renown`, `last-answer`, `signature` |
| `phs_<id>_<secret>`, a token of a session the caller delegated to this host | `HostSessions` (`src/services/host-sessions.ts`): the session file in `<dataDir>/.ph/host-sessions`, the hash of the secret, both ends, then the same credential verifier | `host-session` |

The verifier (`@renown/sdk/node` `createCredentialVerifier`) keeps at most
10,000 of Renown's answers in memory, and as many "Renown cannot be reached"
marks, oldest out first. While Renown is down, a flood of fresh credentials
(cheap to mint) can push live entries out, which then wait Renown's 3 s
timeout once more; the cost stays bounded, and is accepted as is.

A caller with no file access makes its credential known by enrolment
(`src/http/credential-routes.ts`, `<base>/credentials/`): a request signed by
the address's own key writes the record. The host keeps at most 50 records per
address and 10,000 in all. An address at 50 makes room by its own records, so
only its owner evicts them: the expired first, then the least recently used,
by the `<id>.used` note the verifier writes beside a record at most hourly when
it accepts it. An eviction is no withdrawal and leaves no tombstone; the
verifier forgets the record first (`forgetRecord`), so its removal is not read
as one, and the auth service drops what held it.

A host session token is taken only where `options.hostSessions` is set: the
GraphQL middleware, the WebSocket (`authenticateWebSocketConnection`), HTTP
`/mcp` (`mcp-request-authorizer.ts`) and the switchboard's attachment routes.
Every other surface answers 401 `host-session-not-accepted`: package HTTP
routes, the AI gateway, the credential and OAuth routes (`HttpRouteService`
refuses it before any route's own auth runs).

A host session administers nothing. Its `AuthContext.admins` is `[]`, and the
request runs in the host-session scope (`src/services/host-session-scope.ts`,
an `AsyncLocalStorage` entered by `runAsCaller(user, run)`): the GraphQL
middleware runs the handler in it, the resolver binder each field, the `/mcp`
authorizer each access decision, the attachment routes their handler and the
reactor subgraph its subscription filters. In the scope `isOperator` and the
admin half of `isSupremeAdmin` answer false (OPEN's policy-wide access stays),
and MCP's `unrestricted` and `operator` are false.

Host work a session started acts as that session too. Every key a host
approves is marked for good (`<dataDir>/.ph/host-sessions/keys/`, kept after
the session ends or is withdrawn), and `API.hostSessionOfKey` reads the mark:
a workflow run whose publish such a key signed reads indexes and attachments
in that session's scope, and `executeSubgraph` gives a host session's user
`admins: []`. So an admin's session cannot drive admin reads through a run.

The door notes a session's last use in `<id>.used` beside its file, at most
hourly, never by rewriting the session file. A session a Renown login
approved through the console (`approvedThrough: "renown"`) is asked of Renown
too, at most once per the verifier's answer TTL: once Renown has not served
it in two answers at least a minute apart, the verifier writes the tombstone
(`by: "renown"`) and the token is refused; it works in between, so a
withdrawal there takes effect within about a minute. Renown unreachable
leaves the record's answer, and is asked again a minute later, not on every
request; a pseudonym's session is the record's alone.

A host session's document writes are signed by the session: the door readies
a `RenownCryptoSigner` over the session's key (`app.name` the credential's
label, `user` the session's user), and the API's `delegatedSigner` hands it to
the caller-write scope of each Mutation field and each `/mcp` request
(`HostSessions.signerFor`). Per-model mutations, host-built mutations and the
host-built delete then sign as "session <label> acting for <user>"; each
signed action is logged by the session's short id, never its token. Without a
host session the caller writes stay refused (`UNSIGNED_WRITE`).

### Issuing host session tokens

```
src/http/oauth-routes.ts     the routes, in the host scope `oauth` (<base>/oauth)
src/http/oauth-grants.ts     pending grants, <dataDir>/.ph/oauth/grants/
src/http/oauth-clients.ts    registered clients, <dataDir>/.ph/oauth/clients/
src/http/oauth-metadata.ts   the issuer, RFC 8414 and RFC 9728 documents
src/http/oauth-pages.ts      the consent page (plain HTML, no script)
```

MCP clients sign in with the authorization code grant (RFC 6749 4.1) on the
same grant object and consent. `register` (RFC 7591) keeps public clients
only (`none` at the token endpoint), with https, loopback http or an app's
own scheme (RFC 8252 7.1; not `javascript`, `data`, `file`, `vbscript`,
`blob`, `about`, `ws`, `wss`, `ftp`, `mailto`, `tel`, `sms`, `smsto`, `mms`,
`callto`, `facetime`, `facetime-audio`, `intent`, `search-ms`, `view-source`,
`market`, `itms-services`, nor any `ms-` scheme; the page shows it in full) for
redirect URIs; 10 registrations a minute and 20 held per address, 1,000 in
all. A client no grant was approved for is dropped after an hour, one in use
30 days after its last approval; a full table drops its oldest unused client
for a new one. `authorize` is rate limited before any work (the device
starts' limit), then takes a registered client and redirect URI, a loopback
one at any port (RFC 8252 7.3; else it answers with a page and sends
nothing), PKCE S256 only, `documents:write`,
and a `resource` on this host (else `invalid_target`). Its other refusals
come before the person acts: they go back to the client at once (with
`state` and `iss`, RFC 9207) only for a loopback redirect URI, and are
otherwise a page on this host naming the error, so open registration makes
no open redirect (RFC 9700 4.11.2). After the person acts (Approve, Deny)
the browser goes back to any registered URI. It starts the grant as
`device_authorization` does (the same limits and caps, `grant: "code"`, the
label the client's name; at most 10 waiting per app, counted before a plain
GET makes one) and shows the consent page, which names where the
browser returns and checks back every 5 s (`authorize/continue`, no
script); the person approves it as any grant (`ph token approve`, or Renown
in a tab of its own). The continue link carries a key made at `authorize`
and written only into that page (its hash on the grant), never shown by
`device/pending`, so the user code alone takes no code. Approved, `continue`
issues the code once (the grant then kept under the code's hash, a minute)
and sends the browser back.
`token` with `authorization_code` takes the code once and checks the
client, the exact redirect URI, the verifier and the resource; a code that
fails a check is spent and its session withdrawn. A code is no device code,
nor a device code a code.

The OAuth device grant (RFC 8628) issues them. `device_authorization` makes
the session's key (its file, approved by nobody) and a pending grant;
`device/approve` takes the person's credential for that key (a pseudonym
signs it, `ph token approve`), or `device/renown` sends a Renown login to
Renown's console and polls it (`pollConsoleCredential`). Either way the same
checks run (the grant pending, the credential for the grant's key and no
longer than asked, the asked label, no tombstone, 50 sessions per address),
then the session file gets the credential, its record is written
(`source: "host-session"`), and the client's next `token` poll is issued the
token once. `revoke` (RFC 7009) and `sessions/<id>/withdraw` (a self-signed
bearer) write the tombstone. Every route is public: the caller has no token
yet. The metadata documents are mounted at the origin's root. The issuer is
the configured public URL plus the base path, else a loopback request's own
origin, but not one a proxy forwarded (`Forwarded`, `X-Forwarded-*`: a proxy
on this computer connects over loopback for callers anywhere); without either
the routes answer 503, naming `PUBLIC_URL`.

An approval reads its grant again after the credential check, so a Deny (or
a Renown login taking the grant over) that lands meanwhile wins. A grant
whose token nobody collected withdraws its session when it is dropped, and
withdrawn sessions count toward no cap. Under ADMIN_ONLY (`AUTH_ENABLED`
without document permissions) a session could read and write nothing, so
`device_authorization` refuses with `invalid_scope`, saying so.

`/mcp` is a protected resource of its own
(`/.well-known/oauth-protected-resource/mcp`, resource `<origin>/mcp`). Where
the host issues tokens a session could use (host sessions on, not
ADMIN_ONLY), its authorizer (`mcp-request-authorizer.ts`) challenges as MCP
authorization asks: a refused bearer, and an anonymous caller under the
floor, get 401 with
`WWW-Authenticate: Bearer resource_metadata="<origin>/.well-known/oauth-protected-resource/mcp", scope="documents:write"`
(plus `error="invalid_token"` for a bad token). A call of a document-writing tool
(`DOCUMENT_WRITE_TOOLS` of reactor-mcp) that nothing would sign is answered
before any tool runs: 401 for an anonymous caller, 403 `insufficient_scope`
for a host session without `documents:write`, with the `UNSIGNED_WRITE`
words; a caller with its own session's bearer gets the tool's refusal, and a
request whose delegated signer signs is not challenged. Reads stay open.
Connect's servers proxy `/oauth` and the two `/.well-known/oauth-*` documents
with the switchboard's other paths (`SWITCHBOARD_PROXY_PATHS`), so under
`ph vetra` an MCP client signs in on Connect's origin, which is then the
issuer.

Limits are charged per client (`src/http/client-limits.ts`): the socket's
address, or with `trustProxy` the right-most `X-Forwarded-For` hop that is no
loopback, private or link-local address, read only from a peer that is one.
The host sets `trustProxy` on the credential and OAuth routes only with a
configured `PUBLIC_URL` (a deployment with its own proxy in front); without
it every client is charged as its socket (on a dev host, all behind Connect's
Vite proxy share its loopback address). An IPv6 client is counted by its
/64. Counters drop ended windows; a full table refuses a client it holds no
count for. Per client: 10 device starts and 10 unknown codes a minute, 20
pending grants, 3 Renown polls; in all, 1,000 pending grants and 50 Renown
polls. The sweep of ended grants, unapproved sessions and expired
registrations runs at most every 30 s, when a grant starts and by itself
every minute.

The consent page's buttons (`device/deny`, `device/renown`) are taken only
from the host's own pages: an Origin naming the issuer's origin, and
`Sec-Fetch-Site` same-origin when sent; `device/renown` needs the Origin
header. The pages send `Referrer-Policy: same-origin`, so a browser names
the origin in the page's own form posts (under `no-referrer` it sends
`Origin: null`); `Origin: null` counts only with `Sec-Fetch-Site:
same-origin`. A code grant's page also lets its forms reach the redirect
URI's origin (`form-action`, which browsers check on the redirect), where
its Deny goes.

`AuthService.authenticate()` (the old Express middleware signature) is kept for
backwards compatibility but is `@deprecated`. New code uses `authenticateRequest()`.

### WeakMap lifecycle

`WeakMap` entries are garbage-collected automatically when the `Request` object is
collected. There is no manual cleanup or risk of memory leaks for long-lived servers.

---

## Request lifecycle

```
Client HTTP request
  │
  ▼
ExpressHttpAdapter.#serveFetchHandler()
  ├── Converts Express req → Fetch Request (URL, headers, body)
  └── Calls FetchHandler (which is the auth-wrapped handler)
        │
        ▼
      createAuthFetchMiddleware(authService)(graphqlHandler)
        ├── AuthService.authenticateRequest(request)
        │     ├── auth disabled → AuthContext { auth_enabled: false }
        │     ├── OPTIONS/GET  → AuthContext (no user)
        │     ├── no token     → AuthContext (no user)
        │     ├── bad token    → 401 Response  ──────────→ client
        │     └── good token   → AuthContext { user, ... }
        ├── authContextMap.set(request, authCtx)
        └── graphqlHandler(request)
              │
              ▼
            ApolloGatewayAdapter FetchHandler
              ├── contextFactory(request)
              │     └── getAuthContext(request)  → AuthContext
              │         → Context { user, isAdmin, headers, db }
              └── Executes GraphQL → Fetch Response
        │
        ▼
ExpressHttpAdapter converts Fetch Response → Express res
```

---

## Current implementations

### `ExpressHttpAdapter`

```
src/graphql/gateway/adapter-http-express.ts
```

Owns an Express `app` internally (creates one if none is provided). GraphQL
`FetchHandler` values are registered in an internal `Map` and dispatched through a
single Express middleware registered after `bodyParser`, so `req.body` is already
parsed when the Fetch `Request` is constructed.

The `handle` getter returns the Express `app`, which is needed at a small number of
call sites for Express-specific integrations (Vite dev server, SSE handlers).

### `ApolloGatewayAdapter`

```
src/graphql/gateway/adapter-gateway-apollo.ts
```

Wraps Apollo Server and Apollo Gateway. `createHandler()` starts an `ApolloServer`
for a single subgraph schema and exposes it as a `FetchHandler` via
`expressMiddleware`. `createSupergraphHandler()` wires up an `ApolloGateway` using
`LocalCompose` and returns a `FetchHandler` for the composed supergraph.
`AuthenticatedDataSource` forwards the `authorization` header to each federated
subgraph so token verification works end-to-end.

---

## Factory functions

```
src/graphql/gateway/factory.ts
```

```typescript
// Create a gateway adapter
const gatewayAdapter = createGatewayAdapter("apollo", logger);
// → ApolloGatewayAdapter

// Create an HTTP adapter (optionally wrapping an existing Express app)
const { adapter: httpAdapter } = createHttpAdapter("express", existingApp);
// → ExpressHttpAdapter
```

The factory is the only place that names a concrete implementation. Everything
upstream (`GraphQLManager`, `server.ts`, subgraphs) works against the interfaces.

---

## Adding a new HTTP adapter (e.g. Fastify)

1. Implement `IHttpAdapter` in a new file `adapter-http-fastify.ts`:
   - `setupMiddleware`: install `@fastify/cors` and body parsing
   - `mount`: register a Fastify route that converts `FastifyRequest` to a Fetch `Request`, calls the handler, and writes the Fetch `Response` back to `FastifyReply`
   - `getRoute`: register a GET route on the Fastify instance
   - `mountRawMiddleware`: use `@fastify/middie` to mount the Connect-compatible middleware function
   - `listen`: call `fastify.listen({ port })` and return the underlying `http.Server` via `fastify.server`
   - `handle`: return the Fastify instance

2. Add `"fastify"` to `HttpAdapterType` in `factory.ts` and add a `case "fastify":` to `createHttpAdapter()`.

3. No other files change. `GraphQLManager`, `AuthService`, and all resolvers are
   unaware of which HTTP framework is in use.

---

## Adding a new gateway adapter (e.g. Yoga)

1. Implement `IGatewayAdapter<Context>` in a new file `adapter-gateway-yoga.ts`.
   The key method is `createHandler()`: construct a Yoga server and return a
   handler of type `(request: Request) => Promise<Response>`. Yoga's
   `handleRequest` already matches this signature.

2. Add `"yoga"` to `GatewayAdapterType` in `factory.ts` and add a case to
   `createGatewayAdapter()`.

3. Everything else (auth middleware, context factory, `IHttpAdapter.mount()`) is
   unchanged.
