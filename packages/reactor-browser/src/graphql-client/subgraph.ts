import type { DocumentNode } from "graphql";
import { GraphQLClient } from "graphql-request";
import type { SdkFunctionWrapper } from "../graphql/gen/schema.js";

/**
 * The factory a GraphQL code generator produces for a schema.
 *
 * It is the signature of `getSdk` emitted by the `typescript-graphql-request`
 * plugin - the generated `getSdk` in `src/graphql/gen/schema.ts` is the
 * canonical example - so a project can hand its own generated function straight
 * to {@link SubgraphSdkRegistry.get} and keep every operation typed.
 */
export type SubgraphSdkFactory<TSdk> = (
  client: GraphQLClient,
  withWrapper?: SdkFunctionWrapper,
) => TSdk;

/**
 * The middleware a subgraph SDK is bound with. Re-exported here because a
 * hand-written SDK has to name it, while a generated one declares its own.
 */
export type { SdkFunctionWrapper };

/**
 * A GraphQL document that carries its result and variable types.
 *
 * This is the shape a code generator gives a document (`TypedDocumentNode`),
 * declared structurally so that reactor-browser needs no dependency on
 * `@graphql-typed-document-node/core`. A plain `DocumentNode` satisfies it too,
 * with the result type falling back to whatever the caller passes explicitly.
 */
export type TypedGraphQLDocument<TResult, TVariables> = DocumentNode & {
  __apiType?: (variables: TVariables) => TResult;
};

/** Extras for a one-off request. */
export type GraphQLRequestOptions = {
  /**
   * The operation name reported to the auth and logging middleware. Read off
   * the document when it is not given.
   */
  operationName?: string;

  /**
   * The operation type reported to the middleware, e.g. `"mutation"`. Read off
   * the document when it is not given.
   */
  operationType?: string;

  signal?: AbortSignal;
};

/** What {@link describeGraphQLDocument} could not read off a document. */
const unnamedOperation = "AnonymousOperation";
const defaultOperationType = "query";

/**
 * Derives a subgraph's endpoint from the Switchboard's GraphQL endpoint.
 *
 * Subgraphs are served next to the supergraph, at `<graphql base>/<name>`, so
 * `http://localhost:4001/graphql` plus `statements` is
 * `http://localhost:4001/graphql/statements`.
 */
export function subgraphUrlFromGraphqlUrl(url: string, name: string): string {
  const trimmed = name.trim();
  if (trimmed === "") {
    throw new Error("a subgraph name is required");
  }
  return `${url.replace(/\/+$/, "")}/${trimmed}`;
}

/**
 * Reads the operation name and type off a document, for the middleware.
 *
 * Nothing depends on getting this right - it is reported to the middleware, not
 * sent to the server - so an unreadable document falls back to an anonymous
 * query rather than throwing.
 */
export function describeGraphQLDocument(document: string | DocumentNode): {
  operationName: string;
  operationType: string;
} {
  if (typeof document !== "string") {
    const operation = document.definitions.find(
      (definition) => definition.kind === "OperationDefinition",
    );
    if (!operation || operation.kind !== "OperationDefinition") {
      return {
        operationName: unnamedOperation,
        operationType: defaultOperationType,
      };
    }
    return {
      operationName: operation.name?.value ?? unnamedOperation,
      operationType: operation.operation,
    };
  }

  const match =
    /\b(query|mutation|subscription)\s+([_A-Za-z][_0-9A-Za-z]*)/.exec(document);
  if (!match) {
    return {
      operationName: unnamedOperation,
      operationType: /\bmutation\b/.test(document)
        ? "mutation"
        : defaultOperationType,
    };
  }
  return { operationName: match[2], operationType: match[1] };
}

/** A subgraph transport and the SDK last bound to it. */
type SubgraphBinding = {
  transport: GraphQLClient;
  factory?: SubgraphSdkFactory<unknown>;
  sdk?: unknown;
};

/**
 * Binds typed subgraph SDKs to one Switchboard's transport and auth.
 *
 * Every capability a Switchboard exposes lives behind the same base URL, so an
 * app should not have to build a second client - with a second copy of the auth
 * configuration - to reach a project's own subgraph. The registry derives the
 * endpoint, reuses one transport per subgraph and hands the code generator's
 * `getSdk` the very middleware the reactor operations already go through.
 *
 * Transport and typing only: subgraph results are not cached and produce no
 * change events.
 */
export class SubgraphSdkRegistry {
  private readonly url: string;
  private readonly middleware: SdkFunctionWrapper | undefined;
  private readonly bindings = new Map<string, SubgraphBinding>();

  constructor(url: string, middleware?: SdkFunctionWrapper) {
    this.url = url;
    this.middleware = middleware;
  }

  /**
   * Returns the subgraph's SDK, building it on first use.
   *
   * The transport is kept per subgraph name, so repeated calls do not rebuild
   * it. The SDK itself is only reused when the same factory is passed again -
   * two different generated SDKs over one subgraph each get their own, rather
   * than the second call being handed the first one's methods.
   */
  get<TSdk>(name: string, getSdk: SubgraphSdkFactory<TSdk>): TSdk {
    const binding = this.binding(name);
    if (binding.factory === getSdk) {
      return binding.sdk as TSdk;
    }

    const sdk = getSdk(binding.transport, this.middleware);
    binding.factory = getSdk as SubgraphSdkFactory<unknown>;
    binding.sdk = sdk;
    return sdk;
  }

  /** Returns the subgraph's endpoint, for diagnostics and tests. */
  urlFor(name: string): string {
    return subgraphUrlFromGraphqlUrl(this.url, name);
  }

  private binding(name: string): SubgraphBinding {
    const existing = this.bindings.get(name);
    if (existing) {
      return existing;
    }

    const binding: SubgraphBinding = {
      transport: new GraphQLClient(this.urlFor(name)),
    };
    this.bindings.set(name, binding);
    return binding;
  }
}
