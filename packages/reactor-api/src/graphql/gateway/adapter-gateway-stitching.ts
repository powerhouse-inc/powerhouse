import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { mergeResolvers, mergeTypeDefs } from "@graphql-tools/merge";
import { makeExecutableSchema } from "@graphql-tools/schema";
import type { IResolvers } from "@graphql-tools/utils";
import {
  buildASTSchema,
  type DocumentNode,
  print,
  type GraphQLNamedType,
  type GraphQLSchema,
} from "graphql";
import type http from "node:http";
import type { WebSocketServer } from "ws";
import type { ILogger } from "document-model";
import type { Context } from "../types.js";
import { useServer } from "../websocket.js";
import { createApolloFetchHandler } from "./adapter-gateway-apollo.js";
import type {
  FetchHandler,
  GatewayContextFactory,
  IGatewayAdapter,
  SubgraphDefinition,
  WsContextFactory,
  WsDisposer,
} from "./types.js";

/**
 * How to resolve two subgraphs that define the same field with incompatible
 * types (a name clash, the #1565 scenario).
 *
 * - `"last"` (default): the later-registered subgraph's field definition wins.
 * - `"first"`: the earlier-registered subgraph's field definition wins.
 *
 * Every conflict is logged either way; unlike federation composition, the
 * supergraph is still built.
 */
export type StitchConflictPolicy = "first" | "last";

export type StitchingGatewayOptions = {
  onFieldTypeConflict?: StitchConflictPolicy;
};

/**
 * Merges all subgraph type definitions into one schema, applying the field
 * conflict policy. Exported so tests and the benchmark can exercise the merge
 * without a full adapter.
 */
export function mergeSubgraphTypeDefs(
  subgraphs: SubgraphDefinition[],
  policy: StitchConflictPolicy,
): { typeDefs: DocumentNode; conflicts: string[] } {
  const conflicts: string[] = [];
  const typeDefs = mergeTypeDefs(
    subgraphs.map((s) => s.typeDefs),
    {
      // Never emit a `schema { ... }` block: the merged root types are
      // determined by whichever subgraphs define Query/Mutation/Subscription.
      useSchemaDefinition: false,
      onFieldTypeConflict: (existing, other, type) => {
        // Identical definitions are normal stitching (shared types across
        // subgraphs); only differing definitions are conflicts.
        if (print(existing) === print(other)) {
          return existing;
        }
        const winner = policy === "first" ? existing : other;
        const loser = policy === "first" ? other : existing;
        conflicts.push(
          `${type.name.value}.${existing.name.value}: kept ` +
            `${print(winner.type)} (${
              policy === "first" ? "first" : "last"
            } subgraph), dropped ${print(loser.type)}`,
        );
        return winner;
      },
    },
  );
  return { typeDefs, conflicts };
}

/**
 * Drops resolver entries that have no matching type or field in the merged
 * schema. Document-model subgraphs generate resolver entries for operations
 * their SDL does not declare (the federation runtime silently ignores those);
 * makeExecutableSchema rejects them, so they are filtered before the build.
 */
function filterResolversToSchema(
  typeMap: Record<string, GraphQLNamedType | undefined>,
  resolvers: Record<string, unknown>,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [typeName, entry] of Object.entries(resolvers)) {
    const type = typeMap[typeName];
    if (type === undefined) {
      continue; // Type not part of the merged schema.
    }
    const fields =
      type instanceof Object && "getFields" in type
        ? (type as { getFields(): Record<string, unknown> }).getFields()
        : undefined;
    if (fields === undefined) {
      // Scalar, enum, or union resolver: keep as-is.
      filtered[typeName] = entry;
      continue;
    }
    if (entry === null || typeof entry !== "object") {
      continue; // Not a resolver map: nothing to keep.
    }
    const map = entry as { [key: string]: unknown };
    const kept: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(map)) {
      if (key === "__resolveReference" || fields[key] !== undefined) {
        kept[key] = value;
      }
    }
    if (Object.keys(kept).length > 0) {
      filtered[typeName] = kept;
    }
  }
  return filtered;
}

/**
 * Builds the executable supergraph schema from merged type definitions and
 * resolvers (shared by the adapter and the pure merge helper).
 */
function buildMergedSchema(
  typeDefs: DocumentNode,
  resolvers: IResolvers,
): GraphQLSchema {
  // A type-only build to get the merged type map; assumeValid skips SDL
  // validation, which makeExecutableSchema performs on the real build.
  const typeMap = buildASTSchema(typeDefs, { assumeValid: true }).getTypeMap();
  // The filter works on the raw resolver shape; the result is a valid
  // IResolvers because it only removes entries from one.
  const filtered = filterResolversToSchema(
    typeMap,
    resolvers as Record<string, unknown>,
  );
  return makeExecutableSchema({ typeDefs, resolvers: filtered as IResolvers });
}

/**
 * Merges multiple subgraphs into a single in-process executable schema.
 * This is the "Guild" (graphql-tools) composition path: instead of federation
 * (which hard-fails on cross-subgraph type conflicts and executes subgraph
 * fields over loopback HTTP), the type definitions are merged with an
 * explicit conflict policy and the resolvers run in-process.
 */
export function mergeSubgraphSchemas(
  subgraphs: SubgraphDefinition[],
  policy: StitchConflictPolicy,
): GraphQLSchema {
  if (subgraphs.length === 0) {
    throw new Error("Cannot merge zero subgraphs");
  }
  const { typeDefs } = mergeSubgraphTypeDefs(subgraphs, policy);
  const resolvers = mergeResolvers(
    subgraphs.map((s) => s.resolvers as IResolvers | undefined),
  );
  return buildMergedSchema(typeDefs, resolvers);
}

/**
 * A stitching gateway adapter: the supergraph is one merged schema executed
 * in-process. Subgraph routes (`/graphql/<name>`) are served exactly like the
 * Apollo adapter, so direct subgraph access is unchanged.
 *
 * Note: unlike the Apollo adapter, the supergraph ApolloServer is NOT given
 * ApolloServerPluginDrainHttpServer. The plugin closes the (shared) HTTP
 * server on stop, which would kill every mounted subgraph route when
 * updateSupergraph() swaps the supergraph server. The shared server is drained
 * explicitly in stop() instead.
 */
export class StitchingGatewayAdapter implements IGatewayAdapter<Context> {
  readonly #logger: ILogger;
  readonly #policy: StitchConflictPolicy;

  readonly #servers: ApolloServer<Context>[] = [];
  #supergraphServer: ApolloServer<Context> | null = null;
  #handler: FetchHandler | null = null;
  #httpServer: http.Server | null = null;
  #getSubgraphs: (() => SubgraphDefinition[]) | null = null;
  #contextFactory: GatewayContextFactory<Context> | null = null;

  constructor(logger: ILogger, options: StitchingGatewayOptions = {}) {
    this.#logger = logger;
    this.#policy = options.onFieldTypeConflict ?? "last";
  }

  async start(_httpServer: http.Server): Promise<void> {
    // Per-subgraph Apollo servers start lazily in createHandler.
    // Nothing to do here.
  }

  async createHandler(
    schema: GraphQLSchema,
    contextFactory: GatewayContextFactory<Context>,
  ): Promise<FetchHandler> {
    const server = await this.#makeServer(schema);
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
    this.#httpServer = httpServer;
    this.#contextFactory = contextFactory;

    const server = await this.#buildSupergraphServer(getSubgraphs());
    return this.#installSupergraphServer(server);
  }

  async updateSupergraph(): Promise<void> {
    if (!this.#getSubgraphs || !this.#contextFactory) {
      // Not yet initialized - no-op.
      return;
    }
    const server = await this.#buildSupergraphServer(this.#getSubgraphs());
    const old = this.#supergraphServer;
    this.#installSupergraphServer(server);
    // The handler swap above is atomic: new requests use the new server,
    // in-flight requests on the old one finish normally.
    if (old) {
      await old.stop();
    }
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
          const connectionParams = (ctx.connectionParams ?? {}) as {
            [key: string]: unknown;
          };
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
    this.#handler = null;

    // Drain the shared HTTP server ourselves (the Apollo adapter gets this
    // from ApolloServerPluginDrainHttpServer, which we cannot use here - see
    // class comment). Only close a server that is still accepting connections
    // so a later close by the owner is a no-op instead of an error.
    const httpServer = this.#httpServer;
    this.#httpServer = null;
    if (httpServer?.listening) {
      await new Promise<void>((resolve) => httpServer.close(() => resolve()));
    }
  }

  // ── internals ──────────────────────────────────────────────────────────────

  async #makeServer(schema: GraphQLSchema): Promise<ApolloServer<Context>> {
    const server = new ApolloServer<Context>({
      schema,
      logger: this.#logger,
      introspection: true,
      // Same rationale as the Apollo adapter: the reactor drives shutdown
      // end-to-end; per-subgraph servers must not re-emit SIGINT.
      stopOnTerminationSignals: false,
      plugins: [
        ApolloServerPluginInlineTraceDisabled(),
        ApolloServerPluginLandingPageLocalDefault(),
      ],
    });
    await server.start();
    return server;
  }

  async #buildSupergraphServer(
    subgraphs: SubgraphDefinition[],
  ): Promise<ApolloServer<Context>> {
    const { typeDefs, conflicts } = mergeSubgraphTypeDefs(
      subgraphs,
      this.#policy,
    );
    for (const conflict of conflicts) {
      this.#logger.warn(
        `Stitching gateway: field type clash resolved per policy "${this.#policy}": ${conflict}`,
      );
    }
    if (conflicts.length > 0) {
      this.#logger.warn(
        `Stitching gateway: merged ${subgraphs.length} subgraphs with ${conflicts.length} field type conflict(s); supergraph schema includes the ${this.#policy}-registered definition for each`,
      );
    } else {
      this.#logger.debug(
        `Stitching gateway: merged ${subgraphs.length} subgraphs without conflicts`,
      );
    }
    const resolvers = mergeResolvers(
      subgraphs.map((s) => s.resolvers as IResolvers | undefined),
    );
    const schema = buildMergedSchema(typeDefs, resolvers);
    return this.#makeServer(schema);
  }

  #installSupergraphServer(server: ApolloServer<Context>): FetchHandler {
    if (this.#contextFactory === null) {
      throw new Error("Supergraph context factory not set");
    }
    this.#supergraphServer = server;
    const handler = createApolloFetchHandler(server, this.#contextFactory);
    this.#handler = handler;
    // The returned handler always delegates to the *current* server so
    // updateSupergraph() swaps are picked up without re-mounting the route.
    return (request: Request) => this.#handler!(request);
  }
}
