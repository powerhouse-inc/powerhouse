import { ApolloServer, HeaderMap } from "@apollo/server";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import type { ILogger } from "document-drive";
import type { GraphQLSchema } from "graphql";
import type http from "node:http";
import type { WebSocketServer } from "ws";
import type { Context } from "../types.js";
import { useServer } from "../websocket.js";
import type {
  FetchHandler,
  GatewayContextFactory,
  IGatewayAdapter,
  WsContextFactory,
  WsDisposer,
} from "./types.js";

export class ApolloGatewayAdapter implements IGatewayAdapter<Context> {
  readonly #logger: ILogger;
  readonly #servers: ApolloServer<Context>[] = [];

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
      plugins: [
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginLandingPageLocalDefault(),
      ],
    });
    await server.start();
    this.#servers.push(server);
    return createApolloFetchHandler(server, contextFactory);
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
