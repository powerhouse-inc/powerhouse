import { ApolloServer } from "@apollo/server";
import { ApolloServerPluginInlineTraceDisabled } from "@apollo/server/plugin/disabled";
import { ApolloServerPluginLandingPageLocalDefault } from "@apollo/server/plugin/landingPage/default";
import { mergeResolvers, mergeTypeDefs } from "@graphql-tools/merge";
import { makeExecutableSchema } from "@graphql-tools/schema";
import type { IResolvers } from "@graphql-tools/utils";
import {
  buildASTSchema,
  type DefinitionNode,
  type DocumentNode,
  isTypeDefinitionNode,
  isTypeExtensionNode,
  Kind,
  parse,
  print,
  type GraphQLNamedType,
  type GraphQLSchema,
  type TypeDefinitionNode,
  validateSchema,
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
  WsDisposer,
  WsHandlers,
} from "./types.js";

/**
 * How to resolve two subgraphs that define the same field with incompatible
 * types (a name clash, the #1565 scenario).
 *
 * - `"last"` (default): the later-registered subgraph's field definition wins.
 * - `"first"`: the earlier-registered subgraph's field definition wins.
 *
 * Every conflict is logged either way; unlike federation composition, the
 * supergraph is still built. The policy applies to field type clashes only:
 * a type-KIND clash (the same type name declared as an object by one subgraph
 * and as an enum/input/interface/union by another) is resolved by
 * `mergeTypeDefs` itself, which always keeps the last declaration. Those are
 * detected separately and reported through the same channel so they are
 * logged rather than dropped in silence.
 */
export type StitchConflictPolicy = "first" | "last";

export type StitchingGatewayOptions = {
  onFieldTypeConflict?: StitchConflictPolicy;
};

/** Root operation types, which a subgraph may extend without defining. */
const ROOT_TYPE_NAMES = ["Query", "Mutation", "Subscription"];

/**
 * A placeholder declaration for a type name a subgraph borrows from another
 * subgraph. Same kind as the real declaration, so the borrowing subgraph's
 * SDL validates the same way it does in the merged supergraph:
 *
 * - scalar/enum/input/object: a minimal declaration of that kind.
 * - interface: the real declaration, because a subgraph that implements the
 *   interface has to satisfy its field set.
 * - union: a self-contained union over one placeholder member, so nothing the
 *   real declaration references has to be resolvable here.
 */
function stubDeclaration(
  name: string,
  owner: TypeDefinitionNode | undefined,
): string {
  switch (owner?.kind) {
    case Kind.SCALAR_TYPE_DEFINITION:
      return `scalar ${name}`;
    case Kind.ENUM_TYPE_DEFINITION:
      return `enum ${name} { _STUB }`;
    case Kind.INPUT_OBJECT_TYPE_DEFINITION:
      return `input ${name} { _stub: Boolean }`;
    case Kind.INTERFACE_TYPE_DEFINITION:
      return print(owner);
    case Kind.UNION_TYPE_DEFINITION:
      return `type ${name}_Stub { _stub: Boolean } union ${name} = ${name}_Stub`;
    default:
      return `type ${name} { _stub: Boolean }`;
  }
}

/**
 * Drops subgraphs whose own typeDefs cannot be built into a valid schema, so
 * one malformed subgraph is excluded instead of failing the whole supergraph
 * build (which, since GraphQLManager.init() does not guard the supergraph
 * gateway, would be a boot failure). Each excluded subgraph is logged; the
 * rest are merged. This is the stitching counterpart of the federation path's
 * `filterComposableSubgraphs`.
 *
 * A stitching subgraph is not self-contained the way a federation subgraph is:
 * it may extend a root type it never defines (`analytics` only does
 * `extend type Query`) and reference types another subgraph owns (in raw form
 * `analytics` uses `DateTime`, declared by `auth`/`reactor`/`packages`).
 * Building it alone would therefore reject perfectly good subgraphs. So the isolation build adds
 * a placeholder declaration for every type name declared by some *other*
 * subgraph in the set, plus the root types, plus every directive definition in
 * the set. What is left to fail is the subgraph's own SDL: a dangling type
 * reference no subgraph declares, a duplicated field, an invalid implements
 * clause.
 *
 * Scope: like the federation filter, this only catches per-subgraph failures.
 * Errors that appear only once subgraphs are merged (a field type or type kind
 * clash) are reported by `mergeSubgraphTypeDefs`, not here.
 */
export function filterBuildableSubgraphs(
  subgraphs: SubgraphDefinition[],
  logger?: Pick<ILogger, "error">,
): SubgraphDefinition[] {
  // First declaration of each type name across the whole set, for stub kinds.
  const owners = new Map<string, TypeDefinitionNode>();
  const directiveDefs = new Map<string, DefinitionNode>();
  for (const subgraph of subgraphs) {
    for (const def of subgraph.typeDefs.definitions) {
      if (isTypeDefinitionNode(def) && !owners.has(def.name.value)) {
        owners.set(def.name.value, def);
      } else if (
        def.kind === Kind.DIRECTIVE_DEFINITION &&
        !directiveDefs.has(def.name.value)
      ) {
        directiveDefs.set(def.name.value, def);
      }
    }
  }

  return subgraphs.filter((subgraph) => {
    const own = new Set<string>();
    const ownDirectives = new Set<string>();
    for (const def of subgraph.typeDefs.definitions) {
      if (isTypeDefinitionNode(def)) {
        own.add(def.name.value);
      } else if (def.kind === Kind.DIRECTIVE_DEFINITION) {
        ownDirectives.add(def.name.value);
      }
    }

    const stubs: string[] = [];
    for (const name of new Set([...owners.keys(), ...ROOT_TYPE_NAMES])) {
      if (!own.has(name)) {
        stubs.push(stubDeclaration(name, owners.get(name)));
      }
    }
    for (const [name, def] of directiveDefs) {
      if (!ownDirectives.has(name)) {
        stubs.push(print(def));
      }
    }

    try {
      // Merge the same way the supergraph does, so a subgraph that declares a
      // type twice within itself is normalized here too, then build and
      // validate: buildASTSchema asserts the SDL, validateSchema the result.
      const documents =
        stubs.length > 0
          ? [subgraph.typeDefs, parse(stubs.join("\n"))]
          : [subgraph.typeDefs];
      const merged = mergeTypeDefs(documents, { useSchemaDefinition: false });
      const errors = validateSchema(buildASTSchema(merged));
      if (errors.length > 0) {
        throw new Error(errors.map((error) => error.message).join("; "));
      }
      return true;
    } catch (error) {
      logger?.error(
        `Stitching gateway: excluding subgraph "${subgraph.name}" from the supergraph: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  });
}

/**
 * The SDL keyword for a type definition or extension node, or undefined for a
 * node that does not declare a named type (schema definitions, directive
 * definitions, executable definitions). Extensions map to the same keyword as
 * their definition: `extend type Query` and `type Query` are the same kind.
 */
function typeKeyword(def: DefinitionNode): string | undefined {
  switch (def.kind) {
    case Kind.OBJECT_TYPE_DEFINITION:
    case Kind.OBJECT_TYPE_EXTENSION:
      return "type";
    case Kind.INTERFACE_TYPE_DEFINITION:
    case Kind.INTERFACE_TYPE_EXTENSION:
      return "interface";
    case Kind.UNION_TYPE_DEFINITION:
    case Kind.UNION_TYPE_EXTENSION:
      return "union";
    case Kind.ENUM_TYPE_DEFINITION:
    case Kind.ENUM_TYPE_EXTENSION:
      return "enum";
    case Kind.INPUT_OBJECT_TYPE_DEFINITION:
    case Kind.INPUT_OBJECT_TYPE_EXTENSION:
      return "input";
    case Kind.SCALAR_TYPE_DEFINITION:
    case Kind.SCALAR_TYPE_EXTENSION:
      return "scalar";
    default:
      return undefined;
  }
}

/**
 * Finds type names that two subgraphs declare with different kinds (object vs
 * enum, input, interface or union). `mergeTypeDefs` does not call
 * `onFieldTypeConflict` for these - it keeps the last declaration and drops
 * the other subgraph's type entirely, with no diagnostic - so they are
 * scanned for before the merge and reported alongside field conflicts.
 */
function scanTypeKindClashes(subgraphs: SubgraphDefinition[]): string[] {
  const clashes: string[] = [];
  const declaredBy = new Map<string, { keyword: string; subgraph: string }>();
  for (const subgraph of subgraphs) {
    for (const def of subgraph.typeDefs.definitions) {
      if (!isTypeDefinitionNode(def) && !isTypeExtensionNode(def)) {
        continue;
      }
      const keyword = typeKeyword(def);
      if (keyword === undefined) {
        continue;
      }
      const name = def.name.value;
      const previous = declaredBy.get(name);
      if (previous === undefined) {
        declaredBy.set(name, { keyword, subgraph: subgraph.name });
        continue;
      }
      if (previous.keyword === keyword) {
        continue;
      }
      clashes.push(
        `type kind clash on ${name}: declared as ${previous.keyword} by ` +
          `subgraph "${previous.subgraph}" and as ${keyword} by subgraph ` +
          `"${subgraph.name}"; mergeTypeDefs keeps the last declaration ` +
          `(${keyword}) and drops the other, whatever the conflict policy`,
      );
      // Track what the merge actually keeps, so a third declaration is
      // compared against the surviving kind.
      declaredBy.set(name, { keyword, subgraph: subgraph.name });
    }
  }
  return clashes;
}

/**
 * Merges all subgraph type definitions into one schema, applying the field
 * conflict policy. Exported so tests and the benchmark can exercise the merge
 * without a full adapter.
 */
export function mergeSubgraphTypeDefs(
  subgraphs: SubgraphDefinition[],
  policy: StitchConflictPolicy,
): { typeDefs: DocumentNode; conflicts: string[] } {
  const conflicts: string[] = scanTypeKindClashes(subgraphs);
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
          `field type clash on ${type.name.value}.${existing.name.value}: kept ` +
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
 * Merges the subgraph resolver maps in the order the conflict policy implies.
 * `mergeResolvers` is unconditionally last-wins, so under `"first"` the array
 * is reversed: the first-registered subgraph's resolver ends up applied last
 * and wins, matching the field type the merged schema advertises. Without
 * this the schema would advertise one subgraph's type while another
 * subgraph's resolver ran.
 */
function mergeSubgraphResolvers(
  subgraphs: SubgraphDefinition[],
  policy: StitchConflictPolicy,
): IResolvers {
  const ordered = policy === "first" ? [...subgraphs].reverse() : subgraphs;
  return mergeResolvers(
    ordered.map((s) => s.resolvers as IResolvers | undefined),
  );
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
  logger?: Pick<ILogger, "debug">,
): Record<string, unknown> {
  const filtered: Record<string, unknown> = {};
  for (const [typeName, entry] of Object.entries(resolvers)) {
    const type = typeMap[typeName];
    if (type === undefined) {
      // Type not part of the merged schema.
      logger?.debug(
        `Stitching gateway: dropped resolvers for type "${typeName}": the merged schema has no such type`,
      );
      continue;
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
      // Not a resolver map: nothing to keep.
      logger?.debug(
        `Stitching gateway: dropped resolver entry for type "${typeName}": expected a field map, got ${entry === null ? "null" : typeof entry}`,
      );
      continue;
    }
    const map = entry as { [key: string]: unknown };
    const kept: Record<string, unknown> = {};
    const dropped: string[] = [];
    for (const [key, value] of Object.entries(map)) {
      if (key === "__resolveReference" || fields[key] !== undefined) {
        kept[key] = value;
      } else {
        dropped.push(key);
      }
    }
    if (dropped.length > 0) {
      logger?.debug(
        `Stitching gateway: dropped resolvers ${dropped
          .map((field) => `${typeName}.${field}`)
          .join(", ")}: the merged schema declares no such field(s)`,
      );
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
  logger?: Pick<ILogger, "debug">,
): GraphQLSchema {
  // A type-only build to get the merged type map; assumeValid skips SDL
  // validation, which makeExecutableSchema performs on the real build.
  const typeMap = buildASTSchema(typeDefs, { assumeValid: true }).getTypeMap();
  // The filter works on the raw resolver shape; the result is a valid
  // IResolvers because it only removes entries from one.
  const filtered = filterResolversToSchema(
    typeMap,
    resolvers as Record<string, unknown>,
    logger,
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
  const resolvers = mergeSubgraphResolvers(subgraphs, policy);
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
    handlers: WsHandlers<Context>,
  ): WsDisposer {
    return useServer(
      {
        schema,
        onConnect: (ctx) =>
          handlers.onConnect(ctx.connectionParams ?? {}, ctx.extra as object),
        context: (ctx) =>
          handlers.context(ctx.connectionParams ?? {}, ctx.extra as object),
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
    // Same as the Apollo adapter: clearing these makes a later
    // updateSupergraph() a no-op instead of resurrecting a stopped adapter.
    this.#getSubgraphs = null;
    this.#contextFactory = null;

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
    all: SubgraphDefinition[],
  ): Promise<ApolloServer<Context>> {
    let subgraphs = filterBuildableSubgraphs(all, this.#logger);
    if (subgraphs.length === 0 && all.length > 0) {
      // Excluding every subgraph would trade one subgraph's error for a
      // supergraph with no root type at all; keep the original set so the
      // build fails with the underlying error instead.
      this.#logger.error(
        "Stitching gateway: every subgraph failed its isolation build; merging the unfiltered set so the underlying error surfaces",
      );
      subgraphs = all;
    }
    const { typeDefs, conflicts } = mergeSubgraphTypeDefs(
      subgraphs,
      this.#policy,
    );
    for (const conflict of conflicts) {
      this.#logger.warn(
        `Stitching gateway (policy "${this.#policy}"): ${conflict}`,
      );
    }
    if (conflicts.length > 0) {
      this.#logger.warn(
        `Stitching gateway: merged ${subgraphs.length} subgraphs with ${conflicts.length} schema conflict(s); each resolution is logged above`,
      );
    } else {
      this.#logger.debug(
        `Stitching gateway: merged ${subgraphs.length} subgraphs without conflicts`,
      );
    }
    const resolvers = mergeSubgraphResolvers(subgraphs, this.#policy);
    const schema = buildMergedSchema(typeDefs, resolvers, this.#logger);
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
