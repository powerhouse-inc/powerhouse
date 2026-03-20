/**
 * Shared contract test suite for IGatewayAdapter implementations.
 *
 * Import this module and call runGatewayAdapterContractTests() in your
 * adapter-specific test file to verify that the implementation satisfies
 * the full IGatewayAdapter behavioral contract.
 *
 * Usage:
 *
 *   import { runGatewayAdapterContractTests } from "./gateway-adapter-contract.js";
 *
 *   runGatewayAdapterContractTests("MyAdapter", async () => {
 *     const adapter = new MyGatewayAdapter(...);
 *     const httpServer = createServer();
 *     return { adapter, httpServer, close: () => adapter.stop() };
 *   });
 */

import { buildSubgraphSchema } from "@apollo/subgraph";
import { gql } from "graphql-tag";
import type { DocumentNode, GraphQLSchema } from "graphql";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  FetchHandler,
  GatewayContextFactory,
  IGatewayAdapter,
  SubgraphDefinition,
} from "../../src/graphql/gateway/types.js";
import type { Context } from "../../src/graphql/types.js";

// ─── harness type ────────────────────────────────────────────────────────────

export type GatewayAdapterHarness = {
  adapter: IGatewayAdapter<Context>;
  /**
   * Shut down the adapter and release any resources. Called in afterEach.
   * Implementations should be idempotent (safe to call after stop()).
   */
  close: () => Promise<void>;
};

export type GatewayAdapterHarnessFactory = () => Promise<GatewayAdapterHarness>;

// ─── shared helpers ──────────────────────────────────────────────────────────

/** A minimal context factory that satisfies GatewayContextFactory<Context>. */
const noopCtx: GatewayContextFactory<Context> = async () => ({
  headers: {},
  db: null,
});

/**
 * Build a minimal federated schema with a single Query field.
 * Uses buildSubgraphSchema from @apollo/subgraph to ensure schema instances
 * are compatible with Apollo Server's graphql module instance.
 */
function makeSchema(fieldName = "hello", returnValue = "world"): GraphQLSchema {
  return buildSubgraphSchema({
    typeDefs: gql`
      type Query {
        ${fieldName}: String
      }
    `,
    resolvers: {
      Query: {
        [fieldName]: () => returnValue,
      },
    },
  });
}

/** A minimal http.Server used to satisfy the start() signature. */
function makeHttpServer() {
  const server = createServer();
  return {
    server,
    close: () => new Promise<void>((resolve) => server.close(() => resolve())),
  };
}

// ─── contract tests ──────────────────────────────────────────────────────────

export function runGatewayAdapterContractTests(
  adapterName: string,
  createHarness: GatewayAdapterHarnessFactory,
): void {
  // ── lifecycle ──────────────────────────────────────────────────────────────

  describe(`IGatewayAdapter contract (${adapterName}) – lifecycle`, () => {
    let h: GatewayAdapterHarness;
    let httpServer: ReturnType<typeof makeHttpServer>;

    beforeEach(async () => {
      h = await createHarness();
      httpServer = makeHttpServer();
    });
    afterEach(async () => {
      await httpServer.close();
      await h.close();
    });

    it("start() resolves without throwing", async () => {
      await expect(h.adapter.start(httpServer.server)).resolves.toBeUndefined();
    });

    it("stop() resolves without throwing when no handlers have been created", async () => {
      await h.adapter.start(httpServer.server);
      await expect(h.adapter.stop()).resolves.toBeUndefined();
    });

    it("stop() resolves without throwing after createHandler() calls", async () => {
      await h.adapter.start(httpServer.server);
      await h.adapter.createHandler(makeSchema(), noopCtx);
      await h.adapter.createHandler(makeSchema(), noopCtx);
      await expect(h.adapter.stop()).resolves.toBeUndefined();
    });

    it("stop() is safe to call multiple times", async () => {
      await h.adapter.start(httpServer.server);
      await h.adapter.createHandler(makeSchema(), noopCtx);
      await h.adapter.stop();
      await expect(h.adapter.stop()).resolves.toBeUndefined();
    });
  });

  // ── createHandler ──────────────────────────────────────────────────────────

  describe(`IGatewayAdapter contract (${adapterName}) – createHandler`, () => {
    let h: GatewayAdapterHarness;
    let httpServer: ReturnType<typeof makeHttpServer>;

    beforeEach(async () => {
      h = await createHarness();
      httpServer = makeHttpServer();
      await h.adapter.start(httpServer.server);
    });
    afterEach(async () => {
      await httpServer.close();
      await h.close();
    });

    it("returns a callable FetchHandler", async () => {
      const handler = await h.adapter.createHandler(makeSchema(), noopCtx);
      expect(typeof handler).toBe("function");
    });

    it("the handler returns a Response for a valid query", async () => {
      const handler = await h.adapter.createHandler(makeSchema(), noopCtx);

      const res = await handler(
        new Request("http://localhost/graphql", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: "{ hello }" }),
        }),
      );

      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { hello: string } };
      expect(body.data.hello).toBe("world");
    });

    it("the handler returns an error response for an invalid query", async () => {
      const handler = await h.adapter.createHandler(makeSchema(), noopCtx);

      const res = await handler(
        new Request("http://localhost/graphql", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: "{ doesNotExist }" }),
        }),
      );

      expect(res).toBeInstanceOf(Response);
      // Apollo returns 400 for validation errors; implementations may vary
      // but must not return 200 for an invalid query
      expect(res.status).not.toBe(200);
      const body = (await res.json()) as { errors?: unknown[] };
      expect(body.errors).toBeDefined();
    });

    it("the handler passes the Fetch Request to the context factory", async () => {
      let capturedRequest: Request | undefined;
      const ctxFactory: GatewayContextFactory<Context> = async (req) => {
        capturedRequest = req;
        return { headers: {}, db: null };
      };

      const handler = await h.adapter.createHandler(makeSchema(), ctxFactory);
      await handler(
        new Request("http://localhost/graphql", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-token": "abc123",
          },
          body: JSON.stringify({ query: "{ hello }" }),
        }),
      );

      expect(capturedRequest?.headers.get("x-token")).toBe("abc123");
    });

    it("multiple handlers created from different schemas are independent", async () => {
      const handlerA = await h.adapter.createHandler(
        makeSchema("hello", "from-a"),
        noopCtx,
      );
      const handlerB = await h.adapter.createHandler(
        makeSchema("hello", "from-b"),
        noopCtx,
      );

      const request = () =>
        new Request("http://localhost/graphql", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: "{ hello }" }),
        });

      const [resA, resB] = await Promise.all([
        handlerA(request()),
        handlerB(request()),
      ]);

      const bodyA = (await resA.json()) as { data: { hello: string } };
      const bodyB = (await resB.json()) as { data: { hello: string } };

      expect(bodyA.data.hello).toBe("from-a");
      expect(bodyB.data.hello).toBe("from-b");
    });
  });

  // ── createSupergraphHandler + updateSupergraph ────────────────────────────
  //
  // These tests require real HTTP subgraph servers because the federation
  // gateway uses RemoteGraphQLDataSource to route requests by URL.
  //
  // Helper: wrap a FetchHandler in a real Node HTTP server so the gateway
  // can reach it via a localhost URL.
  async function serveHandler(handler: FetchHandler) {
    const server = createServer(
      async (nodeReq: IncomingMessage, nodeRes: ServerResponse) => {
        const chunks: Buffer[] = [];
        for await (const chunk of nodeReq as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);
        const url = `http://127.0.0.1${nodeReq.url ?? "/"}`;
        const fetchReq = new Request(url, {
          method: nodeReq.method ?? "GET",
          headers: nodeReq.headers as Record<string, string>,
          ...(body.length > 0 ? { body } : {}),
        });
        try {
          const fetchRes = await handler(fetchReq);
          nodeRes.statusCode = fetchRes.status;
          fetchRes.headers.forEach((value, key) =>
            nodeRes.setHeader(key, value),
          );
          nodeRes.end(await fetchRes.text());
        } catch {
          nodeRes.statusCode = 500;
          nodeRes.end("Internal server error");
        }
      },
    );
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as { port: number };
    return {
      url: `http://127.0.0.1:${port}`,
      close: () =>
        new Promise<void>((resolve) => server.close(() => resolve())),
    };
  }

  describe(`IGatewayAdapter contract (${adapterName}) – createSupergraphHandler`, () => {
    let h: GatewayAdapterHarness;
    let httpServer: ReturnType<typeof makeHttpServer>;
    const subServers: Array<{ close: () => Promise<void> }> = [];

    beforeEach(async () => {
      h = await createHarness();
      httpServer = makeHttpServer();
      await h.adapter.start(httpServer.server);
    });
    afterEach(async () => {
      await Promise.all(subServers.map((s) => s.close()));
      subServers.length = 0;
      await httpServer.close();
      await h.close();
    });

    // Spin up a real HTTP subgraph server backed by the adapter's createHandler.
    async function makeSubServer(
      fieldName = "hello",
      returnValue = "world",
    ): Promise<SubgraphDefinition> {
      const typeDefs: DocumentNode = gql`
        type Query {
          ${fieldName}: String
        }
      `;
      const schema: GraphQLSchema = buildSubgraphSchema({
        typeDefs,
        resolvers: { Query: { [fieldName]: () => returnValue } },
      });
      const handler = await h.adapter.createHandler(schema, noopCtx);
      const sub = await serveHandler(handler);
      subServers.push(sub);
      return { name: fieldName, typeDefs, url: sub.url };
    }

    it("returns a callable FetchHandler", async () => {
      const sub = await makeSubServer();
      const handler = await h.adapter.createSupergraphHandler(
        () => [sub],
        httpServer.server,
        noopCtx,
      );
      expect(typeof handler).toBe("function");
    });

    it("the supergraph handler executes a federated query", async () => {
      const sub = await makeSubServer("hello", "world");
      const handler = await h.adapter.createSupergraphHandler(
        () => [sub],
        httpServer.server,
        noopCtx,
      );

      const res = await handler(
        new Request("http://localhost/graphql", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: "{ hello }" }),
        }),
      );

      expect(res).toBeInstanceOf(Response);
      expect(res.status).toBe(200);
      const body = (await res.json()) as { data: { hello: string } };
      expect(body.data.hello).toBe("world");
    });

    it("the supergraph handler passes context factory the Fetch Request", async () => {
      let capturedRequest: Request | undefined;
      const ctxFactory: GatewayContextFactory<Context> = async (req) => {
        capturedRequest = req;
        return { headers: {}, db: null };
      };

      const sub = await makeSubServer();
      const handler = await h.adapter.createSupergraphHandler(
        () => [sub],
        httpServer.server,
        ctxFactory,
      );

      await handler(
        new Request("http://localhost/graphql", {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-token": "test-value",
          },
          body: JSON.stringify({ query: "{ hello }" }),
        }),
      );

      expect(capturedRequest?.headers.get("x-token")).toBe("test-value");
    });

    it("calling createSupergraphHandler() twice throws", async () => {
      const sub = await makeSubServer();
      await h.adapter.createSupergraphHandler(
        () => [sub],
        httpServer.server,
        noopCtx,
      );
      await expect(
        h.adapter.createSupergraphHandler(
          () => [sub],
          httpServer.server,
          noopCtx,
        ),
      ).rejects.toThrow();
    });

    it("stop() after createSupergraphHandler() resolves without throwing", async () => {
      const sub = await makeSubServer();
      await h.adapter.createSupergraphHandler(
        () => [sub],
        httpServer.server,
        noopCtx,
      );
      await expect(h.adapter.stop()).resolves.toBeUndefined();
    });
  });

  // ── updateSupergraph ───────────────────────────────────────────────────────

  describe(`IGatewayAdapter contract (${adapterName}) – updateSupergraph`, () => {
    let h: GatewayAdapterHarness;
    let httpServer: ReturnType<typeof makeHttpServer>;
    const subServers: Array<{ close: () => Promise<void> }> = [];

    beforeEach(async () => {
      h = await createHarness();
      httpServer = makeHttpServer();
      await h.adapter.start(httpServer.server);
    });
    afterEach(async () => {
      await Promise.all(subServers.map((s) => s.close()));
      subServers.length = 0;
      await httpServer.close();
      await h.close();
    });

    it("updateSupergraph() is a no-op before createSupergraphHandler()", async () => {
      await expect(h.adapter.updateSupergraph()).resolves.toBeUndefined();
    });

    it("updateSupergraph() resolves after createSupergraphHandler()", async () => {
      const typeDefs: DocumentNode = gql`
        type Query {
          hello: String
        }
      `;
      const schema: GraphQLSchema = buildSubgraphSchema({
        typeDefs,
        resolvers: { Query: { hello: () => "world" } },
      });
      const handler = await h.adapter.createHandler(schema, noopCtx);
      const sub = await serveHandler(handler);
      subServers.push(sub);

      await h.adapter.createSupergraphHandler(
        () => [{ name: "hello", typeDefs, url: sub.url }],
        httpServer.server,
        noopCtx,
      );

      await expect(h.adapter.updateSupergraph()).resolves.toBeUndefined();
    });
  });

  // ── lifecycle (stop after createSupergraphHandler) ─────────────────────────

  // ── attachWebSocket ────────────────────────────────────────────────────────
  // Skipped in the Vitest environment because graphql-ws/use/ws is blocked by
  // websocket.ts when VITEST=true. Adapters that support WebSocket in tests
  // can override this by running the suite with NODE_ENV != "test".

  const itWs = process.env.VITEST === "true" ? it.skip : it;

  describe(`IGatewayAdapter contract (${adapterName}) – attachWebSocket`, () => {
    let h: GatewayAdapterHarness;
    let httpServer: ReturnType<typeof makeHttpServer>;

    beforeEach(async () => {
      h = await createHarness();
      httpServer = makeHttpServer();
      await h.adapter.start(httpServer.server);
    });
    afterEach(async () => {
      await httpServer.close();
      await h.close();
    });

    itWs("returns a WsDisposer with a dispose() method", async () => {
      const { WebSocketServer } = await import("ws");
      const wss = new WebSocketServer({ noServer: true });

      const disposer = h.adapter.attachWebSocket(
        wss,
        makeSchema(),
        async () => ({ headers: {}, db: null }),
      );

      expect(typeof disposer.dispose).toBe("function");
      await disposer.dispose();
      wss.close();
    });
  });
}
