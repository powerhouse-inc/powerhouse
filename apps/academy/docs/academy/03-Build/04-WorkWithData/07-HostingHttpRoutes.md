# Hosting HTTP routes

A package can serve HTTP endpoints of its own on the reactor, alongside the GraphQL API. You register routes in code against a http scope the host hands your package, and the host removes them again when the package unloads.

To ensure there are no route collisions between packages, every route you register is served under your package's npm name:

```
https://switchboard.example/api/@powerhousedao/reports/reports/42
                           └──┘ └──────────────────────┘ └───────┘
                          prefix      package name       your path
```

If what you need is a webhook for a third-party provider (GitHub, Stripe, Slack) that holds no Powerhouse credentials, use [Receiving webhooks](./08-ReceivingWebhooks.md) instead.

## Subgraphs

A subgraph reads it off itself, as `this.http`:

```typescript
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { PHDocument } from "document-model";

export class ReportsSubgraph extends BaseSubgraph {
  name = "reports";

  async onSetup(): Promise<void> {
    this.http.get("reports/:id", async (_request, ctx) => {
      try {
        const document = await this.reactorClient.get<PHDocument>(
          ctx.params.id,
          undefined,
          ctx.signal,
        );
        return Response.json({
          id: document.header.id,
          documentType: document.header.documentType,
          state: document.state,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "DocumentNotFoundError") {
          return Response.json({ error: "Document not found" }, { status: 404 });
        }
        throw error;
      }
    });
  }
}
```

## Processors

A processor takes the scope in its constructor, as `module.http` from its factory. It is optional there, because a processor also runs in the browser, where there is no HTTP server:

```typescript
import type { OperationWithContext } from "@powerhousedao/shared/document-model";
import type {
  IHttpScope,
  IProcessor,
  IRelationalDb,
  ScopedRouteHandle,
} from "@powerhousedao/shared/processors";
import type { DB } from "./schema.js";

export class ReportsProcessor implements IProcessor {
  #route: ScopedRouteHandle | undefined;

  constructor(
    private readonly db: IRelationalDb<DB>,
    http: IHttpScope | undefined,
  ) {
    // Provides access to the read model this processor maintains.
    this.#route = http?.get(
      "reports/:id",
      { auth: "public" },
      async (_req, ctx) => {
        const report = await this.db
          .selectFrom("reports")
          .selectAll()
          .where("document_id", "=", ctx.params.id)
          .executeTakeFirst();

        return report
          ? Response.json(report)
          : Response.json({ error: "Report not found" }, { status: 404 });
      },
    );
  }

  async onOperations(operations: OperationWithContext[]): Promise<void> {
    // ...write to the reports table
  }

  async onDisconnect(): Promise<void> {
    this.#route?.dispose();
  }
}
```

Registration is reversible, which is what `onDisconnect` is for: dispose the handle and the route stops answering, so a reloaded package does not leave a stale one behind.

Both are the same object: one `IHttpScope` per package. Asking for it twice returns the same scope, so a reload cannot accumulate namespaces.
Registering the same method and path twice on one scope throws an error.

## Register a route

Each verb has a shorthand, with an optional options object before the handler.
`get`, `post`, `put`, `patch`, `delete` and `head` are available.

Handlers take a [Fetch](https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API) [`Request`](https://developer.mozilla.org/en-US/docs/Web/API/Request) and the route context, and return a [`Response`](https://developer.mozilla.org/en-US/docs/Web/API/Response). Use `route()` when you want one handler on several methods, or find the object form easier to read:

```typescript
http.route({
  method: ["POST", "PUT"],
  path: "reports/:id/source",
  body: "stream",
  handler: async (request, ctx) => {
    await store(ctx.params.id, request.body);
    return new Response(null, { status: 202 });
  },
});
```

## Authentication

`auth` defaults to `renown`, so a route you write with no options requires a verified bearer and answers `401` without one.

| `auth` | Behaviour |
| --- | --- |
| `"renown"` (default) | A verifiable bearer is required. No bearer is a `401`. |
| `"renown-optional"` | A bearer is verified if present; its absence leaves `ctx.user` undefined instead of answering `401`. For handlers that make their own per-document decision. |
| `"public"` | No identity is checked. `ctx.user` is `undefined`. |
| a [`RouteAuthorizer`](#custom-authentication) function | Your own gate, run before the handler. It receives the [`IncomingMessage`](https://nodejs.org/api/http.html#class-httpincomingmessage) and returns `{ authorized: true }`, a `{ status, message }` refusal, or a whole `Response`. It resolves no principal, so `ctx.user` stays `undefined`. |

```typescript
// Bearer required; ctx.user is the verified principal.
http.get("reports/:id", (_request, ctx) =>
  Response.json({ caller: ctx.user?.address ?? null }),
);

// Unauthenticated, and written out as such.
http.get("reports/:id/public-summary", { auth: "public" }, () =>
  Response.json({ title: "Q3" }),
);

// Verified if a bearer is present, anonymous if not.
http.get("reports/:id/preview", { auth: "renown-optional" }, (_req, ctx) =>
  Response.json({ full: ctx.user !== undefined }),
);
```

Note that `renown` authentication is the default. Public routes must be explicitly set.

### Custom authentication

Pass a function that receives the `IncomingMessage` and returns a verdict:

```typescript
import type { IncomingMessage } from "node:http";
import type { RouteAuthorizer } from "@powerhousedao/reactor-api";

const supremeAdmin: RouteAuthorizer = (req: IncomingMessage) => {
  const presented = req.headers["x-admin-key"];
  if (typeof presented === "string" && presented === process.env.ADMIN_KEY) {
    return { authorized: true };
  }
  return { authorized: false, status: 403, message: "Admin only" };
};

http.post("admin/reindex", { auth: supremeAdmin }, () =>
  new Response(null, { status: 202 }),
);
```

Two sharp edges:

- **A custom authorizer resolves no principal.** `ctx.user` is `undefined` on a route with a function `auth`, exactly as on a `public` one. If you need the caller's identity *and* a custom rule, use `renown` and apply the extra rule inside the handler.
- **`auth: "renown"` does not guarantee an identity.** On a host running with authentication disabled, every caller is anonymous and a `renown` route serves them anyway, so check `ctx.user` before deciding anything. If your handler needs a real identity, `ctx.authEnabled` tells you whether the host checks at all.

## Request bodies

`body` decides how the payload reaches your handler.

| `body` | Behaviour |
| --- | --- |
| `"parsed"` (default) | Buffered, and readable through the Fetch `Request` (`await request.json()`, `await request.text()`). The bytes go in verbatim. |
| `"raw"` | Buffered, and also handed over as `ctx.rawBody`, byte for byte. |
| `"stream"` | Not buffered. The Fetch `Request` body is the live request stream. |
| `"none"` | The body is not read at all. |

## The route context

The second handler argument carries what the scope resolved before the handler ran:

- `params` — decoded path params, as strings.
- `user` — the verified caller, or `undefined` when nobody was verified. Same name and shape as a subgraph resolver's `ctx.user`. `user.appKey` is the `did:key` of the app instance that issued the request's token, so a route can act as the same principal that signs actions.
- `authEnabled` — whether this request's identity was checked. `false` on a `public` route, on a custom authorizer, and on a host running with authentication disabled.
- `rawBody` — the exact octets received. Present only when `body` is `"raw"`.
- `signal` — aborts when the client disconnects. Pass it into anything long-running.
- `transport` — where the request reached the host, resolved through any reverse proxy: `{ proto, host, prefix, baseUrl }`. Use it instead of touching `req.socket` or reading `x-forwarded-*` yourself.

```typescript
http.get("reports/:id/export", async (_request, ctx) => {
  const rows = await query(ctx.params.id, ctx.signal);
  return Response.json({ rows, appKey: ctx.user?.appKey });
});
```

## Serving sub-paths

```typescript
// A wildcard param, joined with "/": /api/pkg/blobs/a/b/c.txt → "a/b/c.txt"
http.get("blobs/*rest", { auth: "public" }, (_request, ctx) =>
  Response.json({ rest: ctx.params.rest }),
);

// A prefix match: the handler also answers every path below "files".
http.get("files", { auth: "public", prefix: true }, () => new Response("hit"));
```

Prefer the wildcard when you need the sub-path, since `prefix: true` gives you no param for it. Routes within a scope are matched in registration order, so register a specific route before a prefix route that would swallow it.

## Disposal

Packages hot-reload, so every registration is reversible — but **you do not have to do this yourself**. The host releases your whole scope when your package is replaced or removed, and every scope when it shuts down. Routes you register and forget are cleaned up.

`handle.dispose()` and `scope.dispose()` are there for the cases the host cannot know about: a route you want to stop serving while the package stays loaded, or a scope a test stood up. Disposing something already gone is a no-op, and the same path can be registered again afterwards.

Webhook endpoints are not revoked when a package unloads: the token stays valid and the endpoint answers `503` until the package returns, so a redeploy does not force you to re-register with every provider.

## The Node escape hatch

Some protocols must own the socket. `nodeRoute()` hands your handler the raw [`IncomingMessage`](https://nodejs.org/api/http.html#class-httpincomingmessage) and [`ServerResponse`](https://nodejs.org/api/http.html#class-httpserverresponse), still inside your namespace, with nothing having touched the request stream:

```typescript
http.nodeRoute({
  method: ["GET", "POST"],
  path: "mcp",
  auth: supremeAdmin,
  handler: async (req, res) => {
    await transport.handleRequest(req, res);
  },
});
```

`auth` and `prefix` still apply. `body` and `maxBodyBytes` do not exist on a node route: the handler reads the stream itself, so the scope has no body to shape and nothing to measure.

Reach for it when a protocol implementation writes to the response itself, hijacks the connection, or holds a long-lived stream the Fetch shape cannot express. You give up the body cap and the uniform error handling, and you write the status codes and headers yourself. For raw bytes use `body: "raw"`, and to stream a response return a `Response` with a [`ReadableStream`](https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream) body.

## What the scope does not have

- **`OPTIONS`.** Preflight belongs to the CORS layer, which answers for your namespace already.
- **Middleware.** There is no `scope.use()`. Auth and body policy are declarative fields instead, so a route's behaviour is readable from its registration.
- **A way to name a path.** Absolute paths, `..` segments and URL-shaped paths all throw.
