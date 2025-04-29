import { safeParseSdl } from "#document-model-editor/context/schema-context";
import * as customScalars from "@powerhousedao/scalars";
import { pascalCase } from "change-case";
import {
  buildASTSchema,
  extendSchema,
  getNullableType,
  GraphQLScalarType,
  type GraphQLSchema,
  type GraphQLType,
  type InputObjectTypeDefinitionNode,
  isEnumType,
  isListType,
  isObjectType,
  isScalarType,
  Kind,
  type ObjectTypeDefinitionNode,
  print,
  visit,
} from "graphql";
import { type Scope } from "../types/documents.js";

export function makeStateObject(modelName: string, scope: Scope) {
  const name = `${pascalCase(modelName)}${scope === "local" ? "Local" : ""}State`;

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

export function makeOperationInputName(operationName: string) {
  return `${pascalCase(operationName)}Input`;
}
export function makeOperationInitialDoc(name: string) {
  const inputName = `${pascalCase(name)}Input`;
  const inputNode: InputObjectTypeDefinitionNode = {
    kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
    name: {
      kind: Kind.NAME,
      value: inputName,
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
  const inputSdl = print(inputNode);
  return inputSdl;
}

export function makeInitialSchemaDoc(modelName: string, scope: Scope) {
  const stateObject = makeStateObject(modelName, scope);
  return stateObject;
}

function isValidScalarValue(typeName: string, value: any) {
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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return
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
  const parsedSchema = safeParseSdl(schemaSdl);
  const typeAST = safeParseSdl(sdl);

  if (!parsedSchema || !typeAST) return "{}";

  const schema = buildASTSchema(parsedSchema);

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
    return "{}";
  }

  // Assuming there's only one type definition in the SDL
  const stateTypeName = typeNames[0];
  let type = schema.getType(stateTypeName);

  let effectiveSchema = schema;

  if (!type || !isObjectType(type)) {
    // Type doesn't exist in the schema, extend the schema
    effectiveSchema = extendSchema(schema, typeAST);
    type = effectiveSchema.getType(stateTypeName);
  }

  if (!type || !isObjectType(type)) {
    throw new Error(`Type "${stateTypeName}" is not a valid ObjectType.`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const minimalObject = getMinimalValue(type, effectiveSchema, existingValue);
  return JSON.stringify(minimalObject, null, 2);
}

function removeWhitespace(str: string) {
  return str.replace(/\s+|\\n|\\t/g, "").toLowerCase();
}

export function compareStringsWithoutWhitespace(
  str1: string | null | undefined,
  str2: string | null | undefined,
) {
  if (
    str1 === null ||
    str2 === null ||
    str1 === undefined ||
    str2 === undefined
  )
    return false;
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

  const ast = safeParseSdl(sdl);
  if (!ast) return sdl;

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
  const { newName, globalStateSchema, setStateSchema } = params;

  const hasExistingSchema = !!globalStateSchema;

  if (!hasExistingSchema) {
    initializeModelSchema({ modelName: newName, setStateSchema });
    return;
  }

  updateModelSchemaNames(params);
}
