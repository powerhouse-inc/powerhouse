import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type { ILogger } from "document-model";
import type http from "node:http";
import { vi } from "vitest";
import type { WebSocketServer } from "ws";
import { ApolloGatewayAdapter } from "../../src/graphql/gateway/adapter-gateway-apollo.js";
import { ExpressHttpAdapter } from "../../src/graphql/gateway/adapter-http-express.js";
import { createAuthFetchMiddleware } from "../../src/graphql/gateway/auth-middleware.js";
import type { DriveStore } from "../../src/graphql/gateway/drive-ownership-cache.js";
import { GraphQLManager } from "../../src/graphql/graphql-manager.js";
import { ReactorSubgraph } from "../../src/graphql/reactor/subgraph.js";
import type { AuthService } from "../../src/services/auth.service.js";
import type { IAuthorizationService } from "../../src/services/authorization.service.js";

const silentLogger: ILogger = {
  level: "error" as const,
  verbose: vi.fn(),
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  errorHandler: vi.fn(),
  child: () => silentLogger,
};

// The bearer is the caller's address.
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

export type ReactorHttpServer = {
  /** The reactor subgraph's endpoint, as a GraphQL client is given it. */
  readonly url: string;
  readonly manager: GraphQLManager;
  close(): Promise<void>;
};

/**
 * The reactor subgraph served the way a Switchboard serves it: a real HTTP
 * adapter, the Apollo gateway, and the auth and drive middleware in front.
 */
export async function startReactorHttpServer(
  reactorClient: IReactorClient,
  authorizationService: IAuthorizationService,
  driveStore?: DriveStore,
): Promise<ReactorHttpServer> {
  const httpAdapter = new ExpressHttpAdapter();
  const server = (await httpAdapter.listen(
    0,
    undefined,
    "127.0.0.1",
  )) as http.Server;
  const { port } = server.address() as { port: number };
  const gatewayAdapter = new ApolloGatewayAdapter(silentLogger);
  const manager = new GraphQLManager({
    path: "/",
    httpServer: server,
    wsServer: {
      close: vi.fn((cb?: () => void) => cb?.()),
      setMaxListeners: vi.fn(),
      on: vi.fn(),
      off: vi.fn(),
    } as unknown as WebSocketServer,
    reactorClient,
    relationalDb: {} as IRelationalDb,
    analyticsStore: {} as IAnalyticsStore,
    syncManager: {} as ISyncManager,
    logger: silentLogger,
    httpAdapter,
    gatewayAdapter,
    featureFlags: { enableDocumentModelSubgraphs: false },
    port,
    authorizationService,
    driveStore,
  });
  await manager.init(
    [ReactorSubgraph],
    createAuthFetchMiddleware(bearerIsAddress),
    undefined,
  );
  return {
    url: `http://127.0.0.1:${port}/graphql/r`,
    manager,
    close: async () => {
      await gatewayAdapter.stop();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}
