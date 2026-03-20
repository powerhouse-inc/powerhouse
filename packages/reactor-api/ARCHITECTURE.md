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

| Method                        | Purpose                                                                                                                                                                                                                      |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `setupMiddleware(config)`     | Install CORS and body-parser. Called once during init.                                                                                                                                                                       |
| `mount(path, handler, opts?)` | Register a `FetchHandler` at a path. `exact: false` (default) is an exact-path match stored in an internal dispatch map; `exact: true` is a prefix match (router `.use()` semantics).                                        |
| `getRoute(path, handler)`     | Register a read-only GET route directly on the underlying app (used for `/health`, `/explorer`).                                                                                                                             |
| `listen(port, tls?)`          | Start the HTTP server. Returns the `http.Server` so callers can attach WebSocket servers. Supports three TLS modes: `true` (devcert), `{ keyPath, certPath }` (files), `{ cert, key }` (in-memory buffers).                  |
| `handle`                      | Read-only escape hatch returning the raw framework object (e.g. the Express `app`). Necessary for framework-specific integrations (Vite dev server middleware, SSE handlers) that have no framework-agnostic equivalent yet. |

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
| `attachWebSocket(wsServer, schema, contextFactory)`                 | Attaches WebSocket subscription support. Returns a `WsDisposer` for cleanup.                                                                                            |
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
