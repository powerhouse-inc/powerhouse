import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorReadClient,
  IReactorWriteClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import { gql } from "graphql-tag";
import { createClient } from "graphql-ws";
import type http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import { BaseSubgraph } from "../../src/graphql/base-subgraph.js";
import { ApolloGatewayAdapter } from "../../src/graphql/gateway/adapter-gateway-apollo.js";
import { ExpressHttpAdapter } from "../../src/graphql/gateway/adapter-http-express.js";
import { createAuthFetchMiddleware } from "../../src/graphql/gateway/auth-middleware.js";
import { GraphQLManager } from "../../src/graphql/graphql-manager.js";
import type { SubgraphClass } from "../../src/graphql/types.js";
import type { AuthService } from "../../src/services/auth.service.js";
import {
  AuthorizationPolicy,
  createAuthorizationService,
  type IAuthorizationService,
} from "../../src/services/authorization.service.js";
import type { ScalarRegistry } from "../../src/utils/scalar-types.js";
import {
  makeHarnessLogger,
  makeMockReactorClient,
} from "./graphql-manager-harness.js";

const WS_PATH = "/graphql/subscriptions";

/** The host's own query root, so the supergraph composes before packages load. */
export class HostPingSubgraph extends BaseSubgraph {
  override name = "host";
  override typeDefs = gql`
    type Query {
      hostPing: String
    }
  `;
  override resolvers = { Query: { hostPing: () => "pong" } };
}

export type GraphQLBody = {
  data?: unknown;
  errors?: { message: string; extensions?: { code?: string } }[];
};

export type CodeFirstHostOptions = {
  authorizationService?: IAuthorizationService;
  logger?: ILogger;
  scalars?: ScalarRegistry;
  core?: SubgraphClass[];
};

// The bearer token is the caller's address.
const bearerIsAddress = {
  authenticateRequest: (request: globalThis.Request) => {
    const token = request.headers.get("authorization")?.split(" ")[1];
    return Promise.resolve({
      user: token
        ? { address: token, chainId: 1, networkId: "eip155", appKey: "" }
        : undefined,
      admins: [],
      auth_enabled: true,
    });
  },
} as unknown as AuthService;

/**
 * A GraphQLManager served the way a Switchboard serves it: a real Express
 * server, the Apollo gateway, one WebSocket endpoint for subscriptions and
 * an SSE stream per subgraph. The reactor and its services are stubs.
 */
export async function startCodeFirstHost(options: CodeFirstHostOptions = {}) {
  const logger = options.logger ?? makeHarnessLogger();
  const httpAdapter = new ExpressHttpAdapter();
  const server = (await httpAdapter.listen(
    0,
    undefined,
    "127.0.0.1",
  )) as http.Server;
  const { port } = server.address() as { port: number };
  const origin = `http://127.0.0.1:${port}`;
  const manager = new GraphQLManager({
    path: "/",
    httpServer: server,
    wsServer: new WebSocketServer({ server, path: WS_PATH }),
    readClient: makeMockReactorClient() as unknown as IReactorReadClient,
    writeClient: {} as IReactorWriteClient,
    relationalDb: {} as IRelationalDb,
    analyticsStore: {} as IAnalyticsStore,
    syncManager: {} as ISyncManager,
    logger,
    httpAdapter,
    gatewayAdapter: new ApolloGatewayAdapter(logger),
    featureFlags: { enableDocumentModelSubgraphs: false },
    port,
    authorizationService:
      options.authorizationService ??
      createAuthorizationService({
        admins: [],
        defaultProtection: false,
        policy: AuthorizationPolicy.OPEN,
      }),
  });
  await manager.init(
    options.core ?? [HostPingSubgraph],
    createAuthFetchMiddleware(bearerIsAddress),
    undefined,
    options.scalars,
  );

  const sockets: { dispose(): Promise<void> | void }[] = [];
  const streams: AbortController[] = [];

  const headersFor = (caller?: string) => ({
    "content-type": "application/json",
    ...(caller ? { authorization: `Bearer ${caller}` } : {}),
  });

  return {
    manager,
    logger,
    origin,
    async post(
      path: string,
      query: string,
      variables?: Record<string, unknown>,
      caller?: string,
    ): Promise<GraphQLBody> {
      const response = await fetch(`${origin}${path}`, {
        method: "POST",
        headers: headersFor(caller),
        body: JSON.stringify({ query, variables }),
      });
      return (await response.json()) as GraphQLBody;
    },
    /** Registers `subgraphs` as one package's, then rebuilds the router. */
    async applyPackage(packageName: string, subgraphs: SubgraphClass[]) {
      await manager.applyPackageSubgraphs(
        new Map(subgraphs.length > 0 ? [[packageName, subgraphs]] : []),
      );
      await manager.updateRouter(true);
    },
    /** The first `count` results of a subscription over the WebSocket endpoint. */
    async overWebSocket(query: string, count: number): Promise<unknown[]> {
      const client = createClient({
        url: `ws://127.0.0.1:${port}${WS_PATH}`,
        webSocketImpl: WebSocket,
        retryAttempts: 0,
      });
      sockets.push(client);
      const results: unknown[] = [];
      for await (const result of client.iterate({ query })) {
        results.push(result);
        if (results.length === count) break;
      }
      return results;
    },
    /** The first `count` `next` events of a subscription over a subgraph's SSE stream. */
    async overSse(
      path: string,
      query: string,
      count: number,
    ): Promise<unknown[]> {
      const controller = new AbortController();
      streams.push(controller);
      const response = await fetch(`${origin}${path}/stream`, {
        method: "POST",
        headers: { ...headersFor(), accept: "text/event-stream" },
        body: JSON.stringify({ query }),
        signal: controller.signal,
      });
      const results: unknown[] = [];
      let text = "";
      const decoder = new TextDecoder();
      for await (const chunk of response.body!) {
        text += decoder.decode(chunk as Uint8Array, { stream: true });
        const events = text.split("\n\n");
        text = events.pop() ?? "";
        for (const event of events) {
          const data = /^data: (.*)$/m.exec(event)?.[1];
          if (event.startsWith("event: next") && data !== undefined) {
            results.push(JSON.parse(data));
          }
        }
        if (results.length >= count) break;
      }
      controller.abort();
      return results.slice(0, count);
    },
    async close() {
      for (const socket of sockets) await socket.dispose();
      for (const controller of streams) controller.abort();
      await manager.shutdown();
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

export type CodeFirstHost = Awaited<ReturnType<typeof startCodeFirstHost>>;
