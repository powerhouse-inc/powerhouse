import type {
  DefinitionDiagnostic,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { failDefinition } from "../diagnostics.js";
import { snapshotDescriptorArray } from "../field-options.js";
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
import {
  createEntryBuilders,
  type Bound,
  type EntryBuilders,
  type FieldInvocation,
  type RegisteredEntry,
} from "./entries.js";
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
export type CompiledSubgraph<TSubgraph> = CompiledSchema<TSubgraph> &
  Pick<SubgraphConfigBase<TSubgraph>, "onSetup" | "onDisconnect">;

type CompiledSchema<TSubgraph> = {
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
  // Read before the entries callback runs, which may reassign them.
  const name = subgraphName(config.name);
  const onSetup = hookOrFail(config.onSetup, "onSetup");
  const onDisconnect = hookOrFail(config.onDisconnect, "onDisconnect");
  schemaKindOrFail(config.schemaKind);
  const compiled =
    config.schemaKind === "typed"
      ? compileTyped(config, name)
      : compileCompat(config, name);
  return { ...compiled, onSetup, onDisconnect };
}

function subgraphName(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["name"],
      message: "A subgraph needs a name.",
      received: typeof value,
      repair: "Give the subgraph a name.",
    });
  }
  return value;
}

function schemaKindOrFail(value: unknown): void {
  if (value !== "typed" && value !== "graphql-ast-compat") {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["schemaKind"],
      message: 'schemaKind is "typed" or "graphql-ast-compat".',
      received: typeof value === "string" ? value : typeof value,
      repair:
        'Use schemaKind: "typed" to declare entries, or "graphql-ast-compat" to serve an existing GraphQL document.',
    });
  }
}

function hookOrFail<THook>(
  value: THook | undefined,
  key: "onSetup" | "onDisconnect",
): THook | undefined {
  if (value !== undefined && typeof value !== "function") {
    failDefinition({
      code: "PH-DEF-OPTION-INVALID",
      path: [key],
      message: `${key} is not a function.`,
      received: typeof value,
      repair: `Pass ${key} as a function, or leave it out.`,
    });
  }
  return value;
}

function compileTyped<TSubgraph, TRequest, TInfo, TAbstractType>(
  config: TypedSubgraphConfig<TSubgraph, TRequest, TInfo, TAbstractType>,
  name: string,
): CompiledSchema<TSubgraph> {
  const { builders, exposed } = createEntryBuilders<
    TSubgraph,
    TRequest,
    TInfo,
    TAbstractType
  >();
  const { definitionOrder: authoredOrder } = config;
  const definitionOrder =
    authoredOrder === undefined ? undefined : definitionNames(authoredOrder);
  const returned = snapshotDescriptorArray(
    config.entries(builders),
    ["entries"],
    "PH-SG-ENTRY-INVALID",
    "Return an array of the entries the builders produced.",
  );
  const schema = compileSubgraphSchema({
    name,
    entries: returned,
    exposed,
    ...(definitionOrder !== undefined && { definitionOrder }),
  });

  const definition: SubgraphDefinition = Object.freeze({
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name,
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
    resolversFor: (subgraph) => typedResolverMap(schema.registered, subgraph),
    checkResolvers: () => [],
  };
}

function definitionNames(value: unknown): readonly string[] {
  const repair = "List every emitted definition once, as an array of names.";
  const names = snapshotDescriptorArray(
    value,
    ["definitionOrder"],
    "PH-SG-ENTRY-INVALID",
    repair,
  );
  names.forEach((name, index) => {
    if (typeof name !== "string") {
      failDefinition({
        code: "PH-SG-ENTRY-INVALID",
        path: ["definitionOrder", index],
        message: "definitionOrder lists definition names only.",
        received: typeof name,
        repair,
      });
    }
  });
  return names as readonly string[];
}

/**
 * The instance arrives as `subgraph`, the same value a `getResolvers(this)`
 * factory captures, so an author reaches host dependencies through it instead
 * of declaring them again.
 */
function typedResolverMap(
  entries: readonly RegisteredEntry[],
  subgraph: unknown,
): Record<string, unknown> {
  const resolvers: Record<string, Record<string, unknown>> = {};
  for (const entry of entries) {
    const [typeName, fieldName, value] = bindingOf(entry, subgraph);
    resolvers[typeName] = { ...resolvers[typeName], [fieldName]: value };
  }
  return resolvers;
}

/** Every case returns, so an entry kind added later fails to compile here. */
function bindingOf(
  entry: RegisteredEntry,
  subgraph: unknown,
): readonly [typeName: string, fieldName: string, value: unknown] {
  const field =
    (resolve: Bound<FieldInvocation>) =>
    (parent: unknown, args: unknown, request: unknown, info: unknown) =>
      resolve({ parent, args, subgraph, request, info });
  switch (entry.kind) {
    case "query":
    case "mutation":
      return [rootFor(entry.kind), entry.fieldName, field(entry.resolve)];
    case "subscription":
      return [
        rootFor(entry.kind),
        entry.fieldName,
        {
          subscribe: field(entry.subscribe),
          // Without a resolve, GraphQL's default lookup reads the field from
          // the event payload, which existing subscriptions rely on.
          ...(entry.resolve !== undefined && { resolve: field(entry.resolve) }),
        },
      ];
    case "computed-field":
      return [
        entry.token.typeName,
        entry.token.fieldName,
        field(entry.resolve),
      ];
    case "resolve-type": {
      const { resolve } = entry;
      const nameOf = (value: unknown): unknown =>
        typeof value === "object" && value !== null
          ? "name" in value
            ? value.name
            : undefined
          : value;
      return [
        entry.typeName,
        "__resolveType",
        (
          value: unknown,
          request: unknown,
          info: unknown,
          abstractType: unknown,
        ) => {
          const resolved = resolve({
            value,
            subgraph,
            request,
            info,
            abstractType,
          });
          return resolved !== null &&
            (typeof resolved === "object" || typeof resolved === "function") &&
            "then" in resolved &&
            typeof resolved.then === "function"
            ? Promise.resolve(resolved).then(nameOf)
            : nameOf(resolved);
        },
      ];
    }
    case "is-type-of": {
      const { resolve } = entry;
      return [
        entry.typeName,
        "__isTypeOf",
        (value: unknown, request: unknown, info: unknown) =>
          resolve({ parent: value, args: undefined, subgraph, request, info }),
      ];
    }
  }
}

function compileCompat<TSubgraph, TDocument, TResolverMap>(
  config: CompatSubgraphConfig<TSubgraph, TDocument, TResolverMap>,
  name: string,
): CompiledSchema<TSubgraph> {
  const compatibility: unknown = config.compatibility;
  if (typeof compatibility !== "object" || compatibility === null) {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["compatibility"],
      message:
        "A graphql-ast-compat subgraph needs a compatibility declaration object.",
      received: compatibility === null ? "null" : typeof compatibility,
      repair:
        'Pass compatibility: { kind: "graphql-ast-v1", typeDefs, resolverCoordinates, getResolvers, hasSubscriptions, preserveDefinitionOrder: true }.',
    });
  }
  const declared: Partial<Record<string, unknown>> = { ...compatibility };
  const { getResolvers } = declared;
  if (typeof getResolvers !== "function") {
    failDefinition({
      code: "PH-SG-ENTRY-INVALID",
      path: ["compatibility", "getResolvers"],
      message:
        getResolvers === undefined
          ? "The compatibility declaration has no getResolvers."
          : "The compatibility declaration's getResolvers is not a function.",
      received: typeof getResolvers,
      repair:
        "Pass getResolvers: a function that returns the resolver map for the subgraph instance.",
    });
  }
  const normalized = normalizeCompatibility(
    declared as GraphQLAstCompatibility<unknown, unknown, unknown>,
  );
  const typeKinds = typeKindsOfDocument(normalized.document);

  const definition: SubgraphDefinition = Object.freeze({
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name,
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
    typeDefs: normalized.document,
    hasSubscriptions: runtimeHasSubscriptions(normalized.hasSubscriptions),
    diagnostics: normalized.diagnostics,
    // A compatibility subgraph keeps its authored scalars and resolvers.
    packageScalars: [],
    resolversFor: (subgraph) =>
      getResolvers.call(compatibility, { subgraph }) as Record<string, unknown>,
    checkResolvers: (resolvers) =>
      compareResolverCoordinates(
        normalized.resolverCoordinates,
        coordinatesOfResolverMap(resolvers, typeKinds),
        ["compatibility", "resolverCoordinates"],
      ),
  };
}
