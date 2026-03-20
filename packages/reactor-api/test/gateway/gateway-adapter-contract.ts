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
import type { GraphQLSchema } from "graphql";
import { createServer } from "node:http";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type {
  GatewayContextFactory,
  IGatewayAdapter,
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
