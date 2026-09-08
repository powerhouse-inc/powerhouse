import type {
  DirectiveUseDefinitionV1,
  FieldDefinitionV1,
  DocumentModelSpecificationDefinitionV1,
  GraphQLConstValueNodeV1,
  GraphQLDirectiveNodeV1,
  GraphQLFieldDefinitionNodeV1,
  GraphQLInputValueDefinitionNodeV1,
  GraphQLNameNodeV1,
  GraphQLTypeNodeV1,
  InputFieldDefinitionV1,
  JsonValue,
  LocationFreeGraphQLDocumentNodeV1,
  NamedGraphQLTypeDefinitionV1,
  SubgraphDefinitionV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import { snapshotDataArray, snapshotDataRecord } from "../data-properties.js";
import { failDefinition } from "../diagnostics.js";
import {
  emptyInterfacePlaceholderNames,
  emptyTypePlaceholderName,
  expandedInterfaceNames,
} from "../printer.js";

const TYPE_SYSTEM_KINDS = new Set([
  "SchemaDefinition",
  "ScalarTypeDefinition",
  "ObjectTypeDefinition",
  "InterfaceTypeDefinition",
  "UnionTypeDefinition",
  "EnumTypeDefinition",
  "InputObjectTypeDefinition",
  "DirectiveDefinition",
  "SchemaExtension",
  "ScalarTypeExtension",
  "ObjectTypeExtension",
  "InterfaceTypeExtension",
  "UnionTypeExtension",
  "EnumTypeExtension",
  "InputObjectTypeExtension",
]);

const name = (value: string): GraphQLNameNodeV1 => ({ kind: "Name", value });

function description(value: string | null) {
  return value === null
    ? {}
    : {
        description: {
          kind: "StringValue" as const,
          value,
          block: false,
        },
      };
}

function valueNode(value: JsonValue): GraphQLConstValueNodeV1 {
  if (value === null) return { kind: "NullValue" };
  if (typeof value === "string") return { kind: "StringValue", value };
  if (typeof value === "boolean") return { kind: "BooleanValue", value };
  if (typeof value === "number") {
    return Number.isInteger(value)
      ? { kind: "IntValue", value: String(value) }
      : { kind: "FloatValue", value: String(value) };
  }
  if (Array.isArray(value)) {
    return { kind: "ListValue", values: value.map(valueNode) };
  }
  return {
    kind: "ObjectValue",
    fields: Object.entries(value).map(([key, item]) => ({
      kind: "ObjectField",
      name: name(key),
      value: valueNode(item),
    })),
  };
}

function defaultValueNode(
  value: JsonValue,
  type: TypeReferenceDefinitionV1,
  enumNames: ReadonlySet<string>,
): GraphQLConstValueNodeV1 {
  if (value === null) return valueNode(value);
  if (type.kind === "list") {
    if (Array.isArray(value)) {
      const items = value as readonly JsonValue[];
      return {
        kind: "ListValue",
        values: items.map((item) =>
          defaultValueNode(item, type.item, enumNames),
        ),
      };
    }
    return defaultValueNode(value, type.item, enumNames);
  }
  if (
    type.kind === "named" &&
    enumNames.has(type.name) &&
    typeof value === "string"
  ) {
    return { kind: "EnumValue", value };
  }
  return valueNode(value);
}

function directiveNodes(
  directives: readonly DirectiveUseDefinitionV1[] | undefined,
  deprecated: string | null,
): readonly GraphQLDirectiveNodeV1[] {
  const result: GraphQLDirectiveNodeV1[] = (directives ?? []).map(
    (directive) => ({
      kind: "Directive",
      name: name(directive.name),
      arguments: directive.arguments.map((argument) => ({
        kind: "Argument",
        name: name(argument.name),
        value: valueNode(argument.value),
      })),
    }),
  );
  if (deprecated !== null) {
    result.push({
      kind: "Directive",
      name: name("deprecated"),
      arguments: [
        {
          kind: "Argument",
          name: name("reason"),
          value: { kind: "StringValue", value: deprecated },
        },
      ],
    });
  }
  return result;
}

function typeNode(type: TypeReferenceDefinitionV1): GraphQLTypeNodeV1 {
  const nullable: GraphQLTypeNodeV1 =
    type.kind === "list"
      ? { kind: "ListType", type: typeNode(type.item) }
      : { kind: "NamedType", name: name(type.name) };
  return type.required
    ? {
        kind: "NonNullType",
        type: nullable as Extract<
          GraphQLTypeNodeV1,
          { readonly kind: "NamedType" | "ListType" }
        >,
      }
    : nullable;
}

function inputField(
  field: InputFieldDefinitionV1,
  enumNames: ReadonlySet<string>,
): GraphQLInputValueDefinitionNodeV1 {
  return {
    kind: "InputValueDefinition",
    ...description(field.description),
    name: name(field.name),
    type: typeNode(field.type),
    ...(Object.hasOwn(field, "defaultValue")
      ? {
          defaultValue: defaultValueNode(
            field.defaultValue as JsonValue,
            field.type,
            enumNames,
          ),
        }
      : {}),
    directives: directiveNodes(field.directives, field.deprecated),
  };
}

function outputField(
  field: FieldDefinitionV1,
  enumNames: ReadonlySet<string>,
): GraphQLFieldDefinitionNodeV1 {
  return {
    kind: "FieldDefinition",
    ...description(field.description),
    name: name(field.name),
    arguments: (field.args ?? []).map((argument) =>
      inputField(argument, enumNames),
    ),
    type: typeNode(field.type),
    directives: directiveNodes(field.directives, field.deprecated),
  };
}

function placeholderOutputField(
  fieldName: string,
): GraphQLFieldDefinitionNodeV1 {
  return {
    kind: "FieldDefinition",
    name: name(fieldName),
    arguments: [],
    type: { kind: "NamedType", name: name("Boolean") },
    directives: [],
  };
}

function placeholderInputField(
  fieldName: string,
): GraphQLInputValueDefinitionNodeV1 {
  return {
    kind: "InputValueDefinition",
    name: name(fieldName),
    type: { kind: "NamedType", name: name("Boolean") },
    directives: [],
  };
}

function namedDefinition(
  definition: NamedGraphQLTypeDefinitionV1,
  enumNames: ReadonlySet<string>,
  emptyInterfaces: ReadonlyMap<string, string>,
  definitions: readonly NamedGraphQLTypeDefinitionV1[],
) {
  switch (definition.kind) {
    case "enum":
      return {
        kind: "EnumTypeDefinition" as const,
        ...description(definition.description),
        name: name(definition.name),
        directives: [],
        values: definition.values.map((value) => ({
          kind: "EnumValueDefinition" as const,
          ...description(value.description),
          name: name(value.name),
          directives: directiveNodes(value.directives, value.deprecated),
        })),
      };
    case "object": {
      const interfaceNames = expandedInterfaceNames(definition, definitions);
      const fields = definition.fields.map((field) =>
        outputField(field, enumNames),
      );
      for (const interfaceName of interfaceNames) {
        const placeholder = emptyInterfaces.get(interfaceName);
        if (placeholder) fields.push(placeholderOutputField(placeholder));
      }
      if (fields.length === 0) {
        fields.push(placeholderOutputField(emptyTypePlaceholderName(null)));
      }
      return {
        kind: "ObjectTypeDefinition" as const,
        ...description(definition.description),
        name: name(definition.name),
        interfaces: interfaceNames.map((value) => ({
          kind: "NamedType" as const,
          name: name(value),
        })),
        directives: [],
        fields,
      };
    }
    case "interface": {
      const interfaceNames = expandedInterfaceNames(definition, definitions);
      const fields = definition.fields.map((field) =>
        outputField(field, enumNames),
      );
      for (const interfaceName of interfaceNames) {
        const placeholder = emptyInterfaces.get(interfaceName);
        if (placeholder) fields.push(placeholderOutputField(placeholder));
      }
      if (definition.fields.length === 0) {
        fields.push(
          placeholderOutputField(
            emptyInterfaces.get(definition.name) ??
              emptyTypePlaceholderName(definition.name),
          ),
        );
      }
      return {
        kind: "InterfaceTypeDefinition" as const,
        ...description(definition.description),
        name: name(definition.name),
        interfaces: interfaceNames.map((value) => ({
          kind: "NamedType" as const,
          name: name(value),
        })),
        directives: [],
        fields,
      };
    }
    case "input": {
      const fields = definition.fields.map((field) =>
        inputField(field, enumNames),
      );
      if (fields.length === 0) {
        fields.push(placeholderInputField(emptyTypePlaceholderName(null)));
      }
      return {
        kind: "InputObjectTypeDefinition" as const,
        ...description(definition.description),
        name: name(definition.name),
        directives: [],
        fields,
      };
    }
    case "union":
      return {
        kind: "UnionTypeDefinition" as const,
        ...description(definition.description),
        name: name(definition.name),
        directives: [],
        types: definition.members.map((value) => ({
          kind: "NamedType" as const,
          name: name(value),
        })),
      };
  }
}

/** Builds enum-aware, location-free AST nodes for structured named types. */
export function buildNamedTypeDefinitions(
  definitions: readonly NamedGraphQLTypeDefinitionV1[],
): readonly LocationFreeGraphQLDocumentNodeV1["definitions"][number][] {
  const enumNames = new Set(
    definitions.filter(({ kind }) => kind === "enum").map(({ name }) => name),
  );
  const emptyInterfaces = emptyInterfacePlaceholderNames(definitions);
  return definitions.map((definition) =>
    namedDefinition(definition, enumNames, emptyInterfaces, definitions),
  );
}

/** Builds the type-only AST stored in a document-model specification. */
export function buildSpecificationTypeDocument(
  specification: DocumentModelSpecificationDefinitionV1 | undefined,
): LocationFreeGraphQLDocumentNodeV1 {
  if (!specification) return { kind: "Document", definitions: [] };
  const definitions = [...specification.types];
  const names = new Set(definitions.map(({ name }) => name));
  for (const operation of specification.modules.flatMap(
    ({ operations }) => operations,
  )) {
    if (operation.input && !names.has(operation.input.name)) {
      definitions.push(operation.input);
      names.add(operation.input.name);
    }
  }
  return {
    kind: "Document",
    definitions: buildNamedTypeDefinitions(definitions),
  };
}

export function buildTypedSubgraphDocument(
  definition: Extract<SubgraphDefinitionV1, { readonly schemaKind: "typed" }>,
): LocationFreeGraphQLDocumentNodeV1 {
  const definitions: LocationFreeGraphQLDocumentNodeV1["definitions"][number][] =
    [];
  const enumNames = new Set(
    definition.types
      .filter(({ kind }) => kind === "enum")
      .map(({ name }) => name),
  );

  for (const scalar of definition.scalars) {
    definitions.push({
      kind: "ScalarTypeDefinition",
      name: name(scalar.name),
      directives: [],
    });
  }
  definitions.push(...buildNamedTypeDefinitions(definition.types));

  const roots = [
    ["query", "Query"],
    ["mutation", "Mutation"],
    ["subscription", "Subscription"],
  ] as const;
  for (const [entryKind, rootName] of roots) {
    const entries = definition.entries.filter(
      (
        entry,
      ): entry is Extract<
        (typeof definition.entries)[number],
        { readonly kind: typeof entryKind }
      > => entry.kind === entryKind,
    );
    if (entries.length === 0) continue;
    definitions.push({
      kind: "ObjectTypeDefinition",
      name: name(rootName),
      interfaces: [],
      directives: [],
      fields: entries.map((entry) =>
        outputField(
          {
            key: entry.key,
            name: entry.fieldName,
            description: entry.description,
            deprecated: null,
            args: entry.args,
            type: entry.returns,
          },
          enumNames,
        ),
      ),
    });
  }

  return { kind: "Document", definitions };
}

function cloneLocationFree(
  value: unknown,
  path: readonly (string | number)[],
  ancestors: ReadonlySet<object>,
): unknown {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) return value;
    return failDefinition({
      code: "PH-GQL-AST-NON-JSON",
      path,
      message: "A GraphQL compatibility AST must contain finite numbers.",
      received: String(value),
      repair: "Pass a parsed GraphQL DocumentNode without non-JSON numbers.",
    });
  }
  if (value === undefined) {
    return failDefinition({
      code: "PH-GQL-AST-NON-JSON",
      path,
      message:
        "A GraphQL compatibility AST cannot contain undefined array values.",
      repair: "Pass the JSON-safe arrays returned by the GraphQL parser.",
    });
  }
  if (typeof value !== "object") {
    return failDefinition({
      code: "PH-GQL-AST-NON-JSON",
      path,
      message: "A GraphQL compatibility AST must contain JSON-safe values.",
      received: typeof value,
      repair: "Pass a parsed GraphQL DocumentNode without runtime values.",
    });
  }
  if (ancestors.has(value)) {
    return failDefinition({
      code: "PH-GQL-AST-CYCLE",
      path,
      message: "A GraphQL compatibility AST cannot contain a cycle.",
      repair: "Pass the acyclic DocumentNode returned by the GraphQL parser.",
    });
  }
  const nextAncestors = new Set(ancestors).add(value);
  const inspectedArray = snapshotDataArray(value);
  if (inspectedArray.ok) {
    return inspectedArray.value.map((item, index) =>
      cloneLocationFree(item, [...path, index], nextAncestors),
    );
  }
  if (inspectedArray.reason !== "not-array") {
    return failDefinition({
      code: "PH-GQL-AST-NON-JSON",
      path:
        inspectedArray.key === undefined
          ? path
          : [
              ...path,
              typeof inspectedArray.key === "number"
                ? inspectedArray.key
                : String(inspectedArray.key),
            ],
      message: "A GraphQL compatibility AST must contain dense stable arrays.",
      repair: "Pass the dense arrays returned by the GraphQL parser.",
    });
  }
  const inspected = snapshotDataRecord(value, { ignoreNonEnumerable: true });
  if (!inspected.ok) {
    return failDefinition({
      code: "PH-GQL-AST-NON-JSON",
      path:
        inspected.key === undefined
          ? path
          : [
              ...path,
              typeof inspected.key === "number"
                ? inspected.key
                : String(inspected.key),
            ],
      message:
        "A GraphQL compatibility AST must contain stable plain data objects.",
      repair: "Pass the plain data objects returned by the GraphQL parser.",
    });
  }
  const result = Object.create(null) as Record<string, unknown>;
  for (const [key, item] of Object.entries(inspected.value)) {
    if (key === "loc" || item === undefined) continue;
    result[key] = cloneLocationFree(item, [...path, key], nextAncestors);
  }
  return result;
}

export function toLocationFreeDocument(
  document: unknown,
): LocationFreeGraphQLDocumentNodeV1 {
  const snapshot = cloneLocationFree(
    document,
    ["compatibility", "typeDefs"],
    new Set(),
  );
  if (
    snapshot === null ||
    typeof snapshot !== "object" ||
    (snapshot as { readonly kind?: unknown }).kind !== "Document" ||
    !Array.isArray((snapshot as { readonly definitions?: unknown }).definitions)
  ) {
    return failDefinition({
      code: "PH-GQL-AST-DOCUMENT-INVALID",
      path: ["compatibility", "typeDefs"],
      message: "GraphQL compatibility mode requires a DocumentNode.",
      repair: "Parse the authored SDL and pass its DocumentNode as typeDefs.",
    });
  }
  const definitions = (
    snapshot as {
      readonly definitions: readonly { readonly kind?: unknown }[];
    }
  ).definitions;
  for (let index = 0; index < definitions.length; index += 1) {
    const kind = definitions[index]?.kind;
    if (typeof kind !== "string" || !TYPE_SYSTEM_KINDS.has(kind)) {
      return failDefinition({
        code: "PH-GQL-AST-DEFINITION-UNSUPPORTED",
        path: ["compatibility", "typeDefs", "definitions", index],
        message:
          "Compatibility typeDefs may contain only GraphQL type-system definitions and extensions.",
        received: String(kind),
        repair:
          "Remove executable operations and fragments from the schema document.",
      });
    }
  }
  return snapshot as LocationFreeGraphQLDocumentNodeV1;
}
