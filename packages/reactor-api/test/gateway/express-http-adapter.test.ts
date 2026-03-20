import express, { Router } from "express";
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ExpressHttpAdapter } from "../../src/graphql/gateway/express-http-adapter.js";
import type { FetchHandler } from "../../src/graphql/gateway/types.js";

// ─── helpers ────────────────────────────────────────────────────────────────

/** Starts an HTTP server on an ephemeral port and returns its base URL. */
async function startServer(
  app: express.Express,
): Promise<{ url: string; close: () => Promise<void> }> {
  const server = createServer(app);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const addr = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${addr.port}`,
    close: () =>
      new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      ),
  };
}

/** Returns a FetchHandler that echoes the request path and body back as JSON. */
function echoHandler(label: string): FetchHandler {
  return async (req: Request) => {
    let body: unknown = null;
    if (req.method !== "GET" && req.method !== "HEAD") {
      try {
        body = await req.json();
      } catch {
        // empty body
      }
    }
    return Response.json({
      handler: label,
      path: new URL(req.url).pathname,
      body,
    });
  };
}

// ─── routing ────────────────────────────────────────────────────────────────

describe("ExpressHttpAdapter – routing", () => {
  let app: express.Express;
  let adapter: ExpressHttpAdapter;
  let ctx: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    app = express();
    const router = Router();
    adapter = new ExpressHttpAdapter(router);
    adapter.setupMiddleware({});
    app.use("/", router);
    ctx = await startServer(app);
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("routes /graphql to the gateway handler", async () => {
    adapter.mount("/graphql", echoHandler("gateway"));
    adapter.mount("/graphql/sub", echoHandler("sub"));

    const res = await fetch(`${ctx.url}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    const data = (await res.json()) as { handler: string };
    expect(data.handler).toBe("gateway");
  });

  it("routes /graphql/sub to the sub handler, not the gateway handler", async () => {
    // This is the critical regression test: with { end: false }, the /graphql
    // handler would have matched /graphql/sub first (because /graphql is a
    // prefix of /graphql/sub), causing all subgraph requests to be routed to
    // the federation gateway instead of the correct subgraph server.
    adapter.mount("/graphql", echoHandler("gateway"));
    adapter.mount("/graphql/sub", echoHandler("sub"));

    const res = await fetch(`${ctx.url}/graphql/sub`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: "{ __typename }" }),
    });
    const data = (await res.json()) as { handler: string };
    expect(data.handler).toBe("sub");
  });

  it("matches /graphql even when the URL includes a query string", async () => {
    adapter.mount("/graphql", echoHandler("gateway"));

    const res = await fetch(`${ctx.url}/graphql?query=%7B__typename%7D`);
    const data = (await res.json()) as { handler: string };
    expect(data.handler).toBe("gateway");
  });

  it("returns 404 when no handler matches the path", async () => {
    adapter.mount("/graphql", echoHandler("gateway"));

    const res = await fetch(`${ctx.url}/unknown`);
    expect(res.status).toBe(404);
  });

  it("last-mounted handler wins when the same path is mounted twice (Map.set overwrites)", async () => {
    adapter.mount("/graphql", echoHandler("first"));
    adapter.mount("/graphql", echoHandler("second"));

    const res = await fetch(`${ctx.url}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const data = (await res.json()) as { handler: string };
    expect(data.handler).toBe("second");
  });

  it("routes independently when gateway is registered before subgraphs (original insertion order)", async () => {
    // Mirrors production order: gateway mounted in #createApolloGateway()
    // before document-model/document-drive in _updateRouter().
    adapter.mount("/graphql", echoHandler("gateway"));
    adapter.mount("/graphql/document-model", echoHandler("document-model"));
    adapter.mount("/graphql/document-drive", echoHandler("document-drive"));

    const gatewayRes = await fetch(`${ctx.url}/graphql`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const modelRes = await fetch(`${ctx.url}/graphql/document-model`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    const driveRes = await fetch(`${ctx.url}/graphql/document-drive`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });

    expect(((await gatewayRes.json()) as { handler: string }).handler).toBe(
      "gateway",
    );
    expect(((await modelRes.json()) as { handler: string }).handler).toBe(
      "document-model",
    );
    expect(((await driveRes.json()) as { handler: string }).handler).toBe(
      "document-drive",
    );
  });
});

// ─── request / response conversion ──────────────────────────────────────────

describe("ExpressHttpAdapter – request/response conversion", () => {
  let app: express.Express;
  let adapter: ExpressHttpAdapter;
  let ctx: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    app = express();
    const router = Router();
    adapter = new ExpressHttpAdapter(router);
    adapter.setupMiddleware({});
    app.use("/", router);
    ctx = await startServer(app);
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("passes request headers to the Fetch Request", async () => {
    let capturedHeaders: Record<string, string> = {};

    adapter.mount("/api", async (req) => {
      req.headers.forEach((value, key) => {
        capturedHeaders[key] = value;
      });
      return new Response("ok");
    });

    await fetch(`${ctx.url}/api`, {
      headers: {
        "x-custom-header": "test-value",
        authorization: "Bearer token",
      },
    });

    expect(capturedHeaders["x-custom-header"]).toBe("test-value");
    expect(capturedHeaders["authorization"]).toBe("Bearer token");
  });

  it("passes POST JSON body to the Fetch Request", async () => {
    let capturedBody: unknown;

    adapter.mount("/api", async (req) => {
      capturedBody = await req.json();
      return new Response("ok");
    });

    await fetch(`${ctx.url}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hello: "world", nested: { value: 42 } }),
    });

    expect(capturedBody).toEqual({ hello: "world", nested: { value: 42 } });
  });

  it("GET requests have no body in the Fetch Request", async () => {
    let bodyUsed = false;

    adapter.mount("/api", async (req) => {
      bodyUsed = req.bodyUsed;
      return new Response("ok");
    });

    await fetch(`${ctx.url}/api`);
    expect(bodyUsed).toBe(false);
  });

  it("writes response status back to the Express response", async () => {
    adapter.mount(
      "/api",
      async () => new Response("not found", { status: 404 }),
    );

    const res = await fetch(`${ctx.url}/api`);
    expect(res.status).toBe(404);
  });

  it("writes response headers back to the Express response", async () => {
    adapter.mount(
      "/api",
      async () =>
        new Response("ok", {
          headers: { "x-custom": "my-value", "content-type": "text/plain" },
        }),
    );

    const res = await fetch(`${ctx.url}/api`);
    expect(res.headers.get("x-custom")).toBe("my-value");
  });

  it("writes response body back to the Express response", async () => {
    adapter.mount("/api", async () =>
      Response.json({ message: "hello from handler" }),
    );

    const res = await fetch(`${ctx.url}/api`);
    const data = (await res.json()) as { message: string };
    expect(data.message).toBe("hello from handler");
  });

  it("calls next() with the error when the handler rejects", async () => {
    adapter.mount("/api", async () => {
      throw new Error("handler error");
    });

    const res = await fetch(`${ctx.url}/api`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
    });
    expect(res.status).toBe(500);
  });
});

// ─── REST get() registration ─────────────────────────────────────────────────

describe("ExpressHttpAdapter – get()", () => {
  let app: express.Express;
  let adapter: ExpressHttpAdapter;
  let ctx: Awaited<ReturnType<typeof startServer>>;

  beforeEach(async () => {
    app = express();
    const router = Router();
    adapter = new ExpressHttpAdapter(router);
    adapter.setupMiddleware({});
    app.use("/", router);
    ctx = await startServer(app);
  });

  afterEach(async () => {
    await ctx.close();
  });

  it("registers a GET route and passes URL params to the handler", async () => {
    const handler = vi.fn(
      (_params: Record<string, string>, _req: unknown, res: unknown) => {
        (res as express.Response).json({ ok: true });
      },
    );
    adapter.get("/d/:driveId", handler);

    const res = await fetch(`${ctx.url}/d/my-drive-123`);
    expect(res.status).toBe(200);
    expect(handler).toHaveBeenCalledOnce();
    const [params] = handler.mock.calls[0];
    expect(params.driveId).toBe("my-drive-123");
  });
});
