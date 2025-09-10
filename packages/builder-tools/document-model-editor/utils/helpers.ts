import type { GqlPrimitiveNodeName } from "#document-model-editor/constants/graphql-kinds";
import {
  BOOLEAN_GQL_PRIMITIVE_NAME,
  FLOAT_GQL_PRIMITIVE_NAME,
  gqlPrimitiveNodeNamesList,
  ID_GQL_PRIMITIVE_NAME,
  INT_GQL_PRIMITIVE_NAME,
  STRING_GQL_PRIMITIVE_NAME,
} from "#document-model-editor/constants/graphql-kinds";
import { safeParseSdl } from "#document-model-editor/context/schema-context";
import type { Serializable } from "@powerhousedao/document-engineering/graphql";
import { getPHCustomScalarByTypeName } from "@powerhousedao/document-engineering/graphql";
import { pascalCase } from "change-case";
import type {
  ASTNode,
  DefinitionNode,
  DocumentNode,
  EnumTypeDefinitionNode,
  FieldDefinitionNode,
  ListTypeNode,
  NamedTypeNode,
  NonNullTypeNode,
  ObjectTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  UnionTypeDefinitionNode,
} from "graphql";
import { Kind, print, visit } from "graphql";
import { z } from "zod";
import type { Scope } from "../types/documents.js";

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

export function safeParseJsonRecord(json: string) {
  try {
    return JSON.parse(json) as Record<string, Serializable>;
  } catch (error) {
    return null;
  }
}

export function makeMinimalObjectForStateType(args: {
  sharedSchemaDocumentNode: DocumentNode;
  stateTypeDefinitionNode: ObjectTypeDefinitionNode;
  existingValue: string;
}) {
  const { sharedSchemaDocumentNode, stateTypeDefinitionNode, existingValue } =
    args;
  const existingValueObject = safeParseJsonRecord(existingValue);
  if (!existingValueObject) {
    return existingValue;
  }
  const stateTypeDefinitionFields = stateTypeDefinitionNode.fields;
  if (!stateTypeDefinitionFields?.length) {
    return existingValue;
  }
  const minimalObject = makeMinimalValuesForObjectFields({
    schemaDocumentNode: sharedSchemaDocumentNode,
    fieldDefinitionNodes: stateTypeDefinitionFields,
    existingValueObject,
  });
  return JSON.stringify(minimalObject, null, 2);
}

export function makeMinimalValuesForObjectFields(args: {
  schemaDocumentNode: DocumentNode;
  existingValueObject: Record<string, Serializable> | null;
  fieldDefinitionNodes: readonly FieldDefinitionNode[];
}) {
  const { schemaDocumentNode, existingValueObject, fieldDefinitionNodes } =
    args;
  const newJson: Record<string, Serializable> = {};

  for (const astNode of fieldDefinitionNodes) {
    const fieldName = getASTNodeName(astNode);
    if (!fieldName) {
      continue;
    }
    const minimalValue = makeMinimalValueForASTNode({
      fieldName,
      astNode,
      schemaDocumentNode,
      existingValueObject,
    });
    newJson[astNode.name.value] = minimalValue;
  }

  return newJson;
}

function makeMinimalValueForASTNode(args: {
  fieldName: string;
  astNode: ASTNode;
  schemaDocumentNode: DocumentNode;
  existingValueObject: Record<string, Serializable> | null;
}) {
  const { fieldName, astNode, schemaDocumentNode, existingValueObject } = args;
  const existingFieldValue = existingValueObject?.[fieldName];
  let node: ASTNode | null = astNode;

  if (isFieldDefinitionNode(astNode)) {
    node = getASTNodeTypeNode(node);
  }
  const isNonNull = isNonNullNode(node);
  if (isNonNull) {
    node = getASTNodeTypeNode(node);
  }

  if (isListTypeNode(node)) {
    return makeMinimalValueForGqlListNode(node, existingFieldValue, isNonNull);
  }
  if (isGqlPrimitiveNode(node)) {
    return makeMinimalValueForGQLPrimitiveNode(
      node,
      existingFieldValue,
      isNonNull,
    );
  }

  const namedTypeDefinitionNode = getNamedTypeDefinitionNode(
    node,
    schemaDocumentNode,
  );

  if (isEnumTypeDefinitionNode(namedTypeDefinitionNode)) {
    return makeMinimalValueForGqlEnum(
      namedTypeDefinitionNode,
      existingFieldValue,
      isNonNull,
    );
  }
  if (isScalarTypeDefinitionNode(namedTypeDefinitionNode)) {
    return makeMinimalValueForGqlScalar(
      namedTypeDefinitionNode,
      existingFieldValue,
      isNonNull,
    );
  }
  if (isUnionTypeDefinitionNode(namedTypeDefinitionNode)) {
    return makeMinimalValueForGqlUnion(
      namedTypeDefinitionNode,
      existingFieldValue,
      schemaDocumentNode,
      existingValueObject,
      isNonNull,
    );
  }
  if (isObjectTypeDefinitionNode(namedTypeDefinitionNode)) {
    return makeMinimalValueForGqlObject(
      namedTypeDefinitionNode,
      schemaDocumentNode,
      existingValueObject,
      existingFieldValue,
      isNonNull,
    );
  }

  return existingFieldValue;
}

function isFieldDefinitionNode(
  astNodeTypeNode: ASTNode | null,
): astNodeTypeNode is FieldDefinitionNode {
  if (!astNodeTypeNode) return false;
  return astNodeTypeNode.kind === Kind.FIELD_DEFINITION;
}

function isNonNullNode(astNode: ASTNode | null): astNode is NonNullTypeNode {
  if (!astNode) return false;
  return astNode.kind === Kind.NON_NULL_TYPE;
}

export function isGqlPrimitiveNode(
  astNodeTypeNode: ASTNode | null,
): astNodeTypeNode is NamedTypeNode {
  if (!astNodeTypeNode) return false;
  const name = getASTNodeName(astNodeTypeNode);
  return gqlPrimitiveNodeNamesList.includes(name as GqlPrimitiveNodeName);
}

function isListTypeNode(
  astNodeTypeNode: ASTNode | null,
): astNodeTypeNode is ListTypeNode {
  if (!astNodeTypeNode) return false;
  return astNodeTypeNode.kind === Kind.LIST_TYPE;
}

function isEnumTypeDefinitionNode(
  definitionNode: DefinitionNode | null,
): definitionNode is EnumTypeDefinitionNode {
  if (!definitionNode) return false;
  return definitionNode.kind === Kind.ENUM_TYPE_DEFINITION;
}

function isScalarTypeDefinitionNode(
  definitionNode: DefinitionNode | null,
): definitionNode is ScalarTypeDefinitionNode {
  if (!definitionNode) return false;
  return definitionNode.kind === Kind.SCALAR_TYPE_DEFINITION;
}

function isUnionTypeDefinitionNode(
  definitionNode: DefinitionNode | null,
): definitionNode is UnionTypeDefinitionNode {
  if (!definitionNode) return false;
  return definitionNode.kind === Kind.UNION_TYPE_DEFINITION;
}

function isObjectTypeDefinitionNode(
  definitionNode: DefinitionNode | null,
): definitionNode is ObjectTypeDefinitionNode {
  if (!definitionNode) return false;
  return definitionNode.kind === Kind.OBJECT_TYPE_DEFINITION;
}

function getASTNodeName(astNode: ASTNode | null) {
  if (!astNode) {
    return null;
  }
  if (!("name" in astNode)) {
    return null;
  }
  if (!astNode.name) {
    return null;
  }
  if (!("value" in astNode.name)) {
    return null;
  }
  return astNode.name.value;
}

function getASTNodeTypeNode(astNode: ASTNode | null) {
  if (!astNode) {
    return null;
  }
  if (!("type" in astNode)) {
    return null;
  }
  return astNode.type;
}

function makeMinimalValueForGQLPrimitiveNode(
  primitiveTypeNode: NamedTypeNode,
  existingFieldValue: Serializable,
  isNonNull: boolean,
) {
  const name = getASTNodeName(primitiveTypeNode);
  if (!name) {
    return null;
  }
  switch (name) {
    case ID_GQL_PRIMITIVE_NAME: {
      if (z.string().safeParse(existingFieldValue).success) {
        return existingFieldValue;
      }
      return isNonNull ? "placeholder-id" : null;
    }
    case BOOLEAN_GQL_PRIMITIVE_NAME: {
      if (z.boolean().safeParse(existingFieldValue).success) {
        return existingFieldValue;
      }
      return isNonNull ? false : null;
    }
    case INT_GQL_PRIMITIVE_NAME: {
      if (z.number().safeParse(existingFieldValue).success) {
        return existingFieldValue;
      }
      return isNonNull ? 0 : null;
    }
    case FLOAT_GQL_PRIMITIVE_NAME: {
      if (z.number().safeParse(existingFieldValue).success) {
        return existingFieldValue;
      }
      return isNonNull ? 0.0 : null;
    }
    case STRING_GQL_PRIMITIVE_NAME: {
      if (z.string().safeParse(existingFieldValue).success) {
        return existingFieldValue;
      }
      return isNonNull ? "" : null;
    }
  }

  return isNonNull ? existingFieldValue : null;
}

function makeMinimalValueForGqlEnum(
  namedTypeDefinitionNode: EnumTypeDefinitionNode,
  existingFieldValue: Serializable,
  isNonNull: boolean,
) {
  const enumValues =
    namedTypeDefinitionNode.values?.map((value) => value.name.value) ?? [];
  if (
    typeof existingFieldValue === "string" &&
    enumValues.includes(existingFieldValue)
  ) {
    return existingFieldValue;
  }
  if (isNonNull) {
    return enumValues[0];
  }
  return null;
}

function makeMinimalValueForGqlScalar(
  scalarTypeDefinitionNode: ScalarTypeDefinitionNode,
  existingFieldValue: Serializable,
  isNonNull: boolean,
) {
  if (!isNonNull && !existingFieldValue) {
    return null;
  }
  const name = getASTNodeName(scalarTypeDefinitionNode);
  if (!name) {
    console.error(
      "No name for scalar type definition node",
      scalarTypeDefinitionNode,
    );
    return null;
  }
  const scalar = getPHCustomScalarByTypeName(name);
  if (!scalar) {
    return null;
  }
  const existingValueIsValid = scalar.schema.safeParse(existingFieldValue);
  if (existingValueIsValid.success) {
    return existingFieldValue;
  }
  if (!isNonNull) {
    return null;
  }
  const minimalValue = scalar.getDefaultValue?.();
  if (minimalValue) {
    return minimalValue;
  }
  return existingFieldValue;
}

function makeMinimalValueForGqlUnion(
  namedTypeDefinitionNode: UnionTypeDefinitionNode,
  existingFieldValue: Serializable,
  schemaDocumentNode: DocumentNode,
  existingValueObject: Record<string, Serializable> | null,
  isNonNull: boolean,
) {
  if (!isNonNull && !existingFieldValue) {
    return null;
  }

  const types = namedTypeDefinitionNode.types;
  if (!types?.length) {
    return null;
  }

  const firstNamedTypeDefinitionNode = namedTypeDefinitionNode.types?.at(0);
  if (!firstNamedTypeDefinitionNode) {
    return null;
  }
  const firstNamedTypeObjectDefinitionNode = getNamedTypeDefinitionNode(
    firstNamedTypeDefinitionNode,
    schemaDocumentNode,
  );
  if (!isObjectTypeDefinitionNode(firstNamedTypeObjectDefinitionNode)) {
    return null;
  }
  return makeMinimalValueForGqlObject(
    firstNamedTypeObjectDefinitionNode,
    schemaDocumentNode,
    existingValueObject,
    existingFieldValue,
    isNonNull,
  );
}

function makeMinimalValueForGqlListNode(
  listTypeNode: ListTypeNode,
  existingFieldValue: Serializable,
  isNonNull: boolean,
) {
  if (!isNonNull && !Array.isArray(existingFieldValue)) {
    return null;
  }
  if (isNonNull && !Array.isArray(existingFieldValue)) {
    return [];
  }
  return existingFieldValue;
}

function makeMinimalValueForGqlObject(
  objectTypeDefinitionNode: ObjectTypeDefinitionNode,
  schemaDocumentNode: DocumentNode,
  existingValueObject: Record<string, Serializable> | null,
  existingFieldValue: Serializable,
  isNonNull: boolean,
) {
  if (!isNonNull && !existingFieldValue) {
    return null;
  }
  const fields = objectTypeDefinitionNode.fields;
  if (!fields?.length) {
    return {};
  }
  return makeMinimalValuesForObjectFields({
    schemaDocumentNode,
    existingValueObject,
    fieldDefinitionNodes: fields,
  });
}

function getNamedTypeDefinitionNode(
  astNodeTypeNode: ASTNode | null,
  schemaDocumentNode: DocumentNode,
) {
  if (!astNodeTypeNode) {
    return null;
  }
  const name = getASTNodeName(astNodeTypeNode);
  if (!name) {
    return null;
  }
  const definitionNode = schemaDocumentNode.definitions.find(
    (def) => "kind" in def && "name" in def && def.name?.value === name,
  );
  if (!definitionNode) {
    return null;
  }
  return definitionNode;
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

export function initializeModelSchema(modelName: string) {
  const initialSchemaDoc = makeInitialSchemaDoc(modelName, "global");
  return initialSchemaDoc;
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
    const initialSchemaDoc = initializeModelSchema(newName);
    setStateSchema(initialSchemaDoc, "global");
    return;
  }

  updateModelSchemaNames(params);
}
