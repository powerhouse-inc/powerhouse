import type {
  DefinitionDiagnostic,
  LocationFreeGraphQLDocumentNode,
  ResolverCoordinateDefinition,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import {
  createDiagnostic,
  describeReceived,
  DocumentModelDefinitionError,
  failDefinition,
} from "../diagnostics.js";
import { snapshotDescriptorArray } from "../field-options.js";
import { compareCodeUnits } from "../primitives.js";
import type { ScalarBinding } from "../scalars/types.js";
import { compileSubgraphSchema, rootFor } from "./ast.js";
import {
  compareResolverCoordinates,
  coordinatesOfResolverMap,
  normalizeCompatibility,
  operationRootsOfDocument,
  typeKindsOfDocument,
} from "./compatibility.js";
import {
  createEntryBuilders,
  type Bound,
  type EntryBuilders,
  type FieldInvocation,
  type RegisteredEntry,
} from "./entries.js";
import type { TypedSubgraphEntry } from "./types.js";

export type SubgraphSchemaBuilders<
  TSubgraph,
  TRequest,
  TInfo,
  TAbstractType,
  TDocument,
  TResolverMap,
> = EntryBuilders<TSubgraph, TRequest, TInfo, TAbstractType> & {
  /**
   * Serves an existing GraphQL document as written. Return the result alone:
   * a schema is typed entries or one SDL document, never both.
   */
  graphql(spec: SdlSchemaSpec<TSubgraph, TDocument, TResolverMap>): SdlSchema;
  /**
   * Declares that this `getSchema` replaces its parent's root fields on
   * purpose, which silences the warning for the ones it drops.
   */
  replaceParentSchema(): void;
};

export type SdlSchemaSpec<TSubgraph, TDocument, TResolverMap> = {
  readonly typeDefs: TDocument;
  /**
   * Declared, not discovered: inspection never calls `resolvers`, and the
   * host compares this list with the map `resolvers` returns when it binds.
   */
  readonly resolverCoordinates: readonly ResolverCoordinateDefinition[];
  /** Called once per instance, after `onSetup`, with that instance. */
  readonly resolvers: (subgraph: TSubgraph) => TResolverMap;
};

declare const SDL_SCHEMA_BRAND: unique symbol;

export type SdlSchema = { readonly [SDL_SCHEMA_BRAND]: true };

export type SubgraphSchema = readonly TypedSubgraphEntry[] | SdlSchema;

export type SubgraphClassShape = {
  readonly name: string;
  getSchema(schema: never): unknown;
};

export type CompileSubgraphOptions = {
  /**
   * Evaluates `getSchema` a second time with fresh builders and refuses a
   * different result. Best effort: it cannot see a resolver whose captured
   * state changes what it returns.
   */
  readonly checkDeterminism: boolean;
};

export type CompiledSubgraph<TSubgraph> = {
  readonly name: string;
  readonly definition: SubgraphDefinition;
  readonly typeDefs: LocationFreeGraphQLDocumentNode;
  readonly hasSubscriptions: boolean;
  readonly diagnostics: readonly DefinitionDiagnostic[];
  /**
   * Root fields, as `Type.field`, that the parent's `getSchema` declares and
   * this class's own `getSchema` drops, usually by not spreading
   * `super.getSchema(schema)`.
   */
  readonly droppedParentFields: readonly string[];
  /**
   * The host binds each to its own coercion, because GraphQL's default
   * pass-through would validate nothing.
   */
  readonly packageScalars: readonly ScalarBinding[];
  readonly resolversFor: (subgraph: TSubgraph) => Record<string, unknown>;
  readonly checkResolvers: (
    resolvers: Readonly<Record<string, unknown>>,
  ) => readonly DefinitionDiagnostic[];
};

type CompiledSchema<TSubgraph> = Omit<
  CompiledSubgraph<TSubgraph>,
  "droppedParentFields"
>;

const SUBGRAPH_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function isSubgraphName(name: unknown): name is string {
  return typeof name === "string" && SUBGRAPH_NAME.test(name);
}

function isRouteSegment(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    !/[/\\]/.test(name)
  );
}

/**
 * Refuses a class whose own static `subgraphName` is missing or is not
 * lowercase kebab-case. `compileSubgraph` checks only that the name is a
 * route segment, so whoever reads an authored class runs this first.
 */
export function checkSubgraphName(subgraphClass: SubgraphClassShape): void {
  ownSubgraphName(subgraphClass, "kebab-case");
}

export function namelessSubgraphMessage(className: string): string {
  return `${className} has no static subgraphName. Shared bases belong outside subgraphs/ or must be extended by an exported subgraph. Old-style subgraphs (\`name\`/\`typeDefs\`/\`resolvers\`): run \`ph migrate\`.`;
}

/**
 * Compiles a subgraph class from its own static `subgraphName` and its static
 * `getSchema`, which runs with the class as its receiver. Never constructs
 * the class and never calls a resolver factory.
 */
export function compileSubgraph<TSubgraph>(
  subgraphClass: SubgraphClassShape,
  options: CompileSubgraphOptions,
): CompiledSubgraph<TSubgraph> {
  const name = ownSubgraphName(subgraphClass, "route-segment");
  const first = evaluateSchema(subgraphClass, getSchemaOf(subgraphClass));
  const compiled = compileEvaluated<TSubgraph>(first, name, subgraphClass);
  if (options.checkDeterminism) {
    checkSubgraphDeterminism(subgraphClass, compiled);
  }
  const dropped = first.replacesParent
    ? []
    : droppedParentFields(subgraphClass, name, rootFields(compiled.typeDefs));
  return {
    ...compiled,
    diagnostics:
      dropped.length === 0
        ? compiled.diagnostics
        : [
            ...compiled.diagnostics,
            droppedParentFieldsDiagnostic(subgraphClass, name, dropped),
          ],
    droppedParentFields: dropped,
  };
}

/**
 * Evaluates `getSchema` once more with fresh builders and refuses a schema
 * that differs from `compiled`. This is the check `compileSubgraph` runs with
 * `checkDeterminism`, for a caller that compiled without it.
 */
export function checkSubgraphDeterminism(
  subgraphClass: SubgraphClassShape,
  compiled: Pick<CompiledSubgraph<unknown>, "name" | "definition" | "typeDefs">,
): void {
  const again = compileEvaluated(
    evaluateSchema(subgraphClass, getSchemaOf(subgraphClass)),
    compiled.name,
    subgraphClass,
  );
  if (fingerprint(again) !== fingerprint(compiled)) {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["getSchema"],
      message: `${subgraphClass.name}.getSchema is not deterministic: two calls returned different schemas.`,
      repair:
        "Build the schema only from the builder and module constants. Read no clock, counter, random value, or mutable state in getSchema.",
    });
  }
}

/**
 * The type definitions a subgraph named `subgraphName` with this `getSchema`
 * compiles to, for a type map that needs no class and serves no resolvers.
 * Refuses a schema that compiles with any diagnostic: the map is the host's
 * own, and nothing would report one.
 */
export function compileSubgraphTypeDefs(
  subgraphName: string,
  getSchema: (schema: never) => unknown,
): LocationFreeGraphQLDocumentNode {
  const source = { name: subgraphName, getSchema };
  const { typeDefs, diagnostics } = compileEvaluated(
    evaluateSchema(source, getSchema),
    subgraphName,
    source,
  );
  const [first, ...rest] = diagnostics;
  if (first !== undefined) {
    throw new DocumentModelDefinitionError([first, ...rest]);
  }
  return typeDefs;
}

function getSchemaOf(subgraphClass: SubgraphClassShape): GetSchema {
  const getSchema = (subgraphClass as { readonly getSchema?: unknown })
    .getSchema;
  if (typeof getSchema !== "function") {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["getSchema"],
      message: `${subgraphClass.name} has no static getSchema.`,
      received: describeReceived(getSchema),
      repair:
        "Extend BaseSubgraph from @powerhousedao/reactor-api and override static getSchema(schema).",
    });
  }
  return getSchema as GetSchema;
}

function droppedParentFieldsDiagnostic(
  subgraphClass: SubgraphClassShape,
  name: string,
  dropped: readonly string[],
): DefinitionDiagnostic {
  const parent = (
    Object.getPrototypeOf(subgraphClass) as { readonly name?: unknown }
  ).name;
  return createDiagnostic({
    code: "PH-SG-PARENT-FIELDS-DROPPED",
    definition: { kind: "subgraph", key: name },
    path: ["getSchema"],
    message: `${subgraphClass.name}.getSchema drops ${dropped.join(", ")}, which ${String(parent)}.getSchema declares.`,
    received: dropped.join(", "),
    repair: `Spread super.getSchema(schema) into the result, or call schema.replaceParentSchema() if ${subgraphClass.name} replaces them on purpose.`,
  });
}

function ownSubgraphName(
  subgraphClass: SubgraphClassShape,
  rule: "kebab-case" | "route-segment",
): string {
  const value: unknown = Object.hasOwn(subgraphClass, "subgraphName")
    ? (subgraphClass as { readonly subgraphName?: unknown }).subgraphName
    : undefined;
  if (value === undefined) {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["subgraphName"],
      message: namelessSubgraphMessage(subgraphClass.name),
      received: "undefined",
      repair: `Declare static override readonly subgraphName = "my-subgraph" on ${subgraphClass.name}.`,
    });
  }
  const isValid = rule === "kebab-case" ? isSubgraphName : isRouteSegment;
  if (!isValid(value)) {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["subgraphName"],
      message:
        rule === "kebab-case"
          ? `${subgraphClass.name}.subgraphName is not lowercase kebab-case. The name is the subgraph's route segment and is never normalized.`
          : `${subgraphClass.name}.subgraphName is not one route segment.`,
      received: typeof value === "string" ? value : describeReceived(value),
      repair:
        'Use lowercase letters and digits with single hyphens between them, such as "contacts-search".',
    });
  }
  return value;
}

type Evaluated = {
  readonly returned: unknown;
  readonly exposed: readonly { readonly name: string | null }[];
  readonly replacesParent: boolean;
};

const SDL_SCHEMAS = new WeakMap<object, SdlSchemaRecord>();

type SdlSchemaRecord = {
  readonly typeDefs: unknown;
  readonly resolverCoordinates: unknown;
  readonly resolvers: unknown;
};

type GetSchema = (this: unknown, schema: never) => unknown;

function evaluateSchema(
  receiver: SubgraphClassShape,
  getSchema: GetSchema,
): Evaluated {
  const { builders, exposed } = createEntryBuilders();
  let replacesParent = false;
  const schema = {
    ...builders,
    graphql: sdlSchema,
    replaceParentSchema: () => {
      replacesParent = true;
    },
  };
  const returned = getSchema.call(receiver, schema as never);
  return { returned, exposed, replacesParent };
}

function sdlSchema(spec: unknown): SdlSchema {
  const {
    typeDefs,
    resolverCoordinates,
    resolvers,
  }: Partial<Record<string, unknown>> =
    spec !== null && typeof spec === "object" ? spec : {};
  const marker = markerThatSpreadsAsItself();
  SDL_SCHEMAS.set(marker, { typeDefs, resolverCoordinates, resolvers });
  return marker as SdlSchema;
}

function markerThatSpreadsAsItself(): object {
  const marker: object = Object.freeze({
    *[Symbol.iterator]() {
      yield marker;
    },
  });
  return marker;
}

function sdlRecordOf(value: unknown): SdlSchemaRecord | undefined {
  return value !== null && typeof value === "object"
    ? SDL_SCHEMAS.get(value)
    : undefined;
}

function compileEvaluated<TSubgraph>(
  evaluated: Evaluated,
  name: string,
  subgraphClass: SubgraphClassShape,
): CompiledSchema<TSubgraph> {
  const sdl = sdlRecordOf(evaluated.returned);
  if (sdl !== undefined) return compileSdl(sdl, name);
  const entries = snapshotDescriptorArray(
    evaluated.returned,
    ["entries"],
    "PH-SG-ENTRY-INVALID",
    "Return an array of the entries the builders produced, or one schema.graphql(...) result.",
  );
  entries.forEach((entry, index) => {
    if (sdlRecordOf(entry) !== undefined) {
      failDefinition({
        code: "PH-SG-ENTRY-INVALID",
        path: ["entries", index],
        message: `${subgraphClass.name}.getSchema returned typed entries and a schema.graphql(...) schema. A schema is one or the other.`,
        repair:
          "Return the schema.graphql(...) result alone, or declare every field as a typed entry.",
      });
    }
  });
  if (entries.length === 0) {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["entries"],
      message: `${subgraphClass.name}.getSchema returned no entries.`,
      received: "empty array",
      repair:
        "Return at least one entry. Check that the method is spelled getSchema and marked override, and that it spreads super.getSchema(schema) to keep its parent's entries.",
    });
  }
  return compileTyped(entries, evaluated.exposed, name);
}

function compileTyped<TSubgraph>(
  entries: readonly unknown[],
  exposed: readonly { readonly name: string | null }[],
  name: string,
): CompiledSchema<TSubgraph> {
  const schema = compileSubgraphSchema({ name, entries, exposed });
  const hasSubscriptions = operationRootsOfDocument(schema.document).has(
    "subscription",
  );
  const definition: SubgraphDefinition = Object.freeze({
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name,
    compositionPolicy: "host-current",
    federationProfile: "host-current",
    schemaKind: "typed",
    hasSubscriptions,
    types: schema.types,
    entries: schema.entries,
    scalars: schema.scalars,
    definitionOrder: schema.definitionOrder,
  });
  return {
    name,
    definition,
    typeDefs: schema.document,
    hasSubscriptions,
    diagnostics: schema.diagnostics,
    packageScalars: schema.packageScalars,
    resolversFor: (subgraph) => typedResolverMap(schema.registered, subgraph),
    checkResolvers: () => [],
  };
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

function isDocumentNode(value: unknown): boolean {
  return (
    typeof value === "object" &&
    value !== null &&
    (value as { readonly kind?: unknown }).kind === "Document" &&
    Array.isArray((value as { readonly definitions?: unknown }).definitions)
  );
}

function compileSdl<TSubgraph>(
  spec: SdlSchemaRecord,
  name: string,
): CompiledSchema<TSubgraph> {
  const { typeDefs, resolverCoordinates, resolvers } = spec;
  if (!isDocumentNode(typeDefs)) {
    failDefinition({
      code: "PH-SG-DEFINITION-INVALID",
      path: ["graphql", "typeDefs"],
      message: "schema.graphql's typeDefs is not a GraphQL document node.",
      received: describeReceived(typeDefs),
      repair:
        "Pass the document that gql or graphql's parse returns, not the SDL string.",
    });
  }
  const coordinateRepair =
    "List each resolver coordinate as { typeName, fieldName, resolverKind }.";
  const coordinates = snapshotDescriptorArray(
    resolverCoordinates,
    ["graphql", "resolverCoordinates"],
    "PH-SG-ENTRY-INVALID",
    coordinateRepair,
  );
  coordinates.forEach((coordinate, index) => {
    if (typeof coordinate !== "object" || coordinate === null) {
      failDefinition({
        code: "PH-SG-ENTRY-INVALID",
        path: ["graphql", "resolverCoordinates", index],
        message:
          "A resolver coordinate is an object with typeName, fieldName, and resolverKind.",
        received: describeReceived(coordinate),
        repair: coordinateRepair,
      });
    }
  });
  if (typeof resolvers !== "function") {
    failDefinition({
      code: "PH-SG-ENTRY-INVALID",
      path: ["graphql", "resolvers"],
      message:
        resolvers === undefined
          ? "schema.graphql has no resolvers."
          : "schema.graphql's resolvers is not a function.",
      received: describeReceived(resolvers),
      repair:
        "Pass resolvers: (subgraph) => the resolver map, called once per instance.",
    });
  }
  const normalized = normalizeCompatibility(
    {
      kind: "graphql-ast-v1",
      typeDefs,
      resolverCoordinates:
        coordinates as readonly ResolverCoordinateDefinition[],
    },
    ["graphql"],
  );
  const hasSubscriptions = operationRootsOfDocument(normalized.document).has(
    "subscription",
  );
  const typeKinds = typeKindsOfDocument(normalized.document);

  const definition: SubgraphDefinition = Object.freeze({
    kind: "powerhouse.subgraph",
    formatVersion: 1,
    name,
    compositionPolicy: "host-current",
    federationProfile: "host-current",
    schemaKind: "graphql-ast-compat",
    hasSubscriptions,
    document: normalized.document,
    resolverCoordinates: normalized.resolverCoordinates,
    access: "manual",
  });

  return {
    name,
    definition,
    typeDefs: normalized.document,
    hasSubscriptions,
    diagnostics: normalized.diagnostics,
    packageScalars: [],
    resolversFor: (subgraph) =>
      (resolvers as (subgraph: unknown) => Record<string, unknown>)(subgraph),
    checkResolvers: (resolverMap) =>
      compareResolverCoordinates(
        normalized.resolverCoordinates,
        coordinatesOfResolverMap(resolverMap, typeKinds),
        ["graphql", "resolverCoordinates"],
      ),
  };
}

function rootFields(
  document: LocationFreeGraphQLDocumentNode,
): ReadonlySet<string> {
  const roots = new Set(operationRootsOfDocument(document).values());
  const fields = new Set<string>();
  for (const definition of document.definitions) {
    if (
      (definition.kind === "ObjectTypeDefinition" ||
        definition.kind === "ObjectTypeExtension") &&
      roots.has(definition.name.value)
    ) {
      for (const field of definition.fields) {
        fields.add(`${definition.name.value}.${field.name.value}`);
      }
    }
  }
  return fields;
}

function droppedParentFields(
  subgraphClass: SubgraphClassShape,
  name: string,
  own: ReadonlySet<string>,
): readonly string[] {
  if (!Object.hasOwn(subgraphClass, "getSchema")) return [];
  const inherited: unknown = (
    Object.getPrototypeOf(subgraphClass) as { readonly getSchema?: unknown }
  ).getSchema;
  if (typeof inherited !== "function") return [];
  const parent = compileParentSchema(
    subgraphClass,
    name,
    inherited as GetSchema,
  );
  if (!parent.compiled) return [];
  return [...rootFields(parent.typeDefs)]
    .filter((field) => !own.has(field))
    .sort(compareCodeUnits);
}

function compileParentSchema(
  subgraphClass: SubgraphClassShape,
  name: string,
  getSchema: GetSchema,
):
  | {
      readonly compiled: true;
      readonly typeDefs: LocationFreeGraphQLDocumentNode;
    }
  | { readonly compiled: false } {
  try {
    const { typeDefs } = compileEvaluated(
      evaluateSchema(subgraphClass, getSchema),
      name,
      subgraphClass,
    );
    return { compiled: true, typeDefs };
  } catch {
    return { compiled: false };
  }
}

function fingerprint(
  compiled: Pick<CompiledSchema<unknown>, "definition" | "typeDefs">,
): string {
  return JSON.stringify([compiled.definition, compiled.typeDefs]);
}
