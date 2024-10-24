/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-return */
import { pascalCase } from "change-case";
import { Operation } from "document-model/document-model";
import {
  extendSchema,
  getNullableType,
  GraphQLSchema,
  GraphQLType,
  InputObjectTypeDefinitionNode,
  isEnumType,
  isListType,
  isObjectType,
  isScalarType,
  Kind,
  ObjectTypeDefinitionNode,
  parse,
  print,
} from "graphql";
import { DocumentModelDocument, Scope } from "../types";

export function makeStateObject(modelName: string, scope: Scope) {
  const name = makeStateObjectName(modelName, scope);
  const inputNode: ObjectTypeDefinitionNode = {
    kind: Kind.OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    fields: [
      {
        description: {
          kind: Kind.STRING,
          value: `Add your ${scope} state fields here`,
          block: false,
        },
        kind: Kind.FIELD_DEFINITION,
        name: { kind: Kind.NAME, value: "_placeholder" },
        type: {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: "String" },
        },
      },
    ],
  };

  return print(inputNode);
}

export function makeEmptyInputObject(name: string) {
  const inputNode: InputObjectTypeDefinitionNode = {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: name,
    },
    fields: [
      {
        description: {
          kind: Kind.STRING,
          value: "Add your inputs here",
          block: false,
        },
        kind: Kind.INPUT_VALUE_DEFINITION,
        name: { kind: Kind.NAME, value: "_placeholder" },
        type: {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: "String" },
        },
      },
    ],
  };

  return print(inputNode);
}

export function makeOperationInputName(operationName: string) {
  return `${pascalCase(operationName)}Input`;
}

export function makeStateObjectName(modelName: string, scope: string) {
  return `${pascalCase(modelName)}${scope === "local" ? "Local" : ""}State`;
}

export function makeOperationInitialDoc(operation: Operation) {
  if (operation.schema) return operation.schema;
  if (!operation.name) {
    throw new Error("Operation name is required");
  }
  const name = makeOperationInputName(operation.name);
  const inputObject = makeEmptyInputObject(name);
  return inputObject;
}

export function makeStateInitialDoc(
  stateSchema: string,
  modelName: string,
  scope: Scope,
) {
  if (stateSchema) return stateSchema;
  const stateObject = makeStateObject(modelName, scope);
  return stateObject;
}

export function makeSchemaStringFromDocs(docs: Record<string, string>) {
  return Object.values(docs).join("\n");
}

export function getDocumentMetadata(document: DocumentModelDocument) {
  const globalState = document.state.global;
  return {
    name: document.name ?? "",
    documentType: document.documentType ?? "",
    description: globalState.description ?? "",
    extension: globalState.extension ?? "",
    author: {
      name: globalState.author.name ?? "",
      website: globalState.author.website ?? "",
    },
  };
}

export function getDifferences<T extends object>(
  obj1: T | undefined | null,
  obj2: Partial<T> | undefined | null,
): Partial<T> {
  if (!obj1 || !obj2) return {};

  const differences: Partial<T> = {};

  function isObject(value: any): value is object {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  const compare = (value1: any, value2: any): boolean => {
    if (isObject(value1) && isObject(value2)) {
      // Convert both objects to JSON strings to compare them as a whole.
      const keys1 = Object.keys(value1).sort();
      const keys2 = Object.keys(value2).sort();
      if (
        JSON.stringify(keys1) !== JSON.stringify(keys2) ||
        keys1.some((key) =>
          compare(
            value1[key as keyof typeof value1],
            value2[key as keyof typeof value1],
          ),
        )
      ) {
        return true; // Any difference in object structure or value means they're different.
      }
      return false;
    } else if (Array.isArray(value1) && Array.isArray(value2)) {
      // For arrays, compare their serialized forms.
      return JSON.stringify(value1) !== JSON.stringify(value2);
    } else {
      // For primitives, compare directly.
      return value1 !== value2;
    }
  };

  for (const key of new Set([...Object.keys(obj1), ...Object.keys(obj2)])) {
    if (
      compare(obj1[key as keyof typeof obj1], obj2[key as keyof typeof obj2])
    ) {
      differences[key as keyof typeof differences] =
        obj2[key as keyof typeof obj2];
    }
  }

  return Object.entries(differences).reduce<Partial<T>>((acc, [key, value]) => {
    if (value !== undefined) {
      // @ts-expect-error generic cannot be inferred
      acc[key] = value;
    }
    return acc;
  }, {});
}

function getMinimalValue(type: GraphQLType, schema: GraphQLSchema) {
  const nullableType = getNullableType(type);

  if (isScalarType(nullableType)) {
    const typeName = nullableType.name;
    switch (typeName) {
      case "Int":
      case "Float":
        return 0;
      case "Boolean":
        return false;
      case "DateTime":
        return new Date().toISOString();
      case "ID":
      case "String":
      default:
        return ""; // Return empty string for custom scalars and String/ID types
    }
  }

  if (isEnumType(nullableType)) {
    return nullableType.getValues()[0]?.value || null;
  }

  if (isListType(nullableType)) {
    return [];
  }

  if (isObjectType(nullableType)) {
    const result: Record<string, any> = {};
    const fields = nullableType.getFields();
    for (const fieldName in fields) {
      const field = fields[fieldName];
      result[fieldName] = getMinimalValue(field.type, schema);
    }
    return result;
  }

  // Handle other types like InterfaceType, UnionType as needed
  return null;
}

export function makeMinimalObjectFromSDL(schema: GraphQLSchema, sdl: string) {
  const typeAST = parse(sdl);
  const extendedSchema = extendSchema(schema, typeAST);

  // Extract the type names from the SDL
  const typeNames: string[] = [];
  typeAST.definitions.forEach((def) => {
    if (
      def.kind === Kind.OBJECT_TYPE_DEFINITION ||
      def.kind === Kind.OBJECT_TYPE_EXTENSION
    ) {
      typeNames.push(def.name.value);
    }
  });

  if (typeNames.length === 0) {
    throw new Error("No object type definition found in SDL.");
  }

  // Assuming there's only one type definition in the SDL
  const typeName = typeNames[0];
  const type = extendedSchema.getType(typeName);

  if (!type || !isObjectType(type)) {
    throw new Error(`Type "${typeName}" is not a valid ObjectType.`);
  }

  return JSON.stringify(getMinimalValue(type, extendedSchema));
}
