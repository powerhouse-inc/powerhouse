import type {
  DirectiveUseDefinition,
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
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import { foldTypeExtensions } from "../../kernel/graphql-ast.js";

/** graphql-js's reason for a bare `@deprecated`. */
const DEFAULT_DEPRECATION_REASON = "No longer supported";

export type GraphQLDefinitionNode =
  LocationFreeGraphQLDocumentNode["definitions"][number];

type NamedDefinitionNode = Extract<
  GraphQLDefinitionNode,
  {
    readonly kind:
      | "ObjectTypeDefinition"
      | "InterfaceTypeDefinition"
      | "InputObjectTypeDefinition"
      | "EnumTypeDefinition"
      | "UnionTypeDefinition";
  }
>;

const NAMED_TYPE_NODE =
  /^(?:Object|Interface|InputObject|Enum|Union)Type(?:Definition|Extension)$/;

function description(node: GraphQLStringValueNode | undefined): string | null {
  return node === undefined ? null : node.value;
}

function constValue(node: GraphQLConstValueNode): JsonValue {
  switch (node.kind) {
    case "IntValue":
    case "FloatValue":
      return Number(node.value);
    case "StringValue":
    case "EnumValue":
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
    case "NamedType":
      return {
        kind: declared.has(node.name.value) ? "named" : "scalar",
        name: node.name.value,
        required,
      };
  }
}

function directives(nodes: readonly GraphQLDirectiveNode[]): {
  readonly deprecated: string | null;
  readonly uses?: readonly DirectiveUseDefinition[];
} {
  const index = nodes.findIndex(
    (node) =>
      node.name.value === "deprecated" &&
      node.arguments.every(
        (argument) =>
          argument.name.value === "reason" &&
          argument.value.kind === "StringValue",
      ),
  );
  const reason = nodes[index]?.arguments[0]?.value as
    | GraphQLStringValueNode
    | undefined;
  const rest = nodes.filter((_, position) => position !== index);
  return {
    deprecated:
      index === -1 ? null : (reason?.value ?? DEFAULT_DEPRECATION_REASON),
    ...(rest.length > 0 && {
      uses: rest.map((node) => ({
        name: node.name.value,
        arguments: node.arguments.map((argument) => ({
          name: argument.name.value,
          value: constValue(argument.value),
        })),
      })),
    }),
  };
}

function inputField(
  node: GraphQLInputValueDefinitionNode,
  declared: ReadonlySet<string>,
): InputFieldDefinition {
  const { deprecated, uses } = directives(node.directives);
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
  const { deprecated, uses } = directives(node.directives);
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

function enumValue(
  node: Extract<
    GraphQLDefinitionNode,
    { kind: "EnumTypeDefinition" }
  >["values"][number],
): EnumValueDefinition {
  const { deprecated, uses } = directives(node.directives);
  return {
    name: node.name.value,
    description: description(node.description),
    deprecated,
    ...(uses !== undefined && { directives: uses }),
  };
}

function namedType(
  node: NamedDefinitionNode,
  declared: ReadonlySet<string>,
): NamedGraphQLTypeDefinition {
  switch (node.kind) {
    case "ObjectTypeDefinition":
    case "InterfaceTypeDefinition":
      return {
        kind: node.kind === "ObjectTypeDefinition" ? "object" : "interface",
        name: node.name.value,
        description: description(node.description),
        ...(node.interfaces.length > 0 && {
          implements: node.interfaces.map((entry) => entry.name.value),
        }),
        fields: node.fields.map((field) => outputField(field, declared)),
      };
    case "InputObjectTypeDefinition":
      return {
        kind: "input",
        name: node.name.value,
        description: description(node.description),
        unknownKeys: "preserve",
        fields: node.fields.map((field) => inputField(field, declared)),
      };
    case "EnumTypeDefinition":
      return {
        kind: "enum",
        name: node.name.value,
        description: description(node.description),
        values: node.values.map(enumValue),
      };
    case "UnionTypeDefinition":
      return {
        kind: "union",
        name: node.name.value,
        description: description(node.description),
        members: node.types.map((member) => member.name.value),
      };
  }
}

/** Names of the object, interface, input, enum and union types the nodes define or extend. */
export function declaredTypeNames(
  definitions: readonly GraphQLDefinitionNode[],
): ReadonlySet<string> {
  const declared = new Set<string>();
  for (const node of definitions) {
    if (NAMED_TYPE_NODE.test(node.kind) && "name" in node) {
      declared.add(node.name.value);
    }
  }
  return declared;
}

/**
 * Every object, interface, input, enum and union type the nodes define or
 * extend, with each extension folded into its type: defined types in
 * document order, then types the nodes only extend. A repeated definition or
 * member keeps its first occurrence; graphql-js validation reports the
 * repeat. A reference to a name in `declared` is a named type; any other
 * reference is a scalar.
 */
export function structuredTypes(
  definitions: readonly GraphQLDefinitionNode[],
  declared: ReadonlySet<string> = declaredTypeNames(definitions),
): readonly NamedGraphQLTypeDefinition[] {
  // A folded node is its first definition or extension with the member
  // nodes of every extension appended, under the definition's kind.
  return [...foldTypeExtensions(definitions, []).types.values()].map(
    ({ node }) => namedType(node as unknown as NamedDefinitionNode, declared),
  );
}

function namedTypeName(node: GraphQLTypeNode): string {
  return node.kind === "NamedType" ? node.name.value : namedTypeName(node.type);
}

/**
 * The type name every field and field argument of the nodes refers to,
 * extensions included, in document order and with repeats.
 */
export function referencedTypeNames(
  definitions: readonly GraphQLDefinitionNode[],
): readonly string[] {
  const names: string[] = [];
  for (const node of definitions) {
    if (!("fields" in node)) continue;
    for (const field of node.fields) {
      names.push(namedTypeName(field.type));
      for (const argument of "arguments" in field ? field.arguments : []) {
        names.push(namedTypeName(argument.type));
      }
    }
  }
  return names;
}
