import type {
  DefinitionDiagnostic,
  JsonValue,
  ScalarValidationProfile,
} from "@powerhousedao/shared/document-model";
import {
  createDiagnostic,
  literalFromJson,
  type ScalarBinding,
  type ScalarLiteralNode,
  scalarCatalog,
} from "document-model";
import {
  type DocumentNode,
  GraphQLError,
  GraphQLScalarType,
  Kind,
  type ValueNode,
} from "graphql";
import { GraphQLJSON, GraphQLJSONObject } from "graphql-type-json";

/**
 * Document validation resolves scalars through the catalog under
 * `document-engineering-1.40`. Widening that profile changes replay. GraphQL
 * resolves the same names through the resolvers the host installs, which cover
 * two names. The rest use GraphQL's default pass-through. The diagnostics here
 * only report. They never change admission or the installed resolvers.
 */

/** The profile document creation, reducer input, and replay resolve through. */
const DOCUMENT_VALIDATION_PROFILE: ScalarValidationProfile =
  "document-engineering-1.40";

/**
 * The two scalar coercers the host installs. Callers spread them after the
 * authored resolvers, so they override an authored resolver of the same name.
 * Every other catalog scalar uses GraphQL's default pass-through. Existing
 * clients depend on both behaviors, and `test/goldens/host-scalar-bindings.json`
 * pins them.
 */
export const HOST_SCALAR_RESOLVERS = Object.freeze({
  JSONObject: GraphQLJSONObject,
  Unknown: GraphQLJSON,
});

/**
 * Builds the GraphQL scalar for a package scalar, served under `name` with the
 * package's own coercion. That coercion is the only validation a subgraph
 * argument gets. A package scalar has no existing clients to stay compatible
 * with, so it never uses GraphQL's default pass-through.
 */
function packageScalarType(
  binding: ScalarBinding,
  name: string,
): GraphQLScalarType {
  const { definition, coercion } = binding;
  const coerce = (run: () => unknown): unknown => {
    try {
      return run();
    } catch (error) {
      // A derived literal coercion already names the scalar.
      const detail = reason(error);
      throw new GraphQLError(
        detail.startsWith(`${definition.name} `)
          ? detail
          : `${definition.name} cannot represent this value: ${detail}`,
      );
    }
  };
  return new GraphQLScalarType({
    name,
    description: definition.description,
    serialize: (value) => coerce(() => coercion.serialize(value)),
    parseValue: (value) => coerce(() => coercion.parseValue(value)),
    parseLiteral: (node, variables) => {
      const literal = scalarLiteral(node, variables);
      // graphql-js calls parseLiteral during validation without variables. A
      // literal that nests a variable is coerced again at execution, when the
      // variables exist.
      if (literal === UNRESOLVED) return null;
      return coerce(() => coercion.parseLiteral(literal));
    },
  });
}

/** One resolver per package scalar, keyed by the name it is served under. */
export function packageScalarResolvers(
  scalars: readonly {
    readonly name: string;
    readonly binding: ScalarBinding;
  }[],
): Readonly<Record<string, GraphQLScalarType>> {
  return Object.fromEntries(
    scalars.map(({ name, binding }) => [
      name,
      packageScalarType(binding, name),
    ]),
  );
}

function reason(error: unknown): string {
  const issues = (error as { issues?: unknown }).issues;
  if (Array.isArray(issues)) {
    return issues
      .map((issue) => String((issue as { message?: unknown }).message))
      .join("; ");
  }
  return error instanceof Error ? error.message : String(error);
}

/** A literal nesting a variable, read before any variables exist. */
const UNRESOLVED = Symbol("unresolved variable");

/** The variables graphql-js passes `parseLiteral`; none while validating. */
type LiteralVariables = Readonly<Record<string, unknown>> | null | undefined;

/**
 * Converts a graphql-js literal into the `ScalarLiteralNode` form a
 * declaration's `parseLiteral` reads. graphql-js passes nested variables
 * unresolved, so this function resolves them. The declaration then reads the
 * same value whether the client inlined it or passed a variable. An absent
 * variable drops its object field and becomes null in a list.
 */
function scalarLiteral(
  node: ValueNode,
  variables: LiteralVariables,
): ScalarLiteralNode | typeof UNRESOLVED {
  switch (node.kind) {
    case Kind.STRING:
      return { kind: "string", value: node.value };
    case Kind.INT:
      return { kind: "int", value: node.value };
    case Kind.FLOAT:
      return { kind: "float", value: node.value };
    case Kind.BOOLEAN:
      return { kind: "boolean", value: node.value };
    case Kind.NULL:
      return { kind: "null" };
    case Kind.ENUM:
      return { kind: "enum", value: node.value };
    case Kind.LIST: {
      const values: ScalarLiteralNode[] = [];
      for (const item of node.values) {
        const value = nestedLiteral(item, variables);
        if (value === UNRESOLVED) return UNRESOLVED;
        values.push(value ?? { kind: "null" });
      }
      return { kind: "list", values };
    }
    case Kind.OBJECT: {
      const fields: { name: string; value: ScalarLiteralNode }[] = [];
      for (const field of node.fields) {
        const value = nestedLiteral(field.value, variables);
        if (value === UNRESOLVED) return UNRESOLVED;
        if (value !== undefined) fields.push({ name: field.name.value, value });
      }
      return { kind: "object", fields };
    }
    case Kind.VARIABLE:
      // graphql-js resolves a variable in the scalar's own position itself.
      return { kind: "variable", name: node.name.value };
  }
}

/** A member of a list or object literal; `undefined` for an absent variable. */
function nestedLiteral(
  node: ValueNode,
  variables: LiteralVariables,
): ScalarLiteralNode | typeof UNRESOLVED | undefined {
  if (node.kind !== Kind.VARIABLE) return scalarLiteral(node, variables);
  if (variables === undefined || variables === null) return UNRESOLVED;
  const value = variables[node.name.value];
  return value === undefined ? undefined : literalFromJson(value as JsonValue);
}

function scalarNames(typeDefs: DocumentNode): readonly string[] {
  const names = new Set<string>();
  for (const definition of typeDefs.definitions) {
    if (definition.kind === Kind.SCALAR_TYPE_DEFINITION) {
      names.add(definition.name.value);
    }
  }
  return [...names].sort();
}

/**
 * Report-only diagnostics for an assembled subgraph module. `authoredResolvers`
 * is the author's map before the host spreads its own two resolvers over it.
 * Passing the merged map would report the host's bindings as shadowed on every
 * boot. `packageScalars` names the package scalars bound to their own
 * coercion.
 */
export function reportScalarBindings(
  typeDefs: DocumentNode,
  authoredResolvers: Readonly<Record<string, unknown>>,
  packageScalars: ReadonlySet<string>,
): readonly DefinitionDiagnostic[] {
  const diagnostics: DefinitionDiagnostic[] = [];
  const known = new Set<string>(scalarCatalog.names);

  for (const name of scalarNames(typeDefs)) {
    if (known.has(name) || packageScalars.has(name)) continue;
    diagnostics.push(
      createDiagnostic({
        code: "PH-SCALAR-UNREGISTERED",
        definition: { kind: "scalar", key: name },
        path: ["typeDefs", name],
        message: `The subgraph SDL declares scalar ${name}, which the catalog has no metadata for.`,
        expected: [...scalarCatalog.names].sort().join(", "),
        received: name,
        repair:
          "Add the scalar to the compiler-owned catalog, or keep it host-local and accept GraphQL's default pass-through for it.",
      }),
    );
  }

  const hostBound = new Set(Object.keys(HOST_SCALAR_RESOLVERS));
  for (const key of Object.keys(authoredResolvers).sort()) {
    if (!known.has(key)) continue;
    const repair = hostBound.has(key)
      ? `The host installs its own ${key} resolver last, so this one is discarded. Rename it, or remove it and rely on the host's.`
      : `Rename the resolver, or accept that it binds ${key} for GraphQL while document validation keeps resolving it through ${DOCUMENT_VALIDATION_PROFILE}.`;
    diagnostics.push(
      createDiagnostic({
        code: "PH-SCALAR-RESOLVER-SHADOWED",
        definition: { kind: "scalar", key },
        path: ["resolvers", key],
        message: hostBound.has(key)
          ? `An authored resolver is keyed by ${key}, which the host binds itself.`
          : `An authored resolver is keyed by the catalog scalar name ${key}.`,
        received: key,
        repair,
      }),
    );
  }

  return diagnostics;
}

/**
 * Diagnostic keys already logged in this process. The host rebuilds every
 * subgraph module on each router update. Without this set, an unchanged
 * finding would log again on every package or drive registration.
 */
const reported = new Set<string>();

/** Returns the findings not yet reported in this process and marks them reported. */
export function unreportedScalarBindings(
  typeDefs: DocumentNode,
  authoredResolvers: Readonly<Record<string, unknown>>,
  packageScalars: ReadonlySet<string>,
): readonly DefinitionDiagnostic[] {
  return reportScalarBindings(
    typeDefs,
    authoredResolvers,
    packageScalars,
  ).filter((diagnostic) => {
    const key = `${diagnostic.code}:${diagnostic.definition?.key ?? ""}`;
    if (reported.has(key)) return false;
    reported.add(key);
    return true;
  });
}

/** Forgets what has been reported. For a test that composes more than once. */
export function forgetReportedScalarBindings(): void {
  reported.clear();
}
