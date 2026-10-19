import {
  type DefinitionNode,
  type DocumentNode,
  type ExecutionArgs,
  type GraphQLSchema,
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

function isFederationDirective(name: string, declared: Set<string>): boolean {
  if (declared.has(name)) return false;
  return FEDERATION_DIRECTIVES.has(name) || name.startsWith("federation__");
}

function stripFederationDirectives(typeDefs: DocumentNode): DocumentNode {
  const declared = new Set<string>();
  for (const def of typeDefs.definitions) {
    if (def.kind === Kind.DIRECTIVE_DEFINITION) declared.add(def.name.value);
  }
  return visit(typeDefs, {
    Directive: (node) =>
      isFederationDirective(node.name.value, declared) ? null : undefined,
    SchemaExtension: {
      leave: (node) =>
        !node.directives?.length && !node.operationTypes?.length
          ? null
          : undefined,
    },
  });
}

/**
 * The subgraphs with federation directives removed: the stream schema is
 * merged in-process, where those directives are undeclared.
 */
export function withoutFederationDirectives(
  subgraphs: SubgraphDefinition[],
): SubgraphDefinition[] {
  return subgraphs.map((subgraph) => ({
    ...subgraph,
    typeDefs: stripFederationDirectives(subgraph.typeDefs),
  }));
}

const STREAM_ROOTS = ["Query", "Mutation", "Subscription"];

/**
 * Merges subscription subgraphs into one stream schema, or `undefined` when no
 * subgraph contributes the Query root a schema requires. A root the subgraphs
 * only extend gets an empty definition to extend.
 */
export function mergeStreamSubgraphs(
  subgraphs: SubgraphDefinition[],
): GraphQLSchema | undefined {
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
  if (!defined.has("Query") && !extended.has("Query")) {
    return undefined;
  }
  const placeholders: DefinitionNode[] = STREAM_ROOTS.filter(
    (root) => extended.has(root) && !defined.has(root),
  ).flatMap((root) => parse(`type ${root}`).definitions);
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
