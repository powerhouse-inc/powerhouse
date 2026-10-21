import {
  type DefinitionNode,
  type DirectiveNode,
  type DocumentNode,
  type ExecutionArgs,
  type GraphQLSchema,
  type ObjectValueNode,
  isTypeDefinitionNode,
  Kind,
  parse,
  visit,
} from "graphql";
import type { Request as SSERequest } from "graphql-sse";
import { createHandler } from "graphql-sse/lib/use/fetch";
import { mergeSubgraphSchemas } from "./gateway/adapter-gateway-stitching.js";
import type { SubgraphDefinition } from "./gateway/types.js";
import type { Context } from "./types.js";

/**
 * Options for creating the GraphQL-over-SSE handler.
 */
export interface SSEHandlerOptions {
  schema: GraphQLSchema;
  /**
   * Build a GraphQL context from the incoming Fetch API Request.
   * Called once per subscription (not per event).
   *
   * The request has already passed through auth middleware by the time
   * this is invoked, so getAuthContext(request) will return the populated
   * AuthContext from the WeakMap.
   */
  contextFactory: (req: Request) => Promise<Context> | Context;
  /** Tracks the handler's open streams so they can be completed. */
  streams?: SSEStreams;
  /** Tags an operation's stream, so `streams.end(tag)` can complete it. */
  tagsOf?: (args: ExecutionArgs) => ReadonlySet<string>;
}

/** Open SSE operations; `end()` completes them, and any that start later. */
export class SSEStreams {
  readonly #running = new Map<AsyncGenerator<unknown>, ReadonlySet<string>>();
  readonly #retired = new Set<string>();
  #ended = false;

  track<T>(
    result: AsyncGenerator<T>,
    tags: ReadonlySet<string> = new Set(),
  ): AsyncGenerator<T> {
    const running = this.#running;
    const done = () => running.delete(tracked);
    const tracked: AsyncGenerator<T> = {
      [Symbol.asyncIterator]: () => tracked,
      next: async (...args) => {
        const step = await result.next(...args);
        if (step.done) done();
        return step;
      },
      return: (value) => {
        done();
        return result.return(value);
      },
      throw: (error) => {
        done();
        return result.throw(error);
      },
      [Symbol.asyncDispose]: async () => {
        done();
        await result.return(undefined);
      },
    };
    running.set(tracked, tags);
    if (this.#ended || [...tags].some((tag) => this.#retired.has(tag))) {
      void this.#end([tracked]);
    }
    return tracked;
  }

  /**
   * Complete every stream, or those tagged `tag`, and any that start later
   * until `reopen()`. graphql-sse sends `complete` and closes each stream.
   */
  async end(tag?: string): Promise<void> {
    if (tag === undefined) this.#ended = true;
    else this.#retired.add(tag);
    const results = [...this.#running]
      .filter(([, tags]) => tag === undefined || tags.has(tag))
      .map(([result]) => result);
    await this.#end(results);
  }

  /** Stop completing new streams for retired tags: the handler was rebuilt. */
  reopen(): void {
    this.#retired.clear();
  }

  async #end(results: AsyncGenerator<unknown>[]): Promise<void> {
    await Promise.allSettled(results.map((result) => result.return(undefined)));
  }
}

/**
 * Create a Fetch-API-compatible SSE handler for GraphQL subscriptions
 * using the graphql-sse library (graphql-sse protocol).
 *
 * This runs alongside the existing WebSocket (graphql-ws) transport
 * so clients can choose either protocol.
 *
 * The returned handler is a standard FetchHandler: (req: Request) => Promise<Response>.
 * It can be mounted via httpAdapter.mount() like any other handler, and auth
 * flows through the WeakMap pattern (authFetchMiddleware populates the context
 * before this handler is called).
 *
 * Clients connect via "distinct connections mode" (POST with
 * `Accept: text/event-stream`). Single-connection mode is disabled
 * because it adds token-management complexity with no benefit here.
 */
export function createGraphQLSSEHandler(
  options: SSEHandlerOptions,
): (req: Request) => Promise<Response> {
  const { schema, contextFactory, streams, tagsOf } = options;

  return createHandler<Context>({
    schema,
    // Returning null disables single-connection mode. All clients use
    // "distinct connections mode" (one POST per subscription).
    // Auth is handled upstream by authFetchMiddleware.
    authenticate: () => null,
    context: (req: SSERequest<Request>) => contextFactory(req.raw),
    onOperation: (_ctx, _req, args, result) =>
      streams && isAsyncGenerator(result)
        ? streams.track(result, tagsOf?.(args))
        : undefined,
  });
}

const DEFAULT_ROOTS = {
  query: "Query",
  mutation: "Mutation",
  subscription: "Subscription",
} as const;

const STREAM_ROOTS: readonly string[] = Object.values(DEFAULT_ROOTS);

export function customOperationRoots(typeDefs: DocumentNode): string[] {
  return typeDefs.definitions.flatMap((def) =>
    def.kind === Kind.SCHEMA_DEFINITION || def.kind === Kind.SCHEMA_EXTENSION
      ? (def.operationTypes ?? [])
          .filter(
            ({ operation, type }) =>
              type.name.value !== DEFAULT_ROOTS[operation],
          )
          .map(({ operation, type }) => `${operation}: ${type.name.value}`)
      : [],
  );
}

const FEDERATION_DIRECTIVES = new Set([
  "authenticated",
  "composeDirective",
  "context",
  "cost",
  "extends",
  "external",
  "fromContext",
  "inaccessible",
  "interfaceObject",
  "key",
  "link",
  "listSize",
  "override",
  "policy",
  "provides",
  "requires",
  "requiresScopes",
  "shareable",
  "tag",
]);

const FEDERATION_SPEC_URL = "https://specs.apollo.dev/federation/";

type FederationNames = { names: Set<string>; prefixes: string[] };

function stringArgument(
  node: DirectiveNode | ObjectValueNode,
  name: string,
): string | undefined {
  const args = node.kind === Kind.DIRECTIVE ? node.arguments : node.fields;
  const value = args?.find((arg) => arg.name.value === name)?.value;
  return value?.kind === Kind.STRING ? value.value : undefined;
}

function withoutAt(name: string): string | undefined {
  return name.startsWith("@") ? name.slice(1) : undefined;
}

/** Includes names a federation `@link` imports under an alias or `as` prefix. */
function federationNames(typeDefs: DocumentNode): FederationNames {
  const names = new Set(FEDERATION_DIRECTIVES);
  const prefixes = ["federation__"];
  for (const def of typeDefs.definitions) {
    if (
      def.kind !== Kind.SCHEMA_DEFINITION &&
      def.kind !== Kind.SCHEMA_EXTENSION
    ) {
      continue;
    }
    for (const link of def.directives ?? []) {
      if (link.name.value !== "link") continue;
      if (!stringArgument(link, "url")?.startsWith(FEDERATION_SPEC_URL)) {
        continue;
      }
      prefixes.push(`${stringArgument(link, "as") ?? "federation"}__`);
      const imports = link.arguments?.find(
        (arg) => arg.name.value === "import",
      )?.value;
      if (imports?.kind !== Kind.LIST) continue;
      for (const item of imports.values) {
        const name =
          item.kind === Kind.STRING
            ? item.value
            : item.kind === Kind.OBJECT
              ? (stringArgument(item, "as") ?? stringArgument(item, "name"))
              : undefined;
        const directive = name === undefined ? undefined : withoutAt(name);
        if (directive !== undefined) names.add(directive);
      }
    }
  }
  return { names, prefixes };
}

function isFederationDirective(
  name: string,
  declared: Set<string>,
  federation: FederationNames,
): boolean {
  if (declared.has(name)) return false;
  return (
    federation.names.has(name) ||
    federation.prefixes.some((prefix) => name.startsWith(prefix))
  );
}

function stripFederationDirectives(typeDefs: DocumentNode): DocumentNode {
  const declared = new Set<string>();
  for (const def of typeDefs.definitions) {
    if (def.kind === Kind.DIRECTIVE_DEFINITION) declared.add(def.name.value);
  }
  const federation = federationNames(typeDefs);
  return visit(typeDefs, {
    Directive: (node) =>
      isFederationDirective(node.name.value, declared, federation)
        ? null
        : undefined,
    SchemaExtension: {
      leave: (node) =>
        !node.directives?.length && !node.operationTypes?.length
          ? null
          : undefined,
    },
  });
}

/** `extend type X @key(...)` with no X in the set must define X to build. */
function defineExtendedEntities(
  typeDefs: DocumentNode,
  defined: Set<string>,
): DocumentNode {
  return {
    ...typeDefs,
    definitions: typeDefs.definitions.map((def) =>
      def.kind === Kind.OBJECT_TYPE_EXTENSION &&
      !defined.has(def.name.value) &&
      !STREAM_ROOTS.includes(def.name.value)
        ? { ...def, kind: Kind.OBJECT_TYPE_DEFINITION }
        : def,
    ),
  };
}

/** Federation directives are undeclared in the in-process merge. */
export function withoutFederationDirectives(
  subgraphs: SubgraphDefinition[],
): SubgraphDefinition[] {
  const defined = new Set<string>();
  for (const subgraph of subgraphs) {
    for (const def of subgraph.typeDefs.definitions) {
      if (isTypeDefinitionNode(def)) defined.add(def.name.value);
    }
  }
  return subgraphs.map((subgraph) => ({
    ...subgraph,
    typeDefs: defineExtendedEntities(
      stripFederationDirectives(subgraph.typeDefs),
      defined,
    ),
  }));
}

/** `undefined` when there is nothing to merge; missing roots get placeholders. */
export function mergeStreamSubgraphs(
  subgraphs: SubgraphDefinition[],
): GraphQLSchema | undefined {
  if (subgraphs.length === 0) return undefined;
  const defined = new Set<string>();
  const extended = new Set<string>();
  for (const subgraph of subgraphs) {
    for (const def of subgraph.typeDefs.definitions) {
      if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
        defined.add(def.name.value);
      } else if (def.kind === Kind.OBJECT_TYPE_EXTENSION) {
        extended.add(def.name.value);
      }
    }
  }
  const placeholders: DefinitionNode[] = STREAM_ROOTS.filter(
    (root) => extended.has(root) && !defined.has(root),
  ).flatMap((root) => parse(`type ${root}`).definitions);
  if (!defined.has("Query") && !extended.has("Query")) {
    // graphql rejects a fieldless type, and a schema needs a Query root.
    placeholders.push(...parse(`type Query { _stub: Boolean }`).definitions);
  }
  const roots: SubgraphDefinition[] =
    placeholders.length > 0
      ? [
          {
            name: "stream-roots",
            typeDefs: { kind: Kind.DOCUMENT, definitions: placeholders },
            url: "",
          },
        ]
      : [];
  return mergeSubgraphSchemas([...roots, ...subgraphs], "last");
}

function isAsyncGenerator<T>(value: T): value is Extract<T, AsyncGenerator> {
  return (
    typeof value === "object" &&
    value !== null &&
    Symbol.asyncIterator in value &&
    typeof (value as { return?: unknown }).return === "function" &&
    typeof (value as { throw?: unknown }).throw === "function"
  );
}
