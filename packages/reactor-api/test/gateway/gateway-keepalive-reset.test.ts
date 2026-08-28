import { buildSubgraphSchema } from "@apollo/subgraph";
import { gql } from "graphql-tag";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createServer } from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ApolloGatewayAdapter } from "../../src/graphql/gateway/adapter-gateway-apollo.js";
import type {
  FetchHandler,
  GatewayContextFactory,
} from "../../src/graphql/gateway/types.js";
import type { Context } from "../../src/graphql/types.js";

// Node closes an idle keep-alive connection 5 s after the last response and says so in every
// response (`Keep-Alive: timeout=5`); a pooled connection reused around that moment hits a closed socket.

const noopCtx: GatewayContextFactory<Context> = () =>
  Promise.resolve({ headers: {}, db: null });

const silentLogger = {
  level: "error" as const,
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  errorHandler: vi.fn(),
  child: () => silentLogger,
};

// Close enough to the server's 5 s that a client without its own margin still holds the socket,
// far enough that one honouring the hint has already let it go.
const IDLE_MS = 4_500;

/** Serve a FetchHandler over real HTTP, counting the connections the client opens. */
async function serveCountingConnections(handler: FetchHandler) {
  let connections = 0;
  const server = createServer(
    (nodeReq: IncomingMessage, nodeRes: ServerResponse) => {
      void (async () => {
        const chunks: Buffer[] = [];
        for await (const chunk of nodeReq as AsyncIterable<Buffer>) {
          chunks.push(chunk);
        }
        const body = Buffer.concat(chunks);
        const fetchReq = new Request(`http://127.0.0.1${nodeReq.url ?? "/"}`, {
          method: nodeReq.method ?? "GET",
          headers: nodeReq.headers as Record<string, string>,
          ...(body.length > 0 ? { body } : {}),
        });
        const fetchRes = await handler(fetchReq);
        nodeRes.statusCode = fetchRes.status;
        fetchRes.headers.forEach((value, key) => nodeRes.setHeader(key, value));
        nodeRes.end(await fetchRes.text());
      })();
    },
  );
  server.on("connection", () => {
    connections += 1;
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  return {
    url: `http://127.0.0.1:${port}`,
    connections: () => connections,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

describe("supergraph gateway – subgraph keep-alive", () => {
  const cleanups: Array<() => Promise<void>> = [];
  afterEach(async () => {
    await Promise.all(cleanups.splice(0).map((close) => close()));
  });

  it("stops reusing a subgraph connection before the server's keep-alive timeout can close it", async () => {
    const adapter = new ApolloGatewayAdapter(silentLogger);
    const gatewayServer = createServer();
    cleanups.push(() => adapter.stop());
    cleanups.push(
      () =>
        new Promise<void>((resolve) => gatewayServer.close(() => resolve())),
    );
    await adapter.start(gatewayServer);

    const typeDefs = gql`
      type Query {
        hello: String
      }
    `;
    const schema = buildSubgraphSchema({
      typeDefs,
      resolvers: { Query: { hello: () => "world" } },
    });
    const subgraph = await serveCountingConnections(
      await adapter.createHandler(schema, noopCtx),
    );
    cleanups.push(subgraph.close);

    const supergraph = await adapter.createSupergraphHandler(
      () => [{ name: "hello", typeDefs, url: subgraph.url }],
      gatewayServer,
      noopCtx,
    );
    const query = () =>
      supergraph(
        new Request("http://localhost/graphql", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ query: "{ hello }" }),
        }),
      ).then(
        (res) =>
          res.json() as Promise<{
            data?: { hello: string | null };
            errors?: unknown[];
          }>,
      );

    expect(await query()).toEqual({ data: { hello: "world" } });
    expect(subgraph.connections()).toBe(1);

    await new Promise((resolve) => setTimeout(resolve, IDLE_MS));

    expect(await query()).toEqual({ data: { hello: "world" } });
    expect(subgraph.connections()).toBe(2);
  }, 15_000);
});
