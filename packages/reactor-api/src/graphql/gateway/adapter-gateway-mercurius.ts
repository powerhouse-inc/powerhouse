import type { MercuriusGatewayOptions } from "@mercuriusjs/gateway";
import mercuriusGateway from "@mercuriusjs/gateway";
import Fastify from "fastify";
import type {
  FastifyInstance,
  FastifyPluginCallback,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import mercurius from "mercurius";
import type { MercuriusOptions } from "mercurius";
import type { ILogger } from "document-model";
import type { GraphQLSchema } from "graphql";
import type http from "node:http";
import { AsyncLocalStorage } from "node:async_hooks";
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
 * Threads the original Fetch API Request through Mercurius's internal
 * fastify.inject() call so that contextFactory (which uses the auth WeakMap
 * from auth-middleware.ts) receives the same Request object that auth
 * middleware populated before calling the handler.
 */
const requestAls = new AsyncLocalStorage<Request>();

// @mercuriusjs/gateway exports a plain `(instance, opts) => void` rather than
// a typed FastifyPluginCallback — cast once here.
// The gateway plugin's accepted options are the intersection of the base
// MercuriusOptions and MercuriusGatewayOptions (mirroring the unexported
// MercuriusFederationOptions type in the package).
type GatewayPluginOptions = MercuriusOptions & MercuriusGatewayOptions;
const mercuriusGatewayPlugin =
  mercuriusGateway as unknown as FastifyPluginCallback<GatewayPluginOptions>;

export class MercuriusGatewayAdapter implements IGatewayAdapter<Context> {
  readonly #logger: ILogger;
  readonly #subgraphApps: FastifyInstance[] = [];

  #supergraphApp: FastifyInstance | null = null;
  #getSubgraphs: (() => SubgraphDefinition[]) | null = null;
  #supergraphContextFactory: GatewayContextFactory<Context> | null = null;

  constructor(logger: ILogger) {
    this.#logger = logger;
  }

  async start(_httpServer: http.Server): Promise<void> {
    // Mercurius instances are started lazily in createHandler /
    // createSupergraphHandler — nothing to do here.
  }

  async createHandler(
    schema: GraphQLSchema,
    contextFactory: GatewayContextFactory<Context>,
  ): Promise<FetchHandler> {
    const app = await buildMercuriusApp(schema, contextFactory, this.#logger);
    this.#subgraphApps.push(app);
    return buildFetchHandler(app);
  }

  async createSupergraphHandler(
    getSubgraphs: () => SubgraphDefinition[],
    _httpServer: http.Server,
    contextFactory: GatewayContextFactory<Context>,
  ): Promise<FetchHandler> {
    if (this.#supergraphApp) {
      throw new Error("Supergraph is already running");
    }
    this.#getSubgraphs = getSubgraphs;
    this.#supergraphContextFactory = contextFactory;
    this.#supergraphApp = await buildGatewayApp(
      getSubgraphs(),
      contextFactory,
      this.#logger,
    );

    // Capture `this` so the returned handler always delegates to the *current*
    // #supergraphApp, allowing updateSupergraph() to swap it atomically.
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const adapter = this;
    return (request: Request): Promise<Response> => {
      if (!adapter.#supergraphApp) {
        return Promise.resolve(
          new Response("Gateway not ready", { status: 503 }),
        );
      }
      return requestAls.run(request, () =>
        injectRequest(adapter.#supergraphApp!, request),
      );
    };
  }

  async updateSupergraph(): Promise<void> {
    if (!this.#getSubgraphs || !this.#supergraphContextFactory) return;
    const newApp = await buildGatewayApp(
      this.#getSubgraphs(),
      this.#supergraphContextFactory,
      this.#logger,
    );
    const oldApp = this.#supergraphApp;
    // Swap atomically — in-flight requests on the old app finish normally.
    this.#supergraphApp = newApp;
    if (oldApp) await oldApp.close();
  }

  attachWebSocket(
    wsServer: WebSocketServer,
    schema: GraphQLSchema,
    contextFactory: WsContextFactory<Context>,
  ): WsDisposer {
    // Use graphql-ws directly; Mercurius's own subscription transport is
    // Fastify-specific and not applicable here.
    return useServer(
      {
        schema,
        context: async (ctx: { connectionParams?: Record<string, unknown> }) =>
          contextFactory(ctx.connectionParams ?? {}),
      },
      wsServer,
    );
  }

  async stop(): Promise<void> {
    await Promise.all(this.#subgraphApps.map((app) => app.close()));
    this.#subgraphApps.length = 0;
    if (this.#supergraphApp) {
      await this.#supergraphApp.close();
      this.#supergraphApp = null;
    }
    this.#getSubgraphs = null;
    this.#supergraphContextFactory = null;
  }
}

// ── Fastify instance factories ────────────────────────────────────────────────

function makeContextFn(
  contextFactory: GatewayContextFactory<Context>,
  logger: ILogger,
) {
  return (_req: FastifyRequest, _reply: FastifyReply) => {
    const request = requestAls.getStore();
    if (!request) {
      logger.error("[mercurius] No Fetch Request in AsyncLocalStorage");
      throw new Error("No Fetch Request in AsyncLocalStorage");
    }
    return contextFactory(request);
  };
}

async function buildMercuriusApp(
  schema: GraphQLSchema,
  contextFactory: GatewayContextFactory<Context>,
  logger: ILogger,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(mercurius, {
    schema,
    graphiql: false,
    context: makeContextFn(contextFactory, logger),
    // Override _Service.sdl to rewrite "type Query/Mutation/Subscription {"
    // as "extend type …  {" so that @mercuriusjs/gateway v5 (which follows the
    // Federation v1 convention of using extensionTypeMap) correctly maps root
    // operation fields to this service during query planning.
    resolvers: {
      _Service: {
        sdl: (parent: { sdl?: string }) =>
          (parent.sdl ?? "").replace(
            /\btype\s+(Query|Mutation|Subscription)\s*\{/g,
            "extend type $1 {",
          ),
      },
    },
  } satisfies MercuriusOptions);

  await app.ready();
  return app;
}

/**
 * Builds a Mercurius federation gateway that composes the given subgraph
 * services. Each service URL must be reachable so that the gateway can fetch
 * its SDL via `_service { sdl }` (Apollo Federation protocol).
 */
async function buildGatewayApp(
  subgraphs: SubgraphDefinition[],
  contextFactory: GatewayContextFactory<Context>,
  logger: ILogger,
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });

  await app.register(mercuriusGatewayPlugin, {
    gateway: {
      services: subgraphs.map((s) => ({ name: s.name, url: s.url })),
    },
    graphiql: false,
    context: makeContextFn(contextFactory, logger),
  });

  await app.ready();
  return app;
}

// ── Fetch API bridge ──────────────────────────────────────────────────────────

function buildFetchHandler(app: FastifyInstance): FetchHandler {
  return (request: Request): Promise<Response> =>
    requestAls.run(request, () => injectRequest(app, request));
}

async function injectRequest(
  app: FastifyInstance,
  request: Request,
): Promise<Response> {
  const body =
    request.method !== "GET" && request.method !== "HEAD"
      ? await request.text()
      : undefined;

  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });

  const response = await app.inject({
    method: request.method as
      | "DELETE"
      | "GET"
      | "HEAD"
      | "OPTIONS"
      | "PATCH"
      | "POST"
      | "PUT",
    url: "/graphql",
    headers,
    payload: body,
  });

  const responseHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(response.headers)) {
    if (value !== undefined) responseHeaders[key] = String(value);
  }

  return new Response(response.payload, {
    status: response.statusCode,
    headers: responseHeaders,
  });
}
