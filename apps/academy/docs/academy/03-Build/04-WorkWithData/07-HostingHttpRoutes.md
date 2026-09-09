# Hosting HTTP routes

A package can serve HTTP endpoints of its own on the reactor, alongside the GraphQL API. You register routes in code against a http scope the host hands your package, and the host removes them again when the package unloads.

To ensure there are no route collisions between packages, every route you register is served under your package's npm name:

```
https://switchboard.example/api/@powerhousedao/reports/reports/42
                           └──┘ └──────────────────────┘ └───────┘
                          prefix      package name       your path
```
If what you need is an webhook for a third-party provider (GitHub, Stripe, Slack) that holds no Powerhouse credentials, use [Receiving webhooks](./08-ReceivingWebhooks.md) instead.

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

`head()` is registered independently of `get()`, and a GET route answers `404` to a HEAD request. That is deliberate: a HEAD response is not a GET with the body dropped. Registering one means you can compute the metadata without producing the body.

```typescript
http.head("reports/:id", async (_request, ctx) => {
  const size = await sizeOf(ctx.params.id);
  return new Response(null, { headers: { "content-length": String(size) } });
});
```

Registering the same method and path twice on one scope throws. Silent shadowing is how a route disappears without anyone noticing, and on a surface that carries authentication decisions that has to be loud.

## Authentication

`auth` defaults to `renown`, so a route you write with no options requires a verified bearer and answers `401` without one.

| `auth` | Behaviour |
| --- | --- |
| `"renown"` (default) | A verifiable bearer is required. No bearer is a `401`. |
| `"renown-optional"` | A bearer is verified if present; its absence yields an anonymous actor instead of a `401`. For handlers that make their own per-document decision. |
| `"public"` | No identity is checked. `ctx.actor` is `undefined`. |
| a function | Your own gate, run before the handler. |

```typescript
// Bearer required; ctx.actor.user is the verified principal.
http.get("reports/:id", (_request, ctx) =>
  Response.json({ caller: ctx.actor?.user?.address ?? null }),
);

// Unauthenticated, and written out as such.
http.get("reports/:id/public-summary", { auth: "public" }, () =>
  Response.json({ title: "Q3" }),
);

// Verified if a bearer is present, anonymous if not.
http.get("reports/:id/preview", { auth: "renown-optional" }, (_req, ctx) =>
  Response.json({ full: ctx.actor?.user !== undefined }),
);
```

Widening has to be written out, which is the point: `grep 'auth: "public"'` across the fleet is the complete inventory of unauthenticated package routes. A route that gates inside its handler instead does not appear in that inventory.

A custom authorizer receives the Node `IncomingMessage` and returns a verdict:

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

A refusal with `status` and `message` is answered in the scope's own JSON error envelope. An endpoint that speaks a protocol with its own error shape returns the exact response instead:

```typescript
http.post(
  "rpc",
  {
    auth: () => ({
      authorized: false,
      response: Response.json(
        { jsonrpc: "2.0", error: { code: -32001, message: "Unauthorized" } },
        { status: 401 },
      ),
    }),
  },
  () => new Response(null, { status: 204 }),
);
```

That form exists so a JSON-RPC endpoint does not have to declare itself `public` and gate inside the handler, which would hide it from the inventory above.

Two sharp edges:

- **A custom authorizer resolves no principal.** `ctx.actor` is `undefined` on a route with a function `auth`, exactly as on a `public` one. If you need the caller's identity *and* a custom rule, use `renown` and apply the extra rule inside the handler.
- **`auth: "renown"` does not guarantee an identity.** When the host runs with authentication disabled, every caller is the anonymous actor: `ctx.actor` is `{ user: undefined, authEnabled: false }` and a `renown` route serves them. Read `ctx.actor?.user` before deciding anything, and `ctx.actor?.authEnabled` if the difference matters.

## Request bodies

`body` decides how the payload reaches your handler.

| `body` | Behaviour |
| --- | --- |
| `"parsed"` (default) | Buffered, and readable through the Fetch `Request` (`await request.json()`, `await request.text()`). The bytes go in verbatim. |
| `"raw"` | Buffered, and also handed over as `ctx.rawBody`, byte for byte. |
| `"stream"` | Not buffered. The Fetch `Request` body is the live request stream. |
| `"none"` | The body is not read at all. |

A buffered body is capped at `maxBodyBytes`, default 1 MiB. Past the cap the route answers `413` and closes the connection, because the rest of the body is never read and leftover bytes would be parsed as the next request. `maxBodyBytes` is inert when `body` is `"stream"`, so a streaming handler has to enforce its own ceiling while reading. GET and HEAD never read a body regardless of the mode.

Use `"raw"` when a signature is computed over the octets the client sent. A parse and re-encode round trip changes key order, whitespace and duplicate keys, and the signature stops matching:

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

http.post(
  "ingest",
  { auth: "public", body: "raw", maxBodyBytes: 64 * 1024 },
  (request, ctx) => {
    const raw = ctx.rawBody ?? Buffer.alloc(0);
    const expected = createHmac("sha256", process.env.INGEST_SECRET!)
      .update(raw)
      .digest("hex");
    const presented = request.headers.get("x-signature") ?? "";
    if (
      presented.length !== expected.length ||
      !timingSafeEqual(Buffer.from(presented), Buffer.from(expected))
    ) {
      return new Response(null, { status: 401 });
    }
    return new Response(null, { status: 202 });
  },
);
```

If that is what you are building, read [Receiving webhooks](./08-ReceivingWebhooks.md) first. Verification, replay windows, dedupe and header redaction are already implemented there.

## The route context

The second handler argument carries what the scope resolved before the handler ran:

- `params` — decoded path params, as strings.
- `actor` — the resolved caller: `{ user, authEnabled }`, or `undefined` on a `public` route or one with a custom authorizer. `user.appKey` is the `did:key` of the app instance that issued the request's token, the same value a signer presents when it signs an action, so a request can decide as the same principal the write path presents.
- `rawBody` — the exact octets received. Present only when `body` is `"raw"`.
- `signal` — aborts when the client disconnects. Pass it into anything long-running.
- `transport` — where the request reached the host, resolved through any reverse proxy: `{ proto, host, prefix, baseUrl }`. Use it instead of touching `req.socket` or reading `x-forwarded-*` yourself.

```typescript
http.get("reports/:id/export", async (_request, ctx) => {
  const rows = await query(ctx.params.id, ctx.signal);
  return Response.json({ rows, appKey: ctx.actor?.user?.appKey });
});
```

## Serving sub-paths

Two ways, both verified against the Express and Fastify hosts:

```typescript
// A wildcard param, joined with "/": /api/pkg/blobs/a/b/c.txt → "a/b/c.txt"
http.get("blobs/*rest", { auth: "public" }, (_request, ctx) =>
  Response.json({ rest: ctx.params.rest }),
);

// A prefix match: the handler also answers every path below "files".
http.get("files", { auth: "public", prefix: true }, () => new Response("hit"));
```

Prefer the wildcard when you need the sub-path, since `prefix: true` gives you no param for it. Routes within a scope are matched in registration order, so register a specific route before a prefix route that would swallow it.

## The forwarded origin

`ctx.transport` says where the request reached the host — `proto`, `host`, `prefix`, and the `baseUrl` they compose. Behind a reverse proxy the socket knows none of this, so the values come from the `X-Forwarded-Proto`, `X-Forwarded-Host` and `X-Forwarded-Prefix` headers.

Those headers are client-written. A host that is reachable without a proxy in front must not believe them, or a caller could choose the origin your package advertises — a callback URL or an asset link built from `ctx.transport.baseUrl` would point wherever the caller said. So the host declares its topology through `trustProxy` on the route service: off by default, and on in the deployed reactor, which always has a balancer in front. Untrusted, `proto` follows the socket and `host` comes from the request's own `Host` header.

There is no rate limiting at this layer. A per-process counter cannot express a fleet-wide limit — behind a balancer with three instances, a declared 60/min admits up to 180 — so limits belong at the edge, where the state is shared and a flood is refused before it reaches the reactor at all.

## Absolute URLs

`scope.baseUrl` is the public base every route in the scope hangs off, and each registration handle carries the absolute URL that route answers on:

```typescript
const handle = http.get("reports/:id", { auth: "public" }, () =>
  new Response(""),
);
// https://switchboard.example/api/@powerhousedao/reports/reports/:id
console.log(handle.url, http.baseUrl);
```

Both are absolute, because a package hands them to third parties: a provider callback, a link stored in a document. The reactor resolves its origin from `PUBLIC_URL`, then `RENDER_EXTERNAL_URL`, then `HEROKU_APP_DEFAULT_DOMAIN_NAME`, and falls back to `http://localhost:<port>`, which is right behind a tunnel in development and obviously wrong rather than silently unusable elsewhere.

A host embedding the route service without telling it an origin is the one case where both degrade to a path (`/api/document-model`). If you are about to persist a URL or send it upstream, check for a leading `/` and refuse rather than store a value no third party can resolve. When you are answering a request rather than minting a link, `ctx.transport.baseUrl` is the origin the request actually arrived on.

## Disposal

Packages hot-reload, so every registration is reversible — but **you do not have to do this yourself**. The host releases your whole scope when your package is replaced or removed, and every scope when it shuts down. Routes you register and forget are cleaned up.

`handle.dispose()` and `scope.dispose()` are there for the cases the host cannot know about: a route you want to stop serving while the package stays loaded, or a scope a test stood up. Disposing something already gone is a no-op, and after disposal the same package can register the same path again, which is what makes a reload a dispose followed by a register.

Why it is the host's job rather than yours: a route that outlives its package stays mounted against the old code, and because re-registering the same method and path throws, the *next* load would fail on the leak instead of replacing it. That is too sharp an edge to leave to every package remembering an `onDisconnect`.

Webhook endpoints are not revoked when a package unloads. A redeploy must not force re-registration with every provider, so token rows persist and the endpoint answers `503` until the package returns.

## The Node escape hatch

Some protocols must own the socket. `nodeRoute()` hands your handler the raw `IncomingMessage` and `ServerResponse`, still inside your namespace, with nothing having touched the request stream:

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

`auth` and `prefix` still apply. `body` and `maxBodyBytes` do not exist on a node route: the handler reads the stream itself, so the scope has no body to shape and nothing to measure. A cap declared there would be silently inert, so a node route that needs one enforces it while reading.

Reach for it when a protocol implementation writes to the response itself, hijacks the connection, or holds a long-lived stream the Fetch shape cannot express. Do not reach for it to get the raw bytes (`body: "raw"` does that), to stream a response (a Fetch `Response` with a `ReadableStream` body does that), or because the Fetch types are unfamiliar. You give up the body cap and the uniform error handling, and you take on writing correct status codes and headers yourself.

## What the scope deliberately does not have

- **`OPTIONS`.** Preflight belongs to the CORS layer, which answers for your namespace already.
- **Middleware.** There is no `scope.use()`. Auth and body policy are declarative fields precisely so they can be audited across every package in the fleet; free-form middleware puts each package back in charge of deciding.
- **A way to name a path.** Absolute paths, `..` segments and URL-shaped paths all throw.
