import type {
  DefinitionPath,
  EnumValueDefinition,
  FieldDefinition,
  GraphQLConstValueNode,
  GraphQLDirectiveNode,
  GraphQLFieldDefinitionNode,
  GraphQLInputValueDefinitionNode,
  GraphQLStringValueNode,
  GraphQLTypeNode,
  InputFieldDefinition,
  JsonValue,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  ScalarName,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import type { DefinitionDiagnosticCollector } from "../diagnostics.js";
import { SCALAR_CATALOG_NAMES } from "../scalars/catalog.js";

/**
 * Turns a parsed schema-first document into V1 structured types.
 *
 * Only the descriptor grammar converts. Everything else — a schema
 * definition, a directive definition, a type extension, a scalar declaration,
 * a directive on a type — is reported as unrepresentable, and the adapter
 * answers that by retaining the complete AST as the GraphQL projection
 * instead of printing the reachable descriptor graph.
 */

const BUILT_IN_SCALARS = ["ID", "String", "Boolean", "Int", "Float"] as const;

const SCALARS: ReadonlySet<string> = new Set<string>([
  ...BUILT_IN_SCALARS,
  ...SCALAR_CATALOG_NAMES,
]);

export type UnrepresentableNode = {
  readonly path: DefinitionPath;
  readonly kind: string;
  readonly message: string;
};

export type StructuredTypesFromDocument = {
  /** One entry per named type definition, in document order. */
  readonly types: readonly NamedGraphQLTypeDefinition[];
  /** Nodes V1 descriptors cannot carry without loss. */
  readonly unrepresentable: readonly UnrepresentableNode[];
};

function description(node: GraphQLStringValueNode | undefined): string | null {
  return node === undefined ? null : node.value;
}

/**
 * A GraphQL const value as JSON. An enum token becomes its name; the printer
 * recovers the token from the field's type and the named-type inventory,
 * which is why a JSON value alone never has to carry that distinction.
 */
function constValue(node: GraphQLConstValueNode): JsonValue {
  switch (node.kind) {
    case "IntValue":
      return Number.parseInt(node.value, 10);
    case "FloatValue":
      return Number.parseFloat(node.value);
    case "StringValue":
    case "EnumValue":
      return node.value;
    case "BooleanValue":
      return node.value;
    case "NullValue":
      return null;
    case "ListValue":
      return node.values.map(constValue);
    case "ObjectValue":
      return Object.fromEntries(
        node.fields.map((field) => [field.name.value, constValue(field.value)]),
      );
  }
}

function typeReference(
  node: GraphQLTypeNode,
  declared: ReadonlySet<string>,
  required = false,
): TypeReferenceDefinition {
  switch (node.kind) {
    case "NonNullType":
      return typeReference(node.type, declared, true);
    case "ListType":
      return {
        kind: "list",
        required,
        item: typeReference(node.type, declared),
      };
    case "NamedType": {
      const name = node.name.value;
      // A declaration in the document wins: a model may declare a type whose
      // name a catalog scalar also uses.
      return declared.has(name)
        ? { kind: "named", name, required }
        : { kind: "scalar", name: name as ScalarName, required };
    }
  }
}

/** `@deprecated(reason: "...")` is the one directive the wire shape absorbs. */
function splitDeprecation(directives: readonly GraphQLDirectiveNode[]): {
  readonly deprecated: string | null;
  readonly rest: readonly GraphQLDirectiveNode[];
} {
  const index = directives.findIndex(
    (directive) =>
      directive.name.value === "deprecated" &&
      directive.arguments.length === 1 &&
      directive.arguments[0]?.name.value === "reason" &&
      directive.arguments[0].value.kind === "StringValue",
  );
  if (index === -1) return { deprecated: null, rest: directives };
  const argument = directives[index].arguments[0];
  return {
    deprecated: (argument.value as GraphQLStringValueNode).value,
    rest: [...directives.slice(0, index), ...directives.slice(index + 1)],
  };
}

function directiveUses(
  directives: readonly GraphQLDirectiveNode[],
): FieldDefinition["directives"] {
  if (directives.length === 0) return undefined;
  return directives.map((directive) => ({
    name: directive.name.value,
    arguments: directive.arguments.map((argument) => ({
      name: argument.name.value,
      value: constValue(argument.value),
    })),
  }));
}

function inputField(
  node: GraphQLInputValueDefinitionNode,
  declared: ReadonlySet<string>,
): InputFieldDefinition {
  const { deprecated, rest } = splitDeprecation(node.directives);
  const uses = directiveUses(rest);
  return {
    key: node.name.value,
    name: node.name.value,
    description: description(node.description),
    deprecated,
    type: typeReference(node.type, declared),
    ...(node.defaultValue !== undefined && {
      defaultValue: constValue(node.defaultValue),
    }),
    ...(uses !== undefined && { directives: uses }),
  };
}

function outputField(
  node: GraphQLFieldDefinitionNode,
  declared: ReadonlySet<string>,
): FieldDefinition {
  const { deprecated, rest } = splitDeprecation(node.directives);
  const uses = directiveUses(rest);
  return {
    key: node.name.value,
    name: node.name.value,
    description: description(node.description),
    deprecated,
    ...(node.arguments.length > 0 && {
      args: node.arguments.map((argument) => inputField(argument, declared)),
    }),
    type: typeReference(node.type, declared),
    ...(uses !== undefined && { directives: uses }),
  };
}

/** The names a document declares as named types, needed to resolve references. */
export function declaredTypeNames(
  document: LocationFreeGraphQLDocumentNode,
): ReadonlySet<string> {
  const names = new Set<string>();
  for (const node of document.definitions) {
    switch (node.kind) {
      case "ObjectTypeDefinition":
      case "InterfaceTypeDefinition":
      case "InputObjectTypeDefinition":
      case "EnumTypeDefinition":
      case "UnionTypeDefinition":
        names.add(node.name.value);
        break;
      default:
        break;
    }
  }
  return names;
}

export function structuredTypesFromDocument(
  document: LocationFreeGraphQLDocumentNode,
  declared: ReadonlySet<string>,
  path: DefinitionPath,
): StructuredTypesFromDocument {
  const types: NamedGraphQLTypeDefinition[] = [];
  const unrepresentable: UnrepresentableNode[] = [];

  document.definitions.forEach((node, index) => {
    const at = [...path, index];
    const typeDirectives = "directives" in node ? node.directives : [];
    if (typeDirectives.length > 0) {
      // A V1 named type carries no directive uses of its own.
      unrepresentable.push({
        path: at,
        kind: node.kind,
        message: `${node.kind} ${"name" in node ? node.name.value : ""} carries a directive, which a V1 named type cannot record.`,
      });
    }
    switch (node.kind) {
      case "ObjectTypeDefinition":
      case "InterfaceTypeDefinition":
        types.push({
          kind: node.kind === "ObjectTypeDefinition" ? "object" : "interface",
          name: node.name.value,
          description: description(node.description),
          ...(node.interfaces.length > 0 && {
            implements: node.interfaces.map((entry) => entry.name.value),
          }),
          fields: node.fields.map((field) => outputField(field, declared)),
        });
        return;
      case "InputObjectTypeDefinition":
        types.push({
          kind: "input",
          name: node.name.value,
          description: description(node.description),
          unknownKeys: "preserve",
          fields: node.fields.map((field) => inputField(field, declared)),
        });
        return;
      case "EnumTypeDefinition":
        types.push({
          kind: "enum",
          name: node.name.value,
          description: description(node.description),
          values: node.values.map((value): EnumValueDefinition => {
            const { deprecated, rest } = splitDeprecation(value.directives);
            const uses = directiveUses(rest);
            return {
              name: value.name.value,
              description: description(value.description),
              deprecated,
              ...(uses !== undefined && { directives: uses }),
            };
          }),
        });
        return;
      case "UnionTypeDefinition":
        types.push({
          kind: "union",
          name: node.name.value,
          description: description(node.description),
          members: node.types.map((member) => member.name.value),
        });
        return;
      default:
        unrepresentable.push({
          path: at,
          kind: node.kind,
          message: `${node.kind} is outside the V1 descriptor grammar.`,
        });
    }
  });

  return { types, unrepresentable };
}

/**
 * Reports a scalar reference the catalog does not carry. An unresolved scalar
 * stops normalization: the adapter cannot promise a model behaves the same
 * when it cannot say which coercion a field uses.
 */
export function checkScalarReferences(
  collector: DefinitionDiagnosticCollector,
  types: readonly NamedGraphQLTypeDefinition[],
  path: DefinitionPath,
): boolean {
  let resolved = true;
  const visit = (
    reference: TypeReferenceDefinition,
    at: DefinitionPath,
  ): void => {
    if (reference.kind === "list") {
      visit(reference.item, at);
      return;
    }
    if (reference.kind !== "scalar") return;
    if (SCALARS.has(reference.name)) return;
    resolved = false;
    // `PH-SCALAR-UNREGISTERED` is report-only and belongs to the host's
    // binding check in `reactor-api`. Here normalization stops, so the adapter
    // reports the failure that actually happened.
    collector.add({
      code: "PH-DM-DECLARATION-INVALID",
      path: at,
      message: `Scalar ${reference.name} is not in the compiler catalog, so its coercion is unknown.`,
      expected: [...SCALARS].join(" | "),
      received: reference.name,
      repair: `Declare ${reference.name} as a named type in the model, or replace it with a catalog scalar.`,
    });
  };
  types.forEach((type, index) => {
    const at = [...path, index];
    if (type.kind === "enum" || type.kind === "union") return;
    type.fields.forEach((field, fieldIndex) => {
      const fieldPath = [...at, "fields", fieldIndex];
      visit(field.type, fieldPath);
      if ("args" in field) {
        field.args?.forEach((argument, argumentIndex) =>
          visit(argument.type, [...fieldPath, "args", argumentIndex]),
        );
      }
    });
  });
  return resolved;
}
