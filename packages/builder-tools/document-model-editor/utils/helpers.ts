import { safeParseSdl } from "#document-model-editor/context/schema-context";
import * as customScalars from "@powerhousedao/scalars";
import { type Serializable } from "@powerhousedao/scalars";
import { pascalCase } from "change-case";
import {
  type DocumentNode,
  type FieldDefinitionNode,
  getNullableType,
  type GraphQLSchema,
  type GraphQLType,
  isEnumType,
  isListType,
  isObjectType,
  isScalarType,
  Kind,
  type ObjectTypeDefinitionNode,
  print,
  type TypeNode,
  visit,
} from "graphql";
import { z } from "zod";
import { type Scope } from "../types/documents.js";

export function makeStateSchemaNameForScope(modelName: string, scope: string) {
  const modelNamePascalCase = pascalCase(modelName);
  const scopePascalCase = pascalCase(scope);
  const scopeStateTypeNamePrefix =
    scopePascalCase === "Global" ? "" : scopePascalCase;
  const name = `${scopeStateTypeNamePrefix}${modelNamePascalCase}State`;
  return name;
}

export function makeInitialSchemaDoc(modelName: string, scope: string) {
  const name = makeStateSchemaNameForScope(modelName, scope);
  const stateSchemaSdl = `type ${name} {
  "Add your ${scope} state fields here"
  _placeholder: String
}`;
  return stateSchemaSdl;
}

export function makeOperationInitialDoc(name: string) {
  const inputSdl = `input ${pascalCase(name)}Input {
  "Add your inputs here"
  _placeholder: String
}`;
  return inputSdl;
}

function getMinimalValue(
  type: GraphQLType,
  schema: GraphQLSchema,
  existingValue?: any,
) {
  const nullableType = getNullableType(type);

  if (isScalarType(nullableType)) {
    const typeName = nullableType.name;
    if (existingValue !== undefined) {
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

export function makeInitialStateJson(args: {
  schemaSdl: string;
  modelName: string;
  scope: string;
  existingValue: string;
}) {
  const { schemaSdl, modelName, scope, existingValue } = args;

  const parsedSchema = safeParseSdl(schemaSdl);
  if (!parsedSchema) return existingValue;
  const stateSchemaTypeName = `${pascalCase(modelName)}${pascalCase(scope)}State`;
  const stateSchema = parsedSchema.definitions.find(
    (def) =>
      def.kind === Kind.OBJECT_TYPE_DEFINITION &&
      def.name.value === stateSchemaTypeName,
  );
  if (!stateSchema) return existingValue;
  // const emptyObject = makeEmptyObjectForDefinitionNode(
  //   parsedSchema,
  //   stateSchema,
  // );
  // if (!customScalars.isSerializable(emptyObject)) return existingValue;
  // return JSON.stringify(emptyObject, null, 2);
}

export function syncInitialStateJsonWithSchema(args: {
  existingJson: string;
  schemaDocumentNode: DocumentNode;
  definitionNode: ObjectTypeDefinitionNode;
}) {
  const { existingJson, schemaDocumentNode, definitionNode } = args;
  const existingValueObjectResult = z
    .record(z.string(), customScalars.SerializableSchema)
    .safeParse(existingJson);
  if (!existingValueObjectResult.success) return existingJson;
  const existingValueObject = existingValueObjectResult.data;
  const newJson: Record<string, Serializable> = {};
  const definitionNodeFields = definitionNode.fields;
  if (!definitionNodeFields?.length) return existingJson;
  for (const field of definitionNodeFields) {
    const fieldName = field.name.value;
    const existingFieldValue = existingValueObject[fieldName];
    if (existingFieldValue) continue;
    const fieldTypeNode = field.type;
    const minimalValue = getMinimalValueForTypeNode(
      fieldTypeNode,
      schemaDocumentNode,
    );
  }
}

export function getMinimalValueForTypeNode(
  typeNode: TypeNode,
  schemaDocumentNode: DocumentNode,
): Serializable {
  if (typeNode.kind !== Kind.NON_NULL_TYPE) return null;
  const nullableTypeNode = typeNode.type;
  if (nullableTypeNode.kind === Kind.LIST_TYPE) return [];
  const typeDefinitionNodeFromSchema = schemaDocumentNode.definitions.find(
    (def) =>
      "name" in def &&
      "kind" in def &&
      def.name?.value === nullableTypeNode.name.value,
  );
  if (!typeDefinitionNodeFromSchema) return null;

  if (
    typeDefinitionNodeFromSchema.kind === Kind.ENUM_TYPE_DEFINITION ||
    typeDefinitionNodeFromSchema.kind === Kind.ENUM_TYPE_EXTENSION
  ) {
    return "";
  }

  if (
    typeDefinitionNodeFromSchema.kind === Kind.SCALAR_TYPE_DEFINITION ||
    typeDefinitionNodeFromSchema.kind === Kind.SCALAR_TYPE_EXTENSION
  ) {
    return null;
  }
}

function safeParseJsonRecord(json: string) {
  try {
    return JSON.parse(json) as Record<string, Serializable>;
  } catch (error) {
    console.error(error);
    return null;
  }
}

export function makeMinimalObjectFromSDL(args: {
  sharedSchemaSdl: string;
  modelName: string;
  scope: string;
  initialValue: string;
}) {
  const { sharedSchemaSdl, modelName, scope, initialValue } = args;
  const existingValue = initialValue || "{}";
  console.log({
    sharedSchemaSdl,
    modelName,
    scope,
    initialValue,
  });
  const parsedSchema = safeParseSdl(sharedSchemaSdl);
  console.log({
    parsedSchema,
  });
  if (!parsedSchema) return existingValue;
  const stateTypeName = makeStateSchemaNameForScope(modelName, scope);
  console.log({
    stateTypeName,
  });
  if (!stateTypeName) return existingValue;
  const stateTypeDefinition = parsedSchema.definitions.find(
    (def) =>
      def.kind === Kind.OBJECT_TYPE_DEFINITION &&
      def.name.value === stateTypeName,
  );
  console.log({
    stateTypeDefinition,
  });
  if (
    !stateTypeDefinition ||
    stateTypeDefinition.kind !== Kind.OBJECT_TYPE_DEFINITION
  )
    return existingValue;
  const existingValueObject = safeParseJsonRecord(existingValue);
  console.log({
    existingValueObject,
  });
  if (!existingValueObject) return existingValue;
  const stateTypeDefinitionFields = stateTypeDefinition.fields;
  console.log({
    stateTypeDefinitionFields,
  });
  if (!stateTypeDefinitionFields?.length) return existingValue;
  const newJson: Record<string, Serializable> = {};
  for (const field of stateTypeDefinitionFields) {
    const fieldName = field.name.value;
    const fieldType = field.type;
    const fieldTypeNode = field.type;
    const existingFieldValue = existingValueObject[fieldName];
    console.log({
      fieldName,
      fieldType,
      fieldTypeNode,
      existingFieldValue,
    });
  }
  return initialValue;
}

export function recursivelyMakeMinimalObject(args: {
  existingValueObject: Record<string, Serializable> | null;
  stateTypeDefinitionFields: readonly FieldDefinitionNode[];
}) {
  const { existingValueObject, stateTypeDefinitionFields } = args;
  const newJson: Record<string, Serializable> = {};
  for (const field of stateTypeDefinitionFields) {
    const fieldName = field.name.value;
    const fieldType = field.type;
    const fieldTypeNode = field.type;
    const existingFieldValue = existingValueObject?.[fieldName] ?? null;
    console.log({
      fieldName,
      fieldType,
      fieldTypeNode,
      existingFieldValue,
    });
  }
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
