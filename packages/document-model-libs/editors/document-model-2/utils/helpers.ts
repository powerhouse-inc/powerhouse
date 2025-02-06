import { pascalCase } from "change-case";
import { Author, DocumentModelDocument } from "document-model/document-model";
import {
  buildASTSchema,
  extendSchema,
  getNullableType,
  GraphQLScalarType,
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
  visit,
} from "graphql";
import { Scope } from "../types/documents.js";
import * as customScalars from "@powerhousedao/scalars";

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

export function makeOperationInitialDoc(name: string) {
  const inputName = makeOperationInputName(name);
  const inputObject = makeEmptyInputObject(inputName);
  return inputObject;
}

export function makeInitialSchemaDoc(modelName: string, scope: Scope) {
  const stateObject = makeStateObject(modelName, scope);
  return stateObject;
}

export function makeSchemaStringFromDocs(docs: Record<string, string>) {
  return Object.values(docs).join("\n");
}

export function getDocumentMetadata(document: DocumentModelDocument) {
  const globalState = document.state.global;
  const author: Author = {
    name: globalState.author.name,
    website: globalState.author.website,
  };
  return {
    name: globalState.name,
    documentType: globalState.id,
    description: globalState.description,
    extension: globalState.extension,
    author,
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
function isValidScalarValue(typeName: string, value: any): boolean {
  if (typeName in customScalars) {
    const scalar = customScalars[typeName as keyof typeof customScalars];
    if (scalar instanceof GraphQLScalarType) {
      return scalar.parseValue(value) !== undefined;
    }
  }
  switch (typeName) {
    case "Int":
      return Number.isInteger(value);
    case "Float":
      return typeof value === "number";
    case "Boolean":
      return typeof value === "boolean";
    case "DateTime":
      return typeof value === "string" && !isNaN(Date.parse(value));
    case "ID":
    case "String":
    default:
      return typeof value === "string";
  }
}

function getMinimalValue(
  type: GraphQLType,
  schema: GraphQLSchema,
  existingValue?: any,
) {
  const nullableType = getNullableType(type);

  if (isScalarType(nullableType)) {
    const typeName = nullableType.name;
    if (
      existingValue !== undefined &&
      isValidScalarValue(typeName, existingValue)
    ) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return existingValue;
    }
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
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    const enumValues = nullableType.getValues().map((v) => v.value);
    if (existingValue !== undefined && enumValues.includes(existingValue)) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
      return existingValue;
    }
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return enumValues[0] || null;
  }

  if (isListType(nullableType)) {
    if (existingValue !== undefined && Array.isArray(existingValue)) {
      // Optionally, validate each element in the array
      return existingValue;
    }
    return [];
  }

  if (isObjectType(nullableType)) {
    const result: Record<string, any> = {};
    const fields = nullableType.getFields();
    const _existingValue = existingValue as Record<string, any> | undefined;
    for (const fieldName in fields) {
      const field = fields[fieldName];
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const existingFieldValue = _existingValue
        ? _existingValue[fieldName]
        : undefined;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      result[fieldName] = getMinimalValue(
        field.type,
        schema,
        existingFieldValue,
      );
    }
    return result;
  }

  // Handle other types like InterfaceType, UnionType as needed
  return null;
}

export function makeMinimalObjectFromSDL(
  schemaSdl: string,
  sdl: string,
  existingValue?: any,
) {
  const schema = buildASTSchema(parse(schemaSdl));
  const typeAST = parse(sdl);

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
  let type = schema.getType(typeName);

  let effectiveSchema = schema;

  if (!type || !isObjectType(type)) {
    // Type doesn't exist in the schema, extend the schema
    effectiveSchema = extendSchema(schema, typeAST);
    type = effectiveSchema.getType(typeName);
  }

  if (!type || !isObjectType(type)) {
    throw new Error(`Type "${typeName}" is not a valid ObjectType.`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const minimalObject = getMinimalValue(type, effectiveSchema, existingValue);
  return JSON.stringify(minimalObject, null, 2);
}

function removeWhitespace(str: string) {
  return str.replace(/\s+|\\n|\\t/g, "").toLowerCase();
}

export function compareStringsWithoutWhitespace(str1: string, str2: string) {
  return removeWhitespace(str1) === removeWhitespace(str2);
}

export function renameSchemaType(
  sdl: string,
  oldName: string,
  newName: string,
  scope: Scope,
): string {
  const typeSuffix = scope === "global" ? "State" : "LocalState";
  const oldTypeName = `${pascalCase(oldName)}${typeSuffix}`;
  const newTypeName = `${pascalCase(newName)}${typeSuffix}`;

  const ast = parse(sdl);

  const updatedAst = visit(ast, {
    ObjectTypeDefinition: (node) => {
      if (node.name.value === oldTypeName) {
        return {
          ...node,
          name: {
            ...node.name,
            value: newTypeName,
          },
        };
      }
    },
  });

  return print(updatedAst);
}

export function initializeModelSchema(params: {
  modelName: string;
  setStateSchema: (schema: string, scope: Scope) => void;
}) {
  const { modelName, setStateSchema } = params;
  const initialSchemaDoc = makeInitialSchemaDoc(modelName, "global");
  setStateSchema(initialSchemaDoc, "global");
}

export function updateModelSchemaNames(params: {
  oldName: string;
  newName: string;
  globalStateSchema: string;
  localStateSchema: string;
  setStateSchema: (schema: string, scope: Scope) => void;
}) {
  const {
    oldName,
    newName,
    globalStateSchema,
    localStateSchema,
    setStateSchema,
  } = params;

  const newSchema = renameSchemaType(
    globalStateSchema,
    oldName,
    newName,
    "global",
  );
  setStateSchema(newSchema, "global");

  if (localStateSchema) {
    const newLocalStateSchema = renameSchemaType(
      localStateSchema,
      oldName,
      newName,
      "local",
    );
    setStateSchema(newLocalStateSchema, "local");
  }
}

export function handleModelNameChange(params: {
  oldName: string;
  newName: string;
  globalStateSchema: string;
  localStateSchema: string;
  setStateSchema: (schema: string, scope: Scope) => void;
}) {
  const { oldName, newName, globalStateSchema, setStateSchema } = params;

  const hasExistingSchema = !!globalStateSchema;

  if (!hasExistingSchema) {
    initializeModelSchema({ modelName: newName, setStateSchema });
    return;
  }

  updateModelSchemaNames(params);
}
