import type {
  DefinitionDiagnostic,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import type { ScalarBinding } from "../scalars/types.js";
import { compileSubgraphSchema, rootFor } from "./ast.js";
import {
  compareResolverCoordinates,
  coordinatesOfResolverMap,
  normalizeCompatibility,
  runtimeHasSubscriptions,
  typeKindsOfDocument,
  type GraphQLAstCompatibility,
} from "./compatibility.js";
import { createEntryBuilders, type EntryBuilders } from "./entries.js";
import type { TypedSubgraphEntry } from "./types.js";

// `defineSubgraph` ships from `reactor-api` because the class it returns
// extends that package's `BaseSubgraph`, and `document-model` must not depend
// on the host.

export type SubgraphConfigBase<TSubgraph> = {
  readonly name: string;
  readonly onSetup?: (call: { subgraph: TSubgraph }) => void | Promise<void>;
  readonly onDisconnect?: (call: {
    subgraph: TSubgraph;
  }) => void | Promise<void>;
};

export type TypedSubgraphConfig<TSubgraph, TRequest, TInfo, TAbstractType> =
  SubgraphConfigBase<TSubgraph> & {
    readonly schemaKind: "typed";
    readonly definitionOrder?: readonly string[];
    readonly entries: (
      builders: EntryBuilders<TSubgraph, TRequest, TInfo, TAbstractType>,
    ) => readonly TypedSubgraphEntry[];
  };

export type CompatSubgraphConfig<TSubgraph, TDocument, TResolverMap> =
  SubgraphConfigBase<TSubgraph> & {
    readonly schemaKind: "graphql-ast-compat";
    readonly compatibility: GraphQLAstCompatibility<
      TSubgraph,
      TDocument,
      TResolverMap
    >;
  };

export type SubgraphConfig<
  TSubgraph,
  TRequest,
  TInfo,
  TAbstractType,
  TDocument,
  TResolverMap,
> =
  | TypedSubgraphConfig<TSubgraph, TRequest, TInfo, TAbstractType>
  | CompatSubgraphConfig<TSubgraph, TDocument, TResolverMap>;

/**
 * Compiled once per class. Compiling per instance would re-walk the
 * declaration on every construction and could let two instances of one class
 * serve different schemas.
 */
export type CompiledSubgraph<TSubgraph> = {
  readonly definition: SubgraphDefinition;
  readonly typeDefs: unknown;
  readonly hasSubscriptions: boolean | undefined;
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /**
   * The host binds each to its own coercion, because GraphQL's default
   * pass-through would validate nothing.
   */
  readonly packageScalars: readonly ScalarBinding[];
  readonly resolversFor: (subgraph: TSubgraph) => Record<string, unknown>;
  readonly checkResolvers: (
    resolvers: Record<string, unknown>,
  ) => readonly DefinitionDiagnostic[];
};

export function compileSubgraph<
  TSubgraph,
  TRequest,
  TInfo,
  TAbstractType,
  TDocument,
  TResolverMap extends Record<string, unknown>,
>(
  config: SubgraphConfig<
    TSubgraph,
    TRequest,
    TInfo,
    TAbstractType,
    TDocument,
    TResolverMap
  >,
): CompiledSubgraph<TSubgraph> {
  return config.schemaKind === "typed"
    ? compileTyped(config)
    : compileCompat(config);
}

function compileTyped<TSubgraph, TRequest, TInfo, TAbstractType>(
  config: TypedSubgraphConfig<TSubgraph, TRequest, TInfo, TAbstractType>,
): CompiledSubgraph<TSubgraph> {
  const { builders, exposed } = createEntryBuilders<
    TSubgraph,
    TRequest,
    TInfo,
    TAbstractType
  >();
  const returned = config.entries(builders);
  const schema = compileSubgraphSchema({
    name: config.name,
    entries: returned,
    exposed,
    ...(config.definitionOrder !== undefined && {
      definitionOrder: config.definitionOrder,
    }),
  });

  const definition: SubgraphDefinition = Object.freeze({
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name: config.name,
    compositionPolicy: "host-current",
    federationProfile: "host-current",
    schemaKind: "typed",
    hasSubscriptions: schema.hasSubscriptions,
    types: schema.types,
    entries: schema.entries,
    scalars: schema.scalars,
    definitionOrder: schema.definitionOrder,
  });

  return {
    definition,
    typeDefs: schema.document,
    // The host's transport setup reads this instance flag instead of looking
    // for a Subscription type.
    hasSubscriptions: schema.hasSubscriptions,
    diagnostics: schema.diagnostics,
    packageScalars: schema.packageScalars,
    resolversFor: (subgraph) =>
      typedResolverMap(returned, subgraph as TSubgraph),
    checkResolvers: () => [],
  };
}

/**
 * The instance arrives as `subgraph`, the same value a `getResolvers(this)`
 * factory captures, so an author reaches host dependencies through it instead
 * of declaring them again.
 */
function typedResolverMap<TSubgraph>(
  entries: readonly TypedSubgraphEntry[],
  subgraph: TSubgraph,
): Record<string, unknown> {
  const resolvers: Record<string, Record<string, unknown>> = {};
  const put = (typeName: string, fieldName: string, value: unknown): void => {
    resolvers[typeName] = { ...resolvers[typeName], [fieldName]: value };
  };

  for (const entry of entries as readonly unknown[]) {
    const read = entry as {
      kind: string;
      key?: string;
      fieldName?: string;
      typeName?: string;
      token?: { typeName: string; fieldName: string };
      resolve?: (call: unknown) => unknown;
      subscribe?: (call: unknown) => unknown;
    };
    switch (read.kind) {
      case "query":
      case "mutation":
        put(
          rootFor(read.kind),
          read.fieldName!,
          (parent: unknown, args: unknown, request: unknown, info: unknown) =>
            read.resolve!({ parent, args, subgraph, request, info }),
        );
        break;
      case "subscription":
        put(rootFor(read.kind), read.fieldName!, {
          subscribe: (
            parent: unknown,
            args: unknown,
            request: unknown,
            info: unknown,
          ) => read.subscribe!({ parent, args, subgraph, request, info }),
          // Without a resolve, GraphQL's default lookup reads the field from
          // the event payload, which existing subscriptions rely on.
          ...(read.resolve !== undefined && {
            resolve: (
              parent: unknown,
              args: unknown,
              request: unknown,
              info: unknown,
            ) => read.resolve!({ parent, args, subgraph, request, info }),
          }),
        });
        break;
      case "computed-field":
        put(
          read.token!.typeName,
          read.token!.fieldName,
          (parent: unknown, args: unknown, request: unknown, info: unknown) =>
            read.resolve!({ parent, args, subgraph, request, info }),
        );
        break;
      case "resolve-type":
        put(
          read.typeName!,
          "__resolveType",
          (
            value: unknown,
            request: unknown,
            info: unknown,
            abstractType: unknown,
          ) => {
            const resolved = read.resolve!({
              value,
              subgraph,
              request,
              info,
              abstractType,
            });
            const nameOf = (value: unknown): unknown =>
              typeof value === "object" && value !== null
                ? (value as { name?: string }).name
                : value;
            return resolved !== null &&
              (typeof resolved === "object" ||
                typeof resolved === "function") &&
              "then" in resolved &&
              typeof resolved.then === "function"
              ? Promise.resolve(resolved).then(nameOf)
              : nameOf(resolved);
          },
        );
        break;
      case "is-type-of":
        put(
          read.typeName!,
          "__isTypeOf",
          (value: unknown, request: unknown, info: unknown) =>
            read.resolve!({
              parent: value,
              args: undefined,
              subgraph,
              request,
              info,
            }),
        );
        break;
    }
  }
  return resolvers;
}

function compileCompat<TSubgraph, TDocument, TResolverMap>(
  config: CompatSubgraphConfig<TSubgraph, TDocument, TResolverMap>,
): CompiledSubgraph<TSubgraph> {
  const normalized = normalizeCompatibility(
    config.compatibility as GraphQLAstCompatibility<unknown, unknown, unknown>,
  );
  const typeKinds = typeKindsOfDocument(normalized.document);

  const definition: SubgraphDefinition = Object.freeze({
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name: config.name,
    compositionPolicy: "host-current",
    federationProfile: "host-current",
    schemaKind: "graphql-ast-compat",
    hasSubscriptions: normalized.hasSubscriptions,
    document: normalized.document,
    resolverCoordinates: normalized.resolverCoordinates,
    access: "manual",
  });

  return {
    definition,
    // The author's own node, so the host adapter receives the object the
    // author passed. `normalized.document` is a location-free copy.
    typeDefs: config.compatibility.typeDefs,
    hasSubscriptions: runtimeHasSubscriptions(normalized.hasSubscriptions),
    diagnostics: normalized.diagnostics,
    // A compatibility subgraph keeps its authored scalars and resolvers.
    packageScalars: [],
    resolversFor: (subgraph) =>
      config.compatibility.getResolvers({ subgraph }) as Record<
        string,
        unknown
      >,
    checkResolvers: (resolvers) =>
      compareResolverCoordinates(
        normalized.resolverCoordinates,
        coordinatesOfResolverMap(resolvers, typeKinds),
        ["compatibility", "resolverCoordinates"],
      ),
  };
}
