import { constantCase, pascalCase } from "change-case";
import {
  GraphQLSchema,
  isScalarType,
  isObjectType,
  GraphQLType,
  FieldDefinitionNode,
  DocumentNode,
  visit,
  InputObjectTypeDefinitionNode,
  InputValueDefinitionNode,
  GraphQLObjectType,
  isNonNullType,
  isListType,
  getNullableType,
  print,
} from "graphql";
import {
  GraphQLNamedType,
  NamedTypeNode,
  NonNullTypeNode,
  ListTypeNode,
  TypeNode,
  Kind,
} from "graphql";
import { singular } from "pluralize";
import { toConstantCase, uuid } from "./utils";
import { Scope, OperationNode, OperationType } from "../types/modules";

export function generateGraphQLTypeAST(args: {
  typeName: string;
  isList: boolean;
  isNonNull: boolean;
  schema: GraphQLSchema;
}): TypeNode {
  const { typeName, isList, isNonNull, schema } = args;
  let baseTypeNode: NamedTypeNode | null = null;

  // Helper function to create a NamedTypeNode from a given name
  const createNamedTypeNode = (name: string): NamedTypeNode => ({
    kind: Kind.NAMED_TYPE,
    name: { kind: Kind.NAME, value: name },
  });

  // Handle built-in types by creating the corresponding NamedTypeNode
  switch (typeName) {
    case "String":
    case "Int":
    case "Boolean":
    case "Float":
    case "ID":
      baseTypeNode = createNamedTypeNode(typeName);
      break;
    default: {
      // For custom types, we look up the type in the schema
      const typeFromSchema = schema.getType(
        typeName,
      ) as GraphQLNamedType | null;

      if (typeFromSchema) {
        baseTypeNode = createNamedTypeNode(typeName);
      } else {
        throw new Error(`Unsupported type: ${typeName}`);
      }
    }
  }

  // Now we construct the AST node based on whether it's a list and/or non-nullable
  let finalTypeNode: TypeNode = baseTypeNode;

  // Handle list types (the items in the list are always non-null)
  if (isList) {
    finalTypeNode = {
      kind: Kind.LIST_TYPE,
      type: {
        kind: Kind.NON_NULL_TYPE,
        type: baseTypeNode,
      },
    } as ListTypeNode;
  }

  // Wrap the type (or list) in GraphQLNonNull if it's non-nullable
  if (isNonNull) {
    finalTypeNode = {
      kind: Kind.NON_NULL_TYPE,
      type: finalTypeNode,
    } as NonNullTypeNode;
  }

  return finalTypeNode;
}

export function getObjectTypeFields(schema: GraphQLSchema, typeName: string) {
  const type = schema.getType(typeName);

  if (type && isObjectType(type)) {
    const fields = type.getFields();
    return fields;
  }
}

export function makeFieldDefinitionNode(args: {
  fieldName: string;
  fieldType: string;
  schema: GraphQLSchema;
  isList: boolean;
  isNonNull: boolean;
}): FieldDefinitionNode {
  const { fieldName, fieldType, schema, isList, isNonNull } = args;
  const type = generateGraphQLTypeAST({
    typeName: fieldType,
    isList,
    isNonNull,
    schema,
  });
  return {
    kind: Kind.FIELD_DEFINITION,
    name: { kind: Kind.NAME, value: fieldName },
    type,
  };
}

export function addFieldToObjectTypeDefinition(args: {
  nodeName: string;
  ast: DocumentNode;
  newField: FieldDefinitionNode;
}): DocumentNode {
  const { nodeName, ast, newField } = args;
  return visit(ast, {
    ObjectTypeDefinition(node) {
      if (node.name.value === nodeName) {
        return {
          ...node,
          fields: [...(node.fields || []), newField],
        };
      }
      return undefined;
    },
  });
}

export function makeOperationNodesForStateField(args: {
  fieldName: string;
  fieldType: GraphQLType;
  scope: Scope;
}): OperationNode[] {
  const { fieldName, fieldType, scope } = args;
  const nullableType = getNullableType(fieldType);
  if (isScalarType(nullableType)) {
    const operationName = toConstantCase(`SET_${constantCase(fieldName)}`);
    const node = makeInputForScalarField({
      fieldName,
      fieldType,
    });
    return [
      {
        id: uuid(),
        doc: print(node),
        operationName,
        node,
        scope,
      },
    ];
  }

  if (isListType(nullableType)) {
    const inputs: OperationNode[] = [];
    const listInputs = makeInputsForListField({
      fieldName,
      fieldType,
    });
    for (const [actionType, node] of Object.entries(listInputs)) {
      const operationName = toConstantCase(
        `${actionType}_${constantCase(singular(fieldName))}`,
      );
      inputs.push({
        id: uuid(),
        doc: print(node),
        operationName,
        node,
        scope,
      });
    }

    return inputs;
  }

  if (!isListType(nullableType) && isObjectType(nullableType)) {
    const operationName = toConstantCase(`SET_${constantCase(fieldName)}`);
    const node = makeInputForObjectField({
      fieldName,
      fieldType: fieldType as GraphQLObjectType,
    });

    return [
      {
        id: uuid(),
        doc: print(node),
        operationName,
        node,
        scope,
      },
    ];
  }

  return [];
}

export function makeInputForScalarField(args: {
  fieldName: string;
  fieldType: GraphQLType;
}): InputObjectTypeDefinitionNode {
  const { fieldName, fieldType } = args;

  const namedTypeNode: NamedTypeNode = {
    kind: Kind.NAMED_TYPE,
    name: { kind: Kind.NAME, value: fieldType.toString() },
  };

  const valueTypeNode = isNonNullType(fieldType)
    ? ({
        kind: Kind.NON_NULL_TYPE,
        type: namedTypeNode,
      } as NonNullTypeNode)
    : namedTypeNode;

  const valueField: InputValueDefinitionNode = {
    kind: Kind.INPUT_VALUE_DEFINITION,
    name: { kind: Kind.NAME, value: "value" },
    type: valueTypeNode,
  };

  const inputTypeNode: InputObjectTypeDefinitionNode = {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: `Set${pascalCase(fieldName)}Input` },
    fields: [valueField],
  };

  return inputTypeNode;
}

export function makeInputForObjectField(args: {
  fieldName: string;
  fieldType: GraphQLObjectType;
}): InputObjectTypeDefinitionNode {
  const { fieldName, fieldType } = args;

  const typeFields = fieldType.getFields();

  // Map object type fields to input fields (InputValueDefinitionNode)
  const inputFields = Object.keys(typeFields).map((fieldName) => {
    const field = typeFields[fieldName];

    return {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: { kind: Kind.NAME, value: fieldName },
      type: {
        kind: Kind.NAMED_TYPE,
        name: { kind: Kind.NAME, value: field.type.toString() },
      },
    } as InputValueDefinitionNode;
  });

  const inputTypeNode = {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: `Set${pascalCase(fieldName)}Input` },
    fields: inputFields,
  } as InputObjectTypeDefinitionNode;

  return inputTypeNode;
}

export function makeInputsForListField(args: {
  fieldName: string;
  fieldType: GraphQLType;
}): {
  create?: InputObjectTypeDefinitionNode;
  edit?: InputObjectTypeDefinitionNode;
  delete?: InputObjectTypeDefinitionNode;
} {
  const { fieldName, fieldType } = args;

  const namedTypeNode = {
    kind: Kind.NAMED_TYPE,
    name: { kind: Kind.NAME, value: fieldType.toString() },
  } as const;

  const nonNullIdType = {
    kind: Kind.NON_NULL_TYPE,
    type: {
      kind: Kind.NAMED_TYPE,
      name: { kind: Kind.NAME, value: "ID" },
    },
  } as const;

  if (isObjectType(fieldType)) {
    {
      const typeFields = fieldType.getFields();

      const createFields: InputValueDefinitionNode[] = Object.keys(typeFields)
        .filter((fieldName) => fieldName !== "id")
        .map((fieldName) => {
          const field = typeFields[fieldName];
          return {
            kind: Kind.INPUT_VALUE_DEFINITION,
            name: { kind: Kind.NAME, value: fieldName },
            type: {
              kind: Kind.NON_NULL_TYPE,
              type: {
                kind: Kind.NAMED_TYPE,
                name: { kind: Kind.NAME, value: field.type.toString() },
              },
            },
          };
        });

      const createObjectInput: InputObjectTypeDefinitionNode = {
        kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
        name: { kind: Kind.NAME, value: `Create${pascalCase(fieldName)}Input` },
        fields: createFields,
      };

      const editFields = Object.keys(typeFields).map((fieldName) => {
        const field = typeFields[fieldName];
        if (fieldName === "id") {
          return {
            kind: Kind.INPUT_VALUE_DEFINITION,
            name: { kind: Kind.NAME, value: "id" },
            type: nonNullIdType,
          };
        }
        return {
          kind: Kind.INPUT_VALUE_DEFINITION,
          name: { kind: Kind.NAME, value: fieldName },
          type: {
            kind: Kind.NAMED_TYPE,
            name: { kind: Kind.NAME, value: field.type.toString() },
          },
        };
      }) as InputValueDefinitionNode[];

      const editObjectInput: InputObjectTypeDefinitionNode = {
        kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
        name: { kind: Kind.NAME, value: `Edit${pascalCase(fieldName)}Input` },
        fields: editFields,
      };

      const deleteObjectInput: InputObjectTypeDefinitionNode = {
        kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
        name: { kind: Kind.NAME, value: `Delete${pascalCase(fieldName)}Input` },
        fields: [
          {
            kind: Kind.INPUT_VALUE_DEFINITION,
            name: { kind: Kind.NAME, value: "id" },
            type: nonNullIdType,
          },
        ],
      };

      return {
        create: createObjectInput,
        edit: editObjectInput,
        delete: deleteObjectInput,
      };
    }
  }

  const createScalarInput: InputObjectTypeDefinitionNode = {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: `Create${pascalCase(fieldName)}Input` },
    fields: [
      {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: { kind: Kind.NAME, value: "value" },
        type: namedTypeNode,
      },
    ],
  };

  const deleteScalarInput: InputObjectTypeDefinitionNode = {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: { kind: Kind.NAME, value: `Delete${pascalCase(fieldName)}Input` },
    fields: [
      {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: { kind: Kind.NAME, value: "value" },
        type: namedTypeNode,
      },
    ],
  };

  return {
    create: createScalarInput,
    delete: deleteScalarInput,
  };
}

export function makeOperationName(
  inputName: string,
  operationType: OperationType,
) {
  return toConstantCase(`${operationType}_${constantCase(inputName)}`);
}

export function makeOperationContent(args: {
  inputName: string;
  inputType: string;
  operationType: OperationType;
}) {
  const { inputName, inputType, operationType } = args;
  const name = makeOperationName(inputName, operationType);
  const inputNode: InputObjectTypeDefinitionNode = {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: `${pascalCase(operationType)}${pascalCase(inputName)}Input`,
    },
    fields: [
      {
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: { kind: Kind.NAME, value: "value" },
        type: {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: inputType },
        },
      },
    ],
  };
  const doc = print(inputNode);
  return {
    name,
    doc,
  };
}
