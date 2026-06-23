import type {
  GetDataSourceFunction,
  GraphQLDataSourceProcessOptions,
  ServiceDefinition,
  SubgraphHealthCheckFunction,
  SupergraphSdlUpdateFunction,
} from "@apollo/gateway";
import {
  ApolloGateway,
  LocalCompose,
  RemoteGraphQLDataSource,
} from "@apollo/gateway";
import { ApolloServer, HeaderMap } from "@apollo/server";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginDrainHttpServer } from "@apollo/server/plugin/drainHttpServer";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { buildSubgraphSchema } from "@apollo/subgraph";
import type { ILogger } from "document-model";
import type { GraphQLSchema } from "graphql";
import type http from "node:http";
import type { WebSocketServer } from "ws";
import type { Context } from "../types.js";
import { useServer } from "../websocket.js";
import type {
  FetchHandler,
  GatewayContextFactory,
  IGatewayAdapter,
  SubgraphDefinition,
  WsContextFactory,
  WsDisposer,
} from "./types.js";

/**
 * Drop subgraphs whose typeDefs cannot be built into a valid subgraph schema in
 * isolation — e.g. a duplicate type definition within a single subgraph (Sentry
 * #917) — so one broken subgraph is excluded instead of failing the build for
 * everyone. Each excluded subgraph is logged; the rest are composed.
 *
 * Scope: this only catches per-subgraph build failures. Errors that surface only
 * when subgraphs are composed together (cross-subgraph type or `@key` conflicts)
 * are still thrown by `LocalCompose.initialize()` and are NOT handled here.
 */
export function filterComposableSubgraphs(
  serviceList: ServiceDefinition[],
  logger?: Pick<ILogger, "error">,
): ServiceDefinition[] {
  return serviceList.filter((service) => {
    try {
      buildSubgraphSchema({ typeDefs: service.typeDefs });
      return true;
    } catch (error) {
      logger?.error(
        `Excluding subgraph "${service.name}" from supergraph composition: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  });
}

// Forwards the incoming authorization header to federated subgraph requests.
class AuthenticatedDataSource extends RemoteGraphQLDataSource {
  willSendRequest(options: GraphQLDataSourceProcessOptions) {
    const { authorization } = options.context.headers as {
      authorization: string;
    };
    if (authorization && options?.request.http) {
      options.request.http.headers.set("authorization", authorization);
    }
  }
}

export class ApolloGatewayAdapter implements IGatewayAdapter<Context> {
  readonly #logger: ILogger;
  readonly #servers: ApolloServer<Context>[] = [];

  #supergraphServer: ApolloServer<Context> | null = null;
  #gatewayOptions: {
    update: SupergraphSdlUpdateFunction;
    healthCheck: SubgraphHealthCheckFunction;
    getDataSource: GetDataSourceFunction;
  } | null = null;
  #getSubgraphs: (() => SubgraphDefinition[]) | null = null;

  constructor(logger: ILogger) {
    this.#logger = logger;
  }

  async start(_httpServer: http.Server): Promise<void> {
    // Per-subgraph Apollo servers start lazily in createHandler.
    // Nothing to do here.
  }

  async createHandler(
    schema: GraphQLSchema,
    contextFactory: GatewayContextFactory<Context>,
  ): Promise<FetchHandler> {
    const server = new ApolloServer<Context>({
      schema,
      logger: this.#logger,
      introspection: true,
      // Each ApolloServer otherwise registers its own SIGINT/SIGTERM handler
      // that re-emits the signal via process.kill after server.stop() resolves.
      // With many subgraph servers that re-emit lands while the reactor's
      // graceful-shutdown chain is mid-flight, looking like a "second SIGINT"
      // to the reactor and aborting cleanup. The reactor drives our shutdown
      // end-to-end (see ReactorBuilder.attachSignalHandlers), so opt out.
      stopOnTerminationSignals: false,
      plugins: [
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginLandingPageLocalDefault(),
      ],
    });
    await server.start();
    this.#servers.push(server);
    return createApolloFetchHandler(server, contextFactory);
  }

  async createSupergraphHandler(
    getSubgraphs: () => SubgraphDefinition[],
    httpServer: http.Server,
    contextFactory: GatewayContextFactory<Context>,
  ): Promise<FetchHandler> {
    if (this.#supergraphServer) {
      throw new Error("Supergraph server is already running");
    }

    this.#getSubgraphs = getSubgraphs;

    const gateway = new ApolloGateway({
      supergraphSdl: async (options) => {
        this.#gatewayOptions = options;
        return await this.#buildSupergraphSdl();
      },
      buildService: (serviceConfig) =>
        new AuthenticatedDataSource(serviceConfig),
    });

    this.#supergraphServer = new ApolloServer<Context>({
      gateway,
      logger: this.#logger,
      introspection: true,
      stopOnTerminationSignals: false,
      plugins: [
        ApolloServerPluginDrainHttpServer({ httpServer }),
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginLandingPageLocalDefault(),
      ],
    });

    await this.#supergraphServer.start();
    return createApolloFetchHandler(this.#supergraphServer, contextFactory);
  }

  async updateSupergraph(): Promise<void> {
    if (!this.#gatewayOptions || !this.#getSubgraphs) {
      // Not yet initialized - no-op.
      return;
    }
    const { supergraphSdl } = await this.#buildSupergraphSdl();
    this.#gatewayOptions.update(supergraphSdl);
  }

  async #buildSupergraphSdl() {
    if (!this.#gatewayOptions || !this.#getSubgraphs) {
      throw new Error("Gateway is not ready");
    }
    const serviceList: ServiceDefinition[] = this.#getSubgraphs().map((s) => ({
      name: s.name,
      typeDefs: s.typeDefs,
      url: s.url,
    }));
    const composableServiceList = filterComposableSubgraphs(
      serviceList,
      this.#logger,
    );
    const localCompose = new LocalCompose({
      localServiceList: composableServiceList,
    });
    return localCompose.initialize(this.#gatewayOptions);
  }

  attachWebSocket(
    wsServer: WebSocketServer,
    schema: GraphQLSchema,
    contextFactory: WsContextFactory<Context>,
  ): WsDisposer {
    return useServer(
      {
        schema,
        context: async (ctx: {
          connectionParams?: Record<string, unknown>;
        }) => {
          const connectionParams = (ctx.connectionParams ?? {}) as Record<
            string,
            unknown
          >;
          return contextFactory(connectionParams);
        },
      },
      wsServer,
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.#servers.map((s) => s.stop()));
    this.#servers.length = 0;

    if (this.#supergraphServer) {
      await this.#supergraphServer.stop();
      this.#supergraphServer = null;
    }
    this.#gatewayOptions = null;
    this.#getSubgraphs = null;
  }
}

/**
 * Wrap an existing ApolloServer as a Fetch API handler.
 * Does not manage server lifecycle; caller is responsible for start/stop.
 */
export function createApolloFetchHandler(
  server: ApolloServer<Context>,
  contextFactory: GatewayContextFactory<Context>,
): FetchHandler {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    const headers = new HeaderMap();
    request.headers.forEach((value, key) => headers.set(key, value));

    let body: unknown = undefined;
    if (request.method !== "GET" && request.method !== "HEAD") {
      try {
        body = (await request.json()) as unknown;
      } catch {
        // body may be empty for some requests
      }
    }

    const result = await server.executeHTTPGraphQLRequest({
      httpGraphQLRequest: {
        method: request.method.toUpperCase(),
        headers,
        search: url.search,
        body,
      },
      context: () => contextFactory(request),
    });

    const responseHeaders = new Headers();
    for (const [key, value] of result.headers) {
      responseHeaders.set(key, value);
    }

    let responseBody: string;
    if (result.body.kind === "complete") {
      responseBody = result.body.string;
    } else {
      const chunks: string[] = [];
      for await (const chunk of result.body.asyncIterator) {
        chunks.push(chunk);
      }
      responseBody = chunks.join("");
    }

    return new Response(responseBody, {
      status: result.status ?? 200,
      headers: responseHeaders,
    });
  };
}
