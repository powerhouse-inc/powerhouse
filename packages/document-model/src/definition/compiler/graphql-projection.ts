import type {
  DirectiveUseDefinition,
  DocumentModelDefinition,
  DocumentModelSpecificationDefinition,
  EnumTypeDefinition,
  FieldDefinition,
  GraphQLConstValueNode,
  GraphQLDirectiveNode,
  GraphQLInputValueDefinitionNode,
  GraphQLNamedTypeNode,
  GraphQLNameNode,
  GraphQLStringValueNode,
  GraphQLTypeNode,
  GraphQLTypeSystemDefinitionNode,
  InputFieldDefinition,
  JsonValue,
  LocationFreeGraphQLDocumentNode,
  NamedGraphQLTypeDefinition,
  PackageScalarReferenceDefinition,
  TypeReferenceDefinition,
} from "@powerhousedao/shared/document-model";
import {
  compareCodeUnits,
  EMPTY_INPUT_FIELD_NAME,
} from "../kernel/primitives.js";
import { blockStringable } from "../kernel/printer.js";
import { assignStoredSegments } from "./segments.js";

type GraphQLSegment = {
  readonly root: string;
  readonly document: LocationFreeGraphQLDocumentNode;
};

export type DocumentModelGraphQLProjection = {
  readonly graphQLName: string;
  readonly global: GraphQLSegment;
  readonly local: GraphQLSegment | null;
  readonly modules: readonly {
    readonly key: string;
    readonly name: string;
    readonly operations: readonly {
      readonly key: string;
      readonly name: string;
      readonly actionType: string;
      readonly creatorKey: string;
      readonly scope: "global" | "local";
      readonly input: LocationFreeGraphQLDocumentNode | null;
    }[];
  }[];
  readonly packageScalars: readonly PackageScalarReferenceDefinition[];
};

type Inventory = ReadonlyMap<string, NamedGraphQLTypeDefinition>;

const nameNode = (value: string): GraphQLNameNode => ({ kind: "Name", value });

const namedType = (name: string): GraphQLNamedTypeNode => ({
  kind: "NamedType",
  name: nameNode(name),
});

const stringValue = (value: string, block = false): GraphQLStringValueNode => ({
  kind: "StringValue",
  value,
  block,
});

type DescriptionForm = "printed" | "argument-inline";

function description(
  value: string | null,
  form: DescriptionForm = "printed",
): { readonly description?: GraphQLStringValueNode } {
  return value === null
    ? {}
    : {
        description: stringValue(
          value,
          form === "printed" && blockStringable(value),
        ),
      };
}

function typeNode(type: TypeReferenceDefinition): GraphQLTypeNode {
  const base =
    type.kind === "list"
      ? { kind: "ListType" as const, type: typeNode(type.item) }
      : namedType(type.name);
  return type.required ? { kind: "NonNullType", type: base } : base;
}

function numberValue(value: number): GraphQLConstValueNode {
  if (!Number.isFinite(value)) {
    throw new TypeError(
      `A GraphQL value must be finite, received ${String(value)}.`,
    );
  }
  const printed = JSON.stringify(value);
  return /[.eE]/.test(printed)
    ? { kind: "FloatValue", value: printed }
    : { kind: "IntValue", value: printed };
}

function literalValue(value: JsonValue): GraphQLConstValueNode {
  if (value === null) return { kind: "NullValue" };
  if (typeof value === "boolean") return { kind: "BooleanValue", value };
  if (typeof value === "number") return numberValue(value);
  if (typeof value === "string") return stringValue(value);
  if (Array.isArray(value)) {
    return { kind: "ListValue", values: value.map(literalValue) };
  }
  return objectValue(value as Readonly<Record<string, JsonValue>>, (member) =>
    literalValue(member),
  );
}

function objectValue(
  value: Readonly<Record<string, JsonValue>>,
  member: (value: JsonValue, key: string) => GraphQLConstValueNode,
): GraphQLConstValueNode {
  return {
    kind: "ObjectValue",
    fields: Object.entries(value).map(([key, entry]) => ({
      kind: "ObjectField",
      name: nameNode(key),
      value: member(entry, key),
    })),
  };
}

function enumMember(definition: EnumTypeDefinition, value: string): boolean {
  return definition.values.some((candidate) => candidate.name === value);
}

function typedValue(
  value: JsonValue,
  type: TypeReferenceDefinition,
  inventory: Inventory,
): GraphQLConstValueNode {
  if (value === null) return { kind: "NullValue" };
  if (type.kind === "list") {
    return Array.isArray(value)
      ? {
          kind: "ListValue",
          values: (value as readonly JsonValue[]).map((item) =>
            typedValue(item, type.item, inventory),
          ),
        }
      : typedValue(value, type.item, inventory);
  }
  if (type.kind === "scalar") return literalValue(value);
  const definition = inventory.get(type.name);
  if (definition?.kind === "enum") {
    return typeof value === "string" && enumMember(definition, value)
      ? { kind: "EnumValue", value }
      : literalValue(value);
  }
  if (
    definition?.kind !== "input" ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return literalValue(value);
  }
  const fields = new Map(definition.fields.map((field) => [field.name, field]));
  return objectValue(
    value as Readonly<Record<string, JsonValue>>,
    (member, key) => {
      const field = fields.get(key);
      return field === undefined
        ? literalValue(member)
        : typedValue(member, field.type, inventory);
    },
  );
}

function directiveNodes(
  deprecated: string | null,
  directives: readonly DirectiveUseDefinition[] | undefined,
): readonly GraphQLDirectiveNode[] {
  const used: GraphQLDirectiveNode[] = (directives ?? []).map((directive) => ({
    kind: "Directive",
    name: nameNode(directive.name),
    arguments: directive.arguments.map((argument) => ({
      kind: "Argument",
      name: nameNode(argument.name),
      value: literalValue(argument.value),
    })),
  }));
  if (deprecated === null) return used;
  return [
    {
      kind: "Directive",
      name: nameNode("deprecated"),
      arguments: [
        {
          kind: "Argument",
          name: nameNode("reason"),
          value: stringValue(deprecated),
        },
      ],
    },
    ...used,
  ];
}

function inputValueNode(
  field: InputFieldDefinition,
  inventory: Inventory,
  form: DescriptionForm,
): GraphQLInputValueDefinitionNode {
  return {
    kind: "InputValueDefinition",
    ...description(field.description, form),
    name: nameNode(field.name),
    type: typeNode(field.type),
    ...(Object.hasOwn(field, "defaultValue") && {
      defaultValue: typedValue(
        field.defaultValue as JsonValue,
        field.type,
        inventory,
      ),
    }),
    directives: directiveNodes(field.deprecated, field.directives),
  };
}

const EMPTY_INPUT_FIELD: GraphQLInputValueDefinitionNode = {
  kind: "InputValueDefinition",
  name: nameNode(EMPTY_INPUT_FIELD_NAME),
  type: namedType("Boolean"),
  directives: [],
};

function fieldNodes(fields: readonly FieldDefinition[], inventory: Inventory) {
  return fields.map((field) => ({
    kind: "FieldDefinition" as const,
    ...description(field.description),
    name: nameNode(field.name),
    arguments: (field.args ?? []).map((argument) =>
      inputValueNode(argument, inventory, "argument-inline"),
    ),
    type: typeNode(field.type),
    directives: directiveNodes(field.deprecated, field.directives),
  }));
}

function definitionNode(
  definition: NamedGraphQLTypeDefinition,
  inventory: Inventory,
): GraphQLTypeSystemDefinitionNode {
  const named = {
    ...description(definition.description),
    name: nameNode(definition.name),
    directives: [],
  };
  switch (definition.kind) {
    case "enum":
      return {
        kind: "EnumTypeDefinition",
        ...named,
        values: definition.values.map((value) => ({
          kind: "EnumValueDefinition",
          ...description(value.description),
          name: nameNode(value.name),
          directives: directiveNodes(value.deprecated, value.directives),
        })),
      };
    case "object":
    case "interface":
      return {
        kind:
          definition.kind === "object"
            ? "ObjectTypeDefinition"
            : "InterfaceTypeDefinition",
        ...named,
        interfaces: (definition.implements ?? []).map(namedType),
        fields: fieldNodes(definition.fields, inventory),
      };
    case "input":
      return {
        kind: "InputObjectTypeDefinition",
        ...named,
        fields:
          definition.fields.length === 0
            ? [EMPTY_INPUT_FIELD]
            : definition.fields.map((field) =>
                inputValueNode(field, inventory, "printed"),
              ),
      };
    case "union":
      return {
        kind: "UnionTypeDefinition",
        ...named,
        types: definition.members.map(namedType),
      };
  }
}

function isPackageScalar(
  scalar: DocumentModelSpecificationDefinition["scalars"][number],
): scalar is PackageScalarReferenceDefinition {
  return scalar.implementation.startsWith("package#");
}

/**
 * Projects a specification into the GraphQL documents its stored SDL
 * segments parse to: `print(segment.document)` equals
 * `print(parse(storedSegment))` for the state schemas and each operation's
 * `schema` that `materialize` stores.
 */
export function projectDocumentModelGraphQL(
  definition: DocumentModelDefinition,
  specification: DocumentModelSpecificationDefinition,
): DocumentModelGraphQLProjection {
  const { types } = specification;
  const inventory: Inventory = new Map(types.map((type) => [type.name, type]));
  const document = (
    definitions: readonly NamedGraphQLTypeDefinition[],
  ): LocationFreeGraphQLDocumentNode => ({
    kind: "Document",
    definitions: definitions.map((type) => definitionNode(type, inventory)),
  });

  const globalRoot = specification.state.global.root.name;
  const localRoot = specification.state.local.root?.name ?? null;
  const operationKey = (moduleKey: string, key: string) =>
    `${moduleKey}/${key}`;
  const segments = assignStoredSegments({
    types,
    globalRoot,
    localRoot,
    operations: specification.modules.flatMap((module) =>
      module.operations.map((operation) => ({
        key: operationKey(module.key, operation.key),
        input: operation.input,
      })),
    ),
  });

  const packageScalars = specification.scalars.filter(isPackageScalar);
  const global = document(segments.global);
  return {
    graphQLName: definition.model.graphQLName,
    global: {
      root: globalRoot,
      document: {
        kind: "Document",
        definitions: [
          ...packageScalars
            .map(({ name }) => name)
            .sort(compareCodeUnits)
            .map((name): GraphQLTypeSystemDefinitionNode => ({
              kind: "ScalarTypeDefinition",
              name: nameNode(name),
              directives: [],
            })),
          ...global.definitions,
        ],
      },
    },
    local:
      localRoot === null
        ? null
        : { root: localRoot, document: document(segments.local) },
    modules: specification.modules.map((module) => ({
      key: module.key,
      name: module.name,
      operations: module.operations.map((operation) => ({
        key: operation.key,
        name: operation.name ?? operation.actionType,
        actionType: operation.actionType,
        creatorKey: operation.creatorKey,
        scope: operation.scope,
        input:
          operation.input === null
            ? null
            : document(
                segments.operations.get(
                  operationKey(module.key, operation.key),
                ) ?? [operation.input],
              ),
      })),
    })),
    packageScalars,
  };
}
