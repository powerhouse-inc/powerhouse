import type {
  DefinitionDiagnostic,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  SubgraphDefinition,
} from "@powerhousedao/shared/document-model";
import { createDiagnostic } from "../diagnostics.js";
import { canonicalJson, compareCodeUnits } from "../primitives.js";
import { isRootTypeName, rootFor } from "./ast.js";

// `@key` is absent because Federation 1 uses it too. The v2 `@key` forms are
// detected by their arguments instead.
const FEDERATION_2_DIRECTIVES = new Set([
  "link",
  "shareable",
  "inaccessible",
  "override",
  "composeDirective",
  "interfaceObject",
  "authenticated",
  "requiresScopes",
  "policy",
]);

const FEDERATION_2_KEY_ARGUMENTS = new Set(["resolvable"]);

export type FederationCheckInput = {
  readonly directives: readonly {
    readonly name: string;
    readonly argumentNames: readonly string[];
    readonly path: readonly (string | number)[];
  }[];
};

/**
 * The typed API has no directive builder, so only a JavaScript caller or an
 * unchecked configuration can produce these. Powerhouse authoring is
 * Federation 1-shaped, and a partly supported Federation 2 surface gives an
 * author a schema that composes locally and fails elsewhere.
 */
export function checkFederationSurface(
  input: FederationCheckInput,
): readonly DefinitionDiagnostic[] {
  return input.directives.flatMap((directive) => {
    const isV2Directive = FEDERATION_2_DIRECTIVES.has(directive.name);
    const isV2Key =
      directive.name === "key" &&
      directive.argumentNames.some((argument) =>
        FEDERATION_2_KEY_ARGUMENTS.has(argument),
      );
    if (!isV2Directive && !isV2Key) return [];
    return [
      createDiagnostic({
        code: "PH-GQL-FEDERATION-UNSUPPORTED",
        path: directive.path.map(String),
        message: `@${directive.name} is Federation 2 authoring, which a typed declaration does not support.`,
        received: `@${directive.name}`,
        repair:
          'Declare this subgraph with schemaKind: "graphql-ast-compat", which preserves the AST and its composition behaviour exactly.',
      }),
    ];
  });
}

export function directiveUsesOfDocument(
  document: LocationFreeGraphQLDocumentNode,
): FederationCheckInput["directives"] {
  const uses: {
    name: string;
    argumentNames: string[];
    path: (string | number)[];
  }[] = [];
  const walk = (node: unknown, path: (string | number)[]): void => {
    if (Array.isArray(node)) {
      return node.forEach((member, index) => walk(member, [...path, index]));
    }
    if (node === null || typeof node !== "object") return;
    const record = node as Record<string, unknown>;
    if (record.kind === "Directive") {
      const named = record.name as { value?: unknown } | undefined;
      if (typeof named?.value === "string") {
        uses.push({
          name: named.value,
          argumentNames: (
            (record.arguments as readonly { name?: { value?: unknown } }[]) ??
            []
          ).flatMap((argument) =>
            typeof argument.name?.value === "string"
              ? [argument.name.value]
              : [],
          ),
          path,
        });
      }
    }
    for (const [key, member] of Object.entries(record)) {
      walk(member, [...path, key]);
    }
  };
  walk(document, ["typeDefs"]);
  return uses;
}

export type ComposedSubgraph = {
  readonly name: string;
  readonly types: readonly NamedGraphQLTypeDefinition[];
  /** Root fields this subgraph owns, as `Query.field`. */
  readonly coordinates: readonly string[];
};

export function composedSubgraphOf(
  definition: SubgraphDefinition,
): ComposedSubgraph {
  if (definition.schemaKind !== "typed") {
    return { name: definition.name, types: [], coordinates: [] };
  }
  return {
    name: definition.name,
    // Root fields are compared by coordinate. Two subgraphs that each add
    // their own `Query` fields define `Query` differently by design.
    types: definition.types.filter((type) => !isRootTypeName(type.name)),
    coordinates: definition.entries.flatMap((entry) =>
      entry.kind === "query" ||
      entry.kind === "mutation" ||
      entry.kind === "subscription"
        ? [`${rootFor(entry.kind)}.${entry.fieldName}`]
        : [],
    ),
  };
}

/**
 * Warnings only. The host excludes a subgraph whose schema fails to build and
 * lets Apollo compose the rest, and rejecting here would change which
 * subgraphs serve.
 */
export function reportCompositionPolicy(
  subgraphs: readonly ComposedSubgraph[],
): readonly DefinitionDiagnostic[] {
  return [
    ...ownedCoordinates(subgraphs),
    ...sharedDefinitionMismatches(subgraphs),
  ];
}

function ownedCoordinates(
  subgraphs: readonly ComposedSubgraph[],
): readonly DefinitionDiagnostic[] {
  const owners = new Map<string, string[]>();
  for (const subgraph of subgraphs) {
    for (const coordinate of subgraph.coordinates) {
      owners.set(coordinate, [
        ...(owners.get(coordinate) ?? []),
        subgraph.name,
      ]);
    }
  }
  return [...owners.entries()]
    .filter(([, names]) => names.length > 1)
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([coordinate, names]) =>
      createDiagnostic({
        code: "PH-GQL-COORDINATE-OWNED",
        path: ["composition", coordinate],
        message: `${coordinate} is owned by ${names.join(" and ")}.`,
        received: names.join(", "),
        repair: `Give ${coordinate} one owner, or rename it in all but one subgraph.`,
      }),
    );
}

function sharedDefinitionMismatches(
  subgraphs: readonly ComposedSubgraph[],
): readonly DefinitionDiagnostic[] {
  const shapes = new Map<string, Map<string, string[]>>();
  for (const subgraph of subgraphs) {
    for (const type of subgraph.types) {
      const byShape = shapes.get(type.name) ?? new Map<string, string[]>();
      // canonicalJson sorts object keys and keeps array order, so reordered
      // fields are a different shape and reordered object keys are not.
      const shape = canonicalJson(type);
      byShape.set(shape, [...(byShape.get(shape) ?? []), subgraph.name]);
      shapes.set(type.name, byShape);
    }
  }
  return [...shapes.entries()]
    .filter(([, byShape]) => byShape.size > 1)
    .sort(([left], [right]) => compareCodeUnits(left, right))
    .map(([name, byShape]) =>
      createDiagnostic({
        code: "PH-GQL-SHARED-DEFINITION-MISMATCH",
        path: ["composition", name],
        message: `${name} is defined differently by ${[...byShape.values()]
          .map((names) => names.join(" and "))
          .join("; ")}.`,
        received: `${byShape.size} shapes`,
        repair: `Make every definition of ${name} identical, or give each subgraph its own name for it.`,
      }),
    );
}
