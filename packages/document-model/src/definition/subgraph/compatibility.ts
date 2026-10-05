import type {
  DefinitionDiagnostic,
  LocationFreeGraphQLDocumentNode,
  ResolverCoordinateDefinition,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "../diagnostics.js";
import { validateLocationFreeDocument } from "../graphql-ast.js";
import { compareCodeUnits } from "../primitives.js";

/**
 * The escape hatch that keeps the typed grammar honest.
 *
 * A typed builder set that could express less GraphQL than GraphQL would push
 * authors back to generated source. So a subgraph whose schema the builders
 * cannot state exactly declares it as compatibility *data*: the AST it already
 * has, plus the coordinates its resolver map fills.
 *
 * The coordinates are declared rather than discovered. Discovering them means
 * calling the resolver factory, and a factory is host code — it can allocate,
 * read a dependency, or count its own calls. Checking and inspecting must not
 * do any of that, so the author writes the list and normal construction
 * compares it with what the factory actually produced.
 */

/** The compatibility declaration, with the host types still parameters. */
export type GraphQLAstCompatibility<TSubgraph, TDocument, TResolverMap> = {
  readonly kind: "graphql-ast-v1";
  readonly typeDefs: TDocument;
  readonly resolverCoordinates: readonly ResolverCoordinateDefinition[];
  readonly getResolvers: (call: { subgraph: TSubgraph }) => TResolverMap;
  /** `undefined` is a real value here; it is not "not set". */
  readonly hasSubscriptions: boolean | undefined;
  readonly preserveDefinitionOrder: true;
};

export type NormalizedCompatibility = {
  readonly document: LocationFreeGraphQLDocumentNode;
  readonly resolverCoordinates: readonly ResolverCoordinateDefinition[];
  /** The wire value: runtime `undefined` becomes `null`. */
  readonly hasSubscriptions: boolean | null;
  readonly diagnostics: readonly DefinitionDiagnostic[];
};

const RESOLVER_KINDS = new Set([
  "field",
  "subscribe",
  "resolve",
  "resolveType",
  "isTypeOf",
  "enum",
  "scalar",
]);

/**
 * Strips locations and records the declaration, in its existing order.
 *
 * Order is the point: the schema an existing subgraph serves prints its
 * definitions in a particular sequence, and reordering them would be a schema
 * change nobody asked for. Nothing here reinterprets a directive, an
 * extension, an enum map, or a federation construct — the AST passes through.
 */
export function normalizeCompatibility(
  compatibility: GraphQLAstCompatibility<unknown, unknown, unknown>,
  path: readonly (string | number)[] = ["compatibility"],
): NormalizedCompatibility {
  const diagnostics: DefinitionDiagnostic[] = [];

  const document = stripLocations(compatibility.typeDefs);
  diagnostics.push(
    ...validateLocationFreeDocument(document, [...path, "typeDefs"]),
  );

  const coordinates = compatibility.resolverCoordinates.map(
    (coordinate, index) => {
      const at = [...path, "resolverCoordinates", index];
      if (typeof coordinate.typeName !== "string") {
        diagnostics.push(
          coordinateDiagnostic(at, "A coordinate needs a type name."),
        );
      }
      if (
        coordinate.fieldName !== null &&
        typeof coordinate.fieldName !== "string"
      ) {
        diagnostics.push(
          coordinateDiagnostic(
            at,
            "A coordinate's field name is a string, or null for a type-level resolver.",
          ),
        );
      }
      if (!RESOLVER_KINDS.has(coordinate.resolverKind)) {
        diagnostics.push(
          coordinateDiagnostic(
            at,
            `${String(coordinate.resolverKind)} is not a resolver kind.`,
          ),
        );
      }
      return {
        typeName: coordinate.typeName,
        fieldName: coordinate.fieldName,
        resolverKind: coordinate.resolverKind,
      };
    },
  );

  const duplicates = new Set<string>();
  const seen = new Set<string>();
  for (const coordinate of coordinates) {
    const key = `${coordinate.typeName}.${coordinate.fieldName ?? ""}:${coordinate.resolverKind}`;
    if (seen.has(key)) duplicates.add(key);
    seen.add(key);
  }
  for (const key of [...duplicates].sort(compareCodeUnits)) {
    diagnostics.push(
      coordinateDiagnostic(
        [...path, "resolverCoordinates"],
        `Coordinate ${key} is declared twice.`,
      ),
    );
  }

  return {
    document,
    resolverCoordinates: coordinates,
    // `undefined` is a real value: the host's truthy check disables transports
    // for it and for `false` alike, but a migration that could not tell them
    // apart would have to guess, and guessing wrong turns a socket on.
    hasSubscriptions: compatibility.hasSubscriptions ?? null,
    diagnostics,
  };
}

/** Restores the runtime value the host reads from the wire value. */
export function runtimeHasSubscriptions(
  wire: boolean | null,
): boolean | undefined {
  return wire === null ? undefined : wire;
}

function coordinateDiagnostic(
  path: readonly (string | number)[],
  message: string,
): DefinitionDiagnostic {
  return createDiagnostic({
    code: "PH-SG-ENTRY-INVALID",
    path: path.map(String),
    message,
    repair:
      "List each resolver coordinate once, with a string type name, a string or null field name, and a known resolver kind.",
  });
}

/**
 * Removes `loc` and absent properties, and touches nothing else.
 *
 * A `DocumentNode` from `parse` carries source positions that cannot be
 * canonicalized, and properties explicitly set to `undefined` — a missing
 * description, an argument with no default. On the wire those are absences,
 * and dropping them is what keeps absent distinguishable from an explicit
 * `null`. Everything else, including node kinds this compiler does not
 * interpret, is copied through unchanged.
 */
function stripLocations(value: unknown): LocationFreeGraphQLDocumentNode {
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(walk);
    if (node === null || typeof node !== "object") return node;
    const copy: Record<string, unknown> = {};
    for (const [key, member] of Object.entries(node)) {
      if (key === "loc" || member === undefined) continue;
      copy[key] = walk(member);
    }
    return copy;
  };
  return walk(value) as LocationFreeGraphQLDocumentNode;
}

/**
 * The coordinates a real resolver map carries, in insertion order.
 *
 * Used at normal construction to compare what the factory produced with what
 * the author declared. The AST decides how to read a type-level entry: a
 * resolver on an enum is an enum map, on a scalar a scalar binding, and on an
 * object or interface a `__resolveType`/`__isTypeOf`.
 */
export function coordinatesOfResolverMap(
  resolvers: Readonly<Record<string, unknown>>,
  typeKinds: ReadonlyMap<string, string>,
): readonly ResolverCoordinateDefinition[] {
  const coordinates: ResolverCoordinateDefinition[] = [];
  for (const [typeName, value] of Object.entries(resolvers)) {
    const kind = typeKinds.get(typeName);
    if (kind === "ScalarTypeDefinition") {
      coordinates.push({ typeName, fieldName: null, resolverKind: "scalar" });
      continue;
    }
    if (value === null || typeof value !== "object") continue;
    if (kind === "EnumTypeDefinition") {
      coordinates.push({ typeName, fieldName: null, resolverKind: "enum" });
      continue;
    }
    for (const [fieldName, member] of Object.entries(
      value as Record<string, unknown>,
    )) {
      if (fieldName === "__resolveType") {
        coordinates.push({
          typeName,
          fieldName: null,
          resolverKind: "resolveType",
        });
        continue;
      }
      if (fieldName === "__isTypeOf") {
        coordinates.push({
          typeName,
          fieldName: null,
          resolverKind: "isTypeOf",
        });
        continue;
      }
      // A subscription field is an object of `subscribe` and optionally
      // `resolve`; their key order in that wrapper is preserved.
      if (member !== null && typeof member === "object") {
        for (const wrapperKey of Object.keys(
          member as Record<string, unknown>,
        )) {
          if (wrapperKey === "subscribe" || wrapperKey === "resolve") {
            coordinates.push({
              typeName,
              fieldName,
              resolverKind: wrapperKey,
            });
          }
        }
        continue;
      }
      coordinates.push({ typeName, fieldName, resolverKind: "field" });
    }
  }
  return coordinates;
}

/** The definition kind of every named type in a compatibility document. */
export function typeKindsOfDocument(
  document: LocationFreeGraphQLDocumentNode,
): ReadonlyMap<string, string> {
  const kinds = new Map<string, string>();
  for (const definition of document.definitions) {
    const named = definition as { kind?: string; name?: { value?: string } };
    if (typeof named.name?.value === "string" && named.kind !== undefined) {
      kinds.set(named.name.value, named.kind);
    }
  }
  return kinds;
}

/**
 * Compares what the factory produced with what the author declared.
 *
 * Reported rather than thrown: the schema is already serving, and a
 * disagreement here is a declaration that drifted, not a reason to refuse a
 * running subgraph.
 */
export function compareResolverCoordinates(
  declared: readonly ResolverCoordinateDefinition[],
  actual: readonly ResolverCoordinateDefinition[],
  path: readonly (string | number)[],
): readonly DefinitionDiagnostic[] {
  const encode = (coordinate: ResolverCoordinateDefinition) =>
    `${coordinate.typeName}.${coordinate.fieldName ?? "<type>"}:${coordinate.resolverKind}`;
  const declaredKeys = new Set(declared.map(encode));
  const actualKeys = new Set(actual.map(encode));

  const missing = [...actualKeys]
    .filter((key) => !declaredKeys.has(key))
    .sort(compareCodeUnits);
  const extra = [...declaredKeys]
    .filter((key) => !actualKeys.has(key))
    .sort(compareCodeUnits);

  return [
    ...missing.map((key) =>
      coordinateDiagnostic(
        path,
        `The resolver map binds ${key}, which the declaration does not list.`,
      ),
    ),
    ...extra.map((key) =>
      coordinateDiagnostic(
        path,
        `The declaration lists ${key}, which the resolver map does not bind.`,
      ),
    ),
  ];
}
