import type {
  DefinitionDiagnosticV1,
  DefinitionSourceV1,
  GraphQLTypeSystemDefinitionNodeV1,
  GraphQLTypeSystemExtensionNodeV1,
  JsonValue,
  SubgraphDefinitionV1,
} from "@powerhousedao/shared/document-model";
import { buildTypedSubgraphDocument } from "../definition/subgraph/ast.js";
import {
  canonicalJson,
  compareCodeUnits,
  isRecord,
} from "../definition/primitives.js";

type AstDefinition =
  | GraphQLTypeSystemDefinitionNodeV1
  | GraphQLTypeSystemExtensionNodeV1;

export type SubgraphCompositionPolicyInput = {
  readonly source: DefinitionSourceV1;
  readonly path: readonly (string | number)[];
  readonly definition: SubgraphDefinitionV1;
};

type PolicyDefinition = {
  readonly name: string;
  readonly kind: string;
  readonly signature: string;
  readonly path: readonly (string | number)[];
};

type PolicyCoordinate = {
  readonly coordinate: string;
  readonly path: readonly (string | number)[];
};

type PolicyProjection = {
  readonly input: SubgraphCompositionPolicyInput;
  readonly definitions: readonly PolicyDefinition[];
  readonly coordinates: readonly PolicyCoordinate[];
};

const FIELD_DEFINITION_KINDS = new Set([
  "ObjectTypeDefinition",
  "ObjectTypeExtension",
  "InterfaceTypeDefinition",
  "InterfaceTypeExtension",
]);

function withPath(
  base: readonly (string | number)[],
  suffix: readonly (string | number)[],
): readonly (string | number)[] {
  return [...base, ...suffix];
}

function astName(definition: AstDefinition): string | undefined {
  if (!("name" in definition)) return undefined;
  return definition.name.value;
}

function normalizedDefinitionKind(kind: string): string {
  return kind.endsWith("Extension")
    ? `${kind.slice(0, -"Extension".length)}Definition`
    : kind;
}

function policyDefinition(
  definition: AstDefinition,
  path: readonly (string | number)[],
): PolicyDefinition | undefined {
  const name = astName(definition);
  if (!name) return undefined;
  const kind = normalizedDefinitionKind(definition.kind);
  return {
    name,
    kind,
    signature: canonicalJson({ ...definition, kind } as unknown as JsonValue),
    path,
  };
}

function fieldCoordinates(
  definition: AstDefinition,
  path: readonly (string | number)[],
): readonly PolicyCoordinate[] {
  if (!FIELD_DEFINITION_KINDS.has(definition.kind) || !("name" in definition))
    return [];
  if (!("fields" in definition) || !Array.isArray(definition.fields)) return [];
  return definition.fields.flatMap((field, index) =>
    isRecord(field) &&
    isRecord(field.name) &&
    typeof field.name.value === "string"
      ? [
          {
            coordinate: `${definition.name.value}.${field.name.value}`,
            path: [...path, "fields", index],
          },
        ]
      : [],
  );
}

function typedProjection(
  input: SubgraphCompositionPolicyInput,
): PolicyProjection {
  if (input.definition.schemaKind !== "typed") {
    throw new TypeError("Expected a typed subgraph definition.");
  }
  const definition = input.definition;
  const document = buildTypedSubgraphDocument(definition);
  const namedDefinitionCount =
    definition.scalars.length + definition.types.length;
  const definitions = document.definitions
    .slice(0, namedDefinitionCount)
    .flatMap((node, index) => {
      const path =
        index < definition.scalars.length
          ? withPath(input.path, ["scalars", index])
          : withPath(input.path, ["types", index - definition.scalars.length]);
      const projected = policyDefinition(node, path);
      return projected ? [projected] : [];
    });
  const coordinates = new Map<string, PolicyCoordinate>();
  for (let typeIndex = 0; typeIndex < definition.types.length; typeIndex += 1) {
    const type = definition.types[typeIndex]!;
    if (type.kind !== "object" && type.kind !== "interface") continue;
    type.fields.forEach((field, fieldIndex) => {
      const coordinate = `${type.name}.${field.name}`;
      coordinates.set(coordinate, {
        coordinate,
        path: withPath(input.path, ["types", typeIndex, "fields", fieldIndex]),
      });
    });
  }
  definition.entries.forEach((entry, entryIndex) => {
    let coordinate: string | undefined;
    if (
      entry.kind === "query" ||
      entry.kind === "mutation" ||
      entry.kind === "subscription"
    ) {
      const root =
        entry.kind === "query"
          ? "Query"
          : entry.kind === "mutation"
            ? "Mutation"
            : "Subscription";
      coordinate = `${root}.${entry.fieldName}`;
    } else if (entry.kind === "field") {
      coordinate = `${entry.target.typeName}.${entry.target.fieldName}`;
    }
    if (coordinate && !coordinates.has(coordinate)) {
      coordinates.set(coordinate, {
        coordinate,
        path: withPath(input.path, ["entries", entryIndex]),
      });
    }
  });
  return { input, definitions, coordinates: [...coordinates.values()] };
}

function compatibilityProjection(
  input: SubgraphCompositionPolicyInput,
): PolicyProjection {
  if (input.definition.schemaKind !== "graphql-ast-compat") {
    throw new TypeError(
      "Expected a GraphQL compatibility subgraph definition.",
    );
  }
  const definitions: PolicyDefinition[] = [];
  const coordinates = new Map<string, PolicyCoordinate>();
  input.definition.document.definitions.forEach((definition, index) => {
    const path = withPath(input.path, ["document", "definitions", index]);
    const projected = policyDefinition(definition, path);
    if (projected) definitions.push(projected);
    for (const coordinate of fieldCoordinates(definition, path)) {
      if (!coordinates.has(coordinate.coordinate)) {
        coordinates.set(coordinate.coordinate, coordinate);
      }
    }
  });
  input.definition.resolverCoordinates.forEach((resolver, index) => {
    if (resolver.fieldName === null) return;
    const coordinate = `${resolver.typeName}.${resolver.fieldName}`;
    if (!coordinates.has(coordinate)) {
      coordinates.set(coordinate, {
        coordinate,
        path: withPath(input.path, ["resolverCoordinates", index]),
      });
    }
  });
  return { input, definitions, coordinates: [...coordinates.values()] };
}

function compareInputs(
  left: SubgraphCompositionPolicyInput,
  right: SubgraphCompositionPolicyInput,
): number {
  const source = compareCodeUnits(
    canonicalJson(left.source as unknown as JsonValue),
    canonicalJson(right.source as unknown as JsonValue),
  );
  return (
    source || compareCodeUnits(left.definition.name, right.definition.name)
  );
}

function warning(
  code: "PH-GQL-COORDINATE-OWNED" | "PH-GQL-SHARED-DEFINITION-MISMATCH",
  current: PolicyProjection,
  path: readonly (string | number)[],
  message: string,
  repair: string,
  first: PolicyProjection,
  firstPath: readonly (string | number)[],
): DefinitionDiagnosticV1 {
  return {
    code,
    severity: "warning",
    phase: "composition",
    source: current.input.source,
    definition: { kind: "subgraph", key: current.input.definition.name },
    path,
    message,
    repair,
    related: [
      {
        source: first.input.source,
        path: firstPath,
        message: `The first declaration is owned by subgraph ${JSON.stringify(first.input.definition.name)}.`,
      },
    ],
  };
}

/** Reports the stricter PH-COMP-1 policy without changing core-v1 admission. */
export function subgraphCompositionPolicyDiagnostics(
  inputs: readonly SubgraphCompositionPolicyInput[],
): readonly DefinitionDiagnosticV1[] {
  const uniqueByName = new Map<string, SubgraphCompositionPolicyInput>();
  for (const input of [...inputs].sort(compareInputs)) {
    if (!uniqueByName.has(input.definition.name))
      uniqueByName.set(input.definition.name, input);
  }
  const projections = [...uniqueByName.values()].map((input) =>
    input.definition.schemaKind === "typed"
      ? typedProjection(input)
      : compatibilityProjection(input),
  );
  const diagnostics: DefinitionDiagnosticV1[] = [];
  const coordinates = new Map<
    string,
    {
      readonly projection: PolicyProjection;
      readonly coordinate: PolicyCoordinate;
    }
  >();
  const definitions = new Map<
    string,
    {
      readonly projection: PolicyProjection;
      readonly definition: PolicyDefinition;
    }
  >();

  for (const projection of projections) {
    for (const coordinate of projection.coordinates) {
      const first = coordinates.get(coordinate.coordinate);
      if (!first) {
        coordinates.set(coordinate.coordinate, { projection, coordinate });
        continue;
      }
      diagnostics.push(
        warning(
          "PH-GQL-COORDINATE-OWNED",
          projection,
          coordinate.path,
          `GraphQL coordinate ${JSON.stringify(coordinate.coordinate)} is owned by more than one subgraph under PH-COMP-1.`,
          "Assign the coordinate to one subgraph before enforcing PH-COMP-1.",
          first.projection,
          first.coordinate.path,
        ),
      );
    }

    for (const definition of projection.definitions) {
      const namespace =
        definition.kind === "DirectiveDefinition" ? "directive" : "type";
      const key = `${namespace}\u0000${definition.name}`;
      const first = definitions.get(key);
      if (!first) {
        definitions.set(key, { projection, definition });
        continue;
      }
      const bothObjects =
        definition.kind === "ObjectTypeDefinition" &&
        first.definition.kind === "ObjectTypeDefinition";
      if (bothObjects || definition.signature === first.definition.signature)
        continue;
      diagnostics.push(
        warning(
          "PH-GQL-SHARED-DEFINITION-MISMATCH",
          projection,
          definition.path,
          `Shared GraphQL ${namespace} ${JSON.stringify(definition.name)} differs between subgraphs under PH-COMP-1.`,
          `Make every shared ${namespace} declaration identical before enforcing PH-COMP-1.`,
          first.projection,
          first.definition.path,
        ),
      );
    }
  }
  return diagnostics;
}
