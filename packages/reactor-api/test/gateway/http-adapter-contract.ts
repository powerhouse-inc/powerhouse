/**
 * Shared contract test suite for IHttpAdapter implementations.
 *
 * Import this module and call runHttpAdapterContractTests() in your
 * adapter-specific test file to verify that the implementation satisfies
 * the full IHttpAdapter behavioral contract.
 *
 * Usage:
 *
 *   import { runHttpAdapterContractTests } from "./http-adapter-contract.js";
 *
 *   runHttpAdapterContractTests("MyAdapter", async () => {
 *     const adapter = new MyHttpAdapter(...);
 *     adapter.setupMiddleware({});
 *     // start your framework's server on an ephemeral port
 *     return { adapter, url: "http://127.0.0.1:PORT", close, respondWithJson };
 *   });
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { IHttpAdapter } from "../../src/graphql/gateway/types.js";
import type { FetchHandler } from "../../src/graphql/gateway/types.js";

// ─── harness type ────────────────────────────────────────────────────────────

export type HttpAdapterHarness = {
  /** The adapter under test, with setupMiddleware already called. */
  adapter: IHttpAdapter;
  /** Base URL of the running test server (e.g. "http://127.0.0.1:PORT"). */
  url: string;
  /** Shut down the server and release the port. */
  close: () => Promise<void>;
  /**
   * Write a 200 JSON response to the framework-native response object
   * received in a get() handler. Adapters differ here (express.Response,
   * FastifyReply, etc.), so the harness provides the implementation.
   */
  respondWithJson: (res: unknown, data: unknown) => void;
};

export type HttpAdapterHarnessFactory = () => Promise<HttpAdapterHarness>;

// ─── shared helpers ──────────────────────────────────────────────────────────

/** A FetchHandler that echoes the matched path and JSON body back to the caller. */
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

// ─── contract tests ──────────────────────────────────────────────────────────

export function runHttpAdapterContractTests(
  adapterName: string,
  createHarness: HttpAdapterHarnessFactory,
): void {
  // ── routing ────────────────────────────────────────────────────────────────

  describe(`IHttpAdapter contract (${adapterName}) – routing`, () => {
    let h: HttpAdapterHarness;

    beforeEach(async () => {
      h = await createHarness();
    });
    afterEach(async () => {
      await h.close();
    });

    it("routes a path to its registered handler", async () => {
      h.adapter.mount("/graphql", echoHandler("gateway"));

      const res = await fetch(`${h.url}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      const data = (await res.json()) as { handler: string };
      expect(data.handler).toBe("gateway");
    });

    it("routes a sub-path to its own handler, not the parent handler", async () => {
      // Critical regression: if the parent path uses prefix matching, every
      // request to /graphql/sub would be handled by the gateway instead of the
      // subgraph server, causing an infinite routing loop and OOM crash.
      h.adapter.mount("/graphql", echoHandler("gateway"));
      h.adapter.mount("/graphql/sub", echoHandler("sub"));

      const res = await fetch(`${h.url}/graphql/sub`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "{ __typename }" }),
      });
      const data = (await res.json()) as { handler: string };
      expect(data.handler).toBe("sub");
    });

    it("does not confuse a query string with the path when routing", async () => {
      h.adapter.mount("/graphql", echoHandler("gateway"));

      const res = await fetch(`${h.url}/graphql?query=%7B__typename%7D`);
      const data = (await res.json()) as { handler: string };
      expect(data.handler).toBe("gateway");
    });

    it("returns 404 when no handler matches the path", async () => {
      h.adapter.mount("/graphql", echoHandler("gateway"));

      const res = await fetch(`${h.url}/unknown`);
      expect(res.status).toBe(404);
    });

    it("last-mounted handler wins when the same path is mounted twice", async () => {
      h.adapter.mount("/graphql", echoHandler("first"));
      h.adapter.mount("/graphql", echoHandler("second"));

      const res = await fetch(`${h.url}/graphql`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const data = (await res.json()) as { handler: string };
      expect(data.handler).toBe("second");
    });

    it("routes all paths correctly when gateway is registered before subgraphs", async () => {
      // Mirrors production order: the federation gateway is mounted first in
      // #createApolloGateway(), then per-subgraph handlers in _updateRouter().
      h.adapter.mount("/graphql", echoHandler("gateway"));
      h.adapter.mount("/graphql/document-model", echoHandler("document-model"));
      h.adapter.mount("/graphql/document-drive", echoHandler("document-drive"));

      const post = (path: string) =>
        fetch(`${h.url}${path}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        });

      const [gatewayRes, modelRes, driveRes] = await Promise.all([
        post("/graphql"),
        post("/graphql/document-model"),
        post("/graphql/document-drive"),
      ]);

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

  // ── request / response conversion ─────────────────────────────────────────

  describe(`IHttpAdapter contract (${adapterName}) – request/response conversion`, () => {
    let h: HttpAdapterHarness;

    beforeEach(async () => {
      h = await createHarness();
    });
    afterEach(async () => {
      await h.close();
    });

    it("passes incoming request headers to the Fetch Request", async () => {
      let capturedHeaders: Record<string, string> = {};

      h.adapter.mount("/api", async (req) => {
        req.headers.forEach((value, key) => {
          capturedHeaders[key] = value;
        });
        return new Response("ok");
      });

      await fetch(`${h.url}/api`, {
        headers: {
          "x-custom-header": "test-value",
          authorization: "Bearer token",
        },
      });

      expect(capturedHeaders["x-custom-header"]).toBe("test-value");
      expect(capturedHeaders["authorization"]).toBe("Bearer token");
    });

    it("passes the POST JSON body to the Fetch Request", async () => {
      let capturedBody: unknown;

      h.adapter.mount("/api", async (req) => {
        capturedBody = await req.json();
        return new Response("ok");
      });

      await fetch(`${h.url}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hello: "world", nested: { value: 42 } }),
      });

      expect(capturedBody).toEqual({ hello: "world", nested: { value: 42 } });
    });

    it("GET requests arrive with no body consumed", async () => {
      let bodyUsed = false;

      h.adapter.mount("/api", async (req) => {
        bodyUsed = req.bodyUsed;
        return new Response("ok");
      });

      await fetch(`${h.url}/api`);
      expect(bodyUsed).toBe(false);
    });

    it("writes the handler response status to the HTTP response", async () => {
      h.adapter.mount(
        "/api",
        async () => new Response("not found", { status: 404 }),
      );

      const res = await fetch(`${h.url}/api`);
      expect(res.status).toBe(404);
    });

    it("writes handler response headers to the HTTP response", async () => {
      h.adapter.mount(
        "/api",
        async () =>
          new Response("ok", {
            headers: { "x-custom": "my-value", "content-type": "text/plain" },
          }),
      );

      const res = await fetch(`${h.url}/api`);
      expect(res.headers.get("x-custom")).toBe("my-value");
    });

    it("writes the handler response body to the HTTP response", async () => {
      h.adapter.mount("/api", async () =>
        Response.json({ message: "hello from handler" }),
      );

      const res = await fetch(`${h.url}/api`);
      const data = (await res.json()) as { message: string };
      expect(data.message).toBe("hello from handler");
    });

    it("returns 500 when the handler throws", async () => {
      h.adapter.mount("/api", async () => {
        throw new Error("handler error");
      });

      const res = await fetch(`${h.url}/api`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      expect(res.status).toBe(500);
    });
  });

  // ── get() REST endpoint ────────────────────────────────────────────────────

  describe(`IHttpAdapter contract (${adapterName}) – get()`, () => {
    let h: HttpAdapterHarness;

    beforeEach(async () => {
      h = await createHarness();
    });
    afterEach(async () => {
      await h.close();
    });

    it("registers a GET route and passes URL params to the handler", async () => {
      const handler = vi.fn(
        (_params: Record<string, string>, _req: unknown, res: unknown) => {
          h.respondWithJson(res, { ok: true });
        },
      );
      h.adapter.get("/d/:driveId", handler);

      const res = await fetch(`${h.url}/d/my-drive-123`);
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledOnce();
      const [params] = handler.mock.calls[0];
      expect(params.driveId).toBe("my-drive-123");
    });

    it("GET route does not respond to POST requests", async () => {
      h.adapter.get("/d/:driveId", (_params, _req, res) => {
        h.respondWithJson(res, { ok: true });
      });

      const res = await fetch(`${h.url}/d/some-drive`, { method: "POST" });
      expect(res.status).not.toBe(200);
    });
  });
}
