import type { Serializable } from "@powerhousedao/document-engineering/graphql";
import { getPHCustomScalarByTypeName } from "@powerhousedao/document-engineering/graphql";
import { pascalCase } from "change-case";
import type {
  ASTNode,
  DefinitionNode,
  DocumentNode,
  EnumTypeDefinitionNode,
  FieldDefinitionNode,
  GraphQLInputType,
  GraphQLObjectType,
  GraphQLOutputType,
  GraphQLSchema,
  InputObjectTypeDefinitionNode,
  ListTypeNode,
  NamedTypeNode,
  NonNullTypeNode,
  ObjectTypeDefinitionNode,
  ScalarTypeDefinitionNode,
  TypeNode,
  UnionTypeDefinitionNode,
} from "graphql";
import {
  getVariableValues,
  GraphQLError,
  GraphQLInputObjectType,
  GraphQLList,
  GraphQLNonNull,
  isEnumType,
  isListType,
  isNonNullType,
  isObjectType,
  isScalarType,
  Kind,
  parse,
  print,
  visit,
} from "graphql";
import { buildASTSchema, getOperationAST } from "graphql/utilities";
import { z } from "zod";
import type { GqlPrimitiveNodeName } from "../constants/graphql-kinds.js";
import {
  BOOLEAN_GQL_PRIMITIVE_NAME,
  FLOAT_GQL_PRIMITIVE_NAME,
  gqlPrimitiveNodeNamesList,
  ID_GQL_PRIMITIVE_NAME,
  INT_GQL_PRIMITIVE_NAME,
  STRING_GQL_PRIMITIVE_NAME,
} from "../constants/graphql-kinds.js";
import { safeParseSdl } from "../context/schema-context.js";
import type { Scope } from "../types/documents.js";

export function makeStateSchemaNameForScope(modelName: string, scope: string) {
  const modelNamePascalCase = pascalCase(modelName);
  const scopePascalCase = pascalCase(scope);
  const name =
    scopePascalCase === "Global"
      ? `${modelNamePascalCase}State`
      : `${modelNamePascalCase}${scopePascalCase}State`;
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

export function makeEmptyOperationSchema(operationName: string): string {
  const pascalName = pascalCase(operationName);
  return `input ${pascalName}Input {\n  _empty: Boolean\n}`;
}

export function isEmptyOperationSchema(
  schema: string | null | undefined,
): boolean {
  if (!schema) return false;
  // Check if schema only contains _empty: Boolean field
  return (
    /_empty:\s*Boolean/.test(schema) &&
    !schema.replace(/_empty:\s*Boolean/, "").match(/\w+:\s*\w+/)
  );
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

/**
 * Converts an output object type into an equivalent input object type.
 * Intended for structural validation of state objects.
 */
export function objectTypeToInputType(
  schema: GraphQLSchema,
  objectType: GraphQLObjectType,
  options?: {
    nameSuffix?: string;
    cache?: Map<string, GraphQLInputObjectType>;
  },
): GraphQLInputObjectType {
  const suffix = options?.nameSuffix ?? "Input";
  const cache = options?.cache ?? new Map<string, GraphQLInputObjectType>();

  const inputTypeName = `${objectType.name}${suffix}`;

  if (cache.has(inputTypeName)) {
    return cache.get(inputTypeName)!;
  }

  const inputType = new GraphQLInputObjectType({
    name: inputTypeName,
    fields: () => {
      const fields = objectType.getFields();
      const inputFields: Record<string, { type: GraphQLInputType }> = {};

      for (const fieldName in fields) {
        const field = fields[fieldName];

        if (field.args.length > 0) {
          throw new Error(
            `Cannot convert field "${objectType.name}.${fieldName}" with arguments into input type`,
          );
        }

        inputFields[fieldName] = {
          type: outputTypeToInputType(schema, field.type, suffix, cache),
        };
      }

      return inputFields;
    },
  });

  cache.set(inputTypeName, inputType);
  return inputType;
}

function outputTypeToInputType(
  schema: GraphQLSchema,
  type: GraphQLOutputType,
  suffix: string,
  cache: Map<string, GraphQLInputObjectType>,
): GraphQLInputType {
  if (isNonNullType(type)) {
    return new GraphQLNonNull(
      outputTypeToInputType(schema, type.ofType, suffix, cache),
    );
  }

  if (isListType(type)) {
    return new GraphQLList(
      outputTypeToInputType(schema, type.ofType, suffix, cache),
    );
  }

  if (isScalarType(type) || isEnumType(type)) {
    return type;
  }

  if (isObjectType(type)) {
    return objectTypeToInputType(schema, type, {
      nameSuffix: suffix,
      cache,
    });
  }

  throw new Error(`Unsupported output type: ${type.toString()}`);
}

export function validateStateObject(
  sharedSchemaDocumentNode: DocumentNode,
  stateTypeDefinitionNode: ObjectTypeDefinitionNode,
  stateValue: string,
  options?: { checkMissingOptionalFields?: boolean },
): Error[] {
  let stateObjectJson: Record<string, unknown> | undefined;
  try {
    stateObjectJson = JSON.parse(stateValue) as Record<string, unknown>;
  } catch (error) {
    return [new Error("Invalid JSON object", { cause: error })];
  }

  // 2) Build a quick index of type definitions from the shared schema
  const typeDefByName = indexTypeDefinitions(sharedSchemaDocumentNode);

  // Ensure the passed node exists in the shared schema (optional but helpful)
  const stateTypeName = stateTypeDefinitionNode.name.value;
  if (!typeDefByName.has(stateTypeName)) {
    return [
      new Error(
        `State type "${stateTypeName}" was not found in sharedSchemaDocumentNode`,
      ),
    ];
  }

  // 3) Generate input types needed to validate this state object
  const inputSuffix = "Input";
  const generatedInputDefs = generateInputTypesForObjectTree(
    stateTypeName,
    typeDefByName,
    inputSuffix,
  );

  // 4) Build a schema that includes the generated input types
  const augmentedDoc: DocumentNode = {
    ...sharedSchemaDocumentNode,
    definitions: [
      ...sharedSchemaDocumentNode.definitions,
      ...generatedInputDefs,
    ],
  };

  let schema;
  try {
    schema = buildASTSchema(augmentedDoc, { assumeValidSDL: false });
  } catch (e) {
    return [new Error("Failed to build schema from SDL", { cause: e })];
  }

  // 5) Validate by coercing variables against the generated input type
  const inputTypeName = `${stateTypeName}${inputSuffix}`;
  const opDoc = parse(`query($v: ${inputTypeName}!) { __typename }`);
  const op = getOperationAST(opDoc);

  if (!op) {
    return [new Error("Failed to create validation operation AST")];
  }

  const { errors } = getVariableValues(schema, op.variableDefinitions ?? [], {
    v: stateObjectJson,
  });

  const validationErrors = errors
    ? graphQLErrorsToStateValidationErrors(errors)
    : [];

  if (options?.checkMissingOptionalFields) {
    const missingOptionalErrors = detectMissingOptionalFields(
      sharedSchemaDocumentNode,
      stateTypeDefinitionNode,
      stateObjectJson,
    );
    validationErrors.push(...missingOptionalErrors);
  }

  return validationErrors;
}

/**
 * Indexes object/input/enum/scalar/interface/union type definition nodes by name.
 * Note: only AST definitions that have a "name" field are indexed.
 */
function indexTypeDefinitions(doc: DocumentNode): Map<string, DefinitionNode> {
  const map = new Map<string, DefinitionNode>();

  for (const def of doc.definitions) {
    if (
      def.kind === Kind.OBJECT_TYPE_DEFINITION ||
      def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
      def.kind === Kind.ENUM_TYPE_DEFINITION ||
      def.kind === Kind.SCALAR_TYPE_DEFINITION ||
      def.kind === Kind.INTERFACE_TYPE_DEFINITION ||
      def.kind === Kind.UNION_TYPE_DEFINITION ||
      def.kind === Kind.OBJECT_TYPE_EXTENSION ||
      def.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION ||
      def.kind === Kind.ENUM_TYPE_EXTENSION ||
      def.kind === Kind.INTERFACE_TYPE_EXTENSION ||
      def.kind === Kind.UNION_TYPE_EXTENSION
    ) {
      // Extensions also have names; we index them too (but see note below).
      // In production, you may want to merge extensions into base definitions.
      // For state validation, prefer definitions (not extensions) if both exist.
      const name = def.name.value;
      if (!map.has(name)) {
        map.set(name, def);
      }
    }
  }

  return map;
}

/**
 * Generates InputObjectTypeDefinitionNode(s) for a root object type and any nested
 * object types reachable via fields, converting object references to their *Input equivalents*.
 */
function generateInputTypesForObjectTree(
  rootObjectTypeName: string,
  typeDefByName: Map<string, DefinitionNode>,
  inputSuffix: string,
): InputObjectTypeDefinitionNode[] {
  const generated = new Map<string, InputObjectTypeDefinitionNode>();
  const visiting = new Set<string>();

  const ensureInputForObject = (objectTypeName: string) => {
    const inputName = `${objectTypeName}${inputSuffix}`;
    if (generated.has(inputName)) return;

    if (visiting.has(objectTypeName)) {
      // Recursive reference; we rely on GraphQLInputObjectType lazy field resolution via AST schema build.
      // Still, we must avoid infinite loops while generating AST nodes.
      return;
    }
    visiting.add(objectTypeName);

    const def = typeDefByName.get(objectTypeName);
    if (!def) {
      throw new GraphQLError(`Unknown referenced type "${objectTypeName}"`);
    }

    if (
      def.kind !== Kind.OBJECT_TYPE_DEFINITION &&
      def.kind !== Kind.OBJECT_TYPE_EXTENSION
    ) {
      throw new GraphQLError(
        `Type "${objectTypeName}" is not an object type; cannot generate input from kind "${def.kind}"`,
      );
    }

    const objDef = def as ObjectTypeDefinitionNode;

    // Convert each field type to an input-acceptable TypeNode.
    const inputFields =
      objDef.fields?.map((f) => {
        return {
          kind: Kind.INPUT_VALUE_DEFINITION as const,
          name: f.name,
          description: f.description,
          directives: [], // output-field directives don't automatically translate to input fields
          type: convertOutputTypeNodeToInputTypeNode(
            f.type,
            typeDefByName,
            inputSuffix,
            ensureInputForObject,
          ),
          defaultValue: undefined,
        };
      }) ?? [];

    const inputDef: InputObjectTypeDefinitionNode = {
      kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
      name: { kind: Kind.NAME, value: inputName },
      description: objDef.description,
      directives: [],
      fields: inputFields,
    };

    generated.set(inputName, inputDef);

    visiting.delete(objectTypeName);
  };

  // Kick off generation for root
  ensureInputForObject(rootObjectTypeName);

  return Array.from(generated.values());
}

function convertOutputTypeNodeToInputTypeNode(
  typeNode: TypeNode,
  typeDefByName: Map<string, DefinitionNode>,
  inputSuffix: string,
  ensureInputForObject: (objectTypeName: string) => void,
): TypeNode {
  switch (typeNode.kind) {
    case Kind.NON_NULL_TYPE:
      return {
        kind: Kind.NON_NULL_TYPE,
        type: convertOutputTypeNodeToInputTypeNode(
          typeNode.type,
          typeDefByName,
          inputSuffix,
          ensureInputForObject,
        ) as NamedTypeNode | ListTypeNode,
      };

    case Kind.LIST_TYPE:
      return {
        kind: Kind.LIST_TYPE,
        type: convertOutputTypeNodeToInputTypeNode(
          typeNode.type,
          typeDefByName,
          inputSuffix,
          ensureInputForObject,
        ),
      };

    case Kind.NAMED_TYPE: {
      const named = typeNode as NamedTypeNode;
      const name = named.name.value;

      const def = typeDefByName.get(name);

      // If it's an object type, we must reference its generated input twin.
      if (
        def?.kind === Kind.OBJECT_TYPE_DEFINITION ||
        def?.kind === Kind.OBJECT_TYPE_EXTENSION
      ) {
        ensureInputForObject(name);
        return {
          kind: Kind.NAMED_TYPE,
          name: { kind: Kind.NAME, value: `${name}${inputSuffix}` },
        };
      }

      // Scalars/enums/input objects are valid as-is in input positions.
      if (
        !def ||
        def.kind === Kind.SCALAR_TYPE_DEFINITION ||
        def.kind === Kind.ENUM_TYPE_DEFINITION ||
        def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
        def.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION
      ) {
        return named;
      }

      // Interfaces/unions are not valid input types.
      if (
        def.kind === Kind.INTERFACE_TYPE_DEFINITION ||
        def.kind === Kind.UNION_TYPE_DEFINITION
      ) {
        throw new GraphQLError(
          `Type "${name}" (${def.kind}) cannot be used in an input type`,
        );
      }

      // Anything else is unexpected.
      throw new GraphQLError(
        `Unsupported named type "${name}" of kind "${def.kind}"`,
      );
    }

    default:
      // Exhaustiveness guard
      throw new GraphQLError(
        `Unsupported TypeNode kind: ${JSON.stringify(typeNode)}`,
      );
  }
}

export type StateValidationErrorKind =
  | "MISSING"
  | "MISSING_OPTIONAL"
  | "UNKNOWN_FIELD"
  | "NON_NULL"
  | "TYPE";

export type StateValidationErrorPayload =
  | {
      kind: "MISSING";
      path: (string | number)[];
      field: string;
      expectedType?: string; // e.g. "String!"
    }
  | {
      kind: "MISSING_OPTIONAL";
      path: (string | number)[];
      field: string;
      expectedType?: string; // e.g. "String"
    }
  | {
      kind: "UNKNOWN_FIELD";
      path: (string | number)[];
      field: string;
      didYouMean?: string; // e.g. "test"
      typeName?: string; // e.g. "Test5StateInput"
    }
  | {
      kind: "NON_NULL";
      path: (string | number)[];
      field: string;
      expectedType?: string; // e.g. "Int!"
    }
  | {
      kind: "TYPE";
      path: (string | number)[];
      field: string;
      expectedType?: string; // e.g. "String" (or custom scalar)
      details?: string; // optional raw hint (e.g. "cannot represent ...")
    };

export class StateValidationError extends Error {
  readonly payload: StateValidationErrorPayload;
  readonly originalMessage?: string;

  constructor(payload: StateValidationErrorPayload, originalMessage?: string) {
    // Keep Error.message stable but not user-facing; UI should render from payload.
    super(payload.kind);
    this.name = "StateValidationError";
    this.payload = payload;
    this.originalMessage = originalMessage;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  get kind(): StateValidationErrorKind {
    return this.payload.kind;
  }

  get path(): (string | number)[] {
    return this.payload.path;
  }

  get field(): string {
    return this.payload.field;
  }
}

function extractInputPath(message: string): (string | number)[] {
  const match = message.match(/at\s+"([^"]+)"/);
  if (!match) return [];
  const parts = match[1].split(".").filter(Boolean);
  const withoutVar = parts[0] === "v" ? parts.slice(1) : parts;
  return withoutVar.map((p) => (/^\d+$/.test(p) ? Number(p) : p));
}

const RE_MISSING_REQUIRED_FIELD =
  /Field "([^"]+)" of required type "([^"]+)" was not provided\./;

const RE_UNKNOWN_FIELD =
  /Field "([^"]+)" is not defined by type "([^"]+)"\.(?: Did you mean "([^"]+)"\?)?/;

function extractMissingRequiredField(
  message: string,
): { field: string; expectedType: string } | null {
  const m = message.match(RE_MISSING_REQUIRED_FIELD);
  if (!m) return null;
  return { field: m[1], expectedType: m[2] };
}

function extractUnknownField(
  message: string,
): { field: string; typeName: string; didYouMean?: string } | null {
  const m = message.match(RE_UNKNOWN_FIELD);
  if (!m) return null;
  return { field: m[1], typeName: m[2], didYouMean: m[3] };
}

function lastFieldFromPath(path: (string | number)[]): string | undefined {
  for (let i = path.length - 1; i >= 0; i--) {
    if (typeof path[i] === "string") return path[i] as string;
  }
  return undefined;
}

function extractExpectedType(message: string): string | undefined {
  // NON_NULL: Expected non-nullable type "Int!" not to be null.
  let m = message.match(/Expected non-nullable type "([^"]+)"/);
  if (m?.[1]) return m[1];

  // Sometimes: Expected type "X" ...
  m = message.match(/Expected type "([^"]+)"/);
  if (m?.[1]) return m[1];

  // Scalar coercion: "; String cannot represent ..."
  m = message.match(/;\s*([_A-Za-z][_0-9A-Za-z]*)\s+cannot represent/i);
  if (m?.[1]) return m[1];

  return undefined;
}

export function graphQLErrorsToStateValidationErrors(
  errors: readonly Error[],
): StateValidationError[] {
  const out: StateValidationError[] = [];

  for (const e of errors) {
    const originalMessage = e.message;

    // 1) Missing required field (no `at "v.x"` path usually)
    const missing = extractMissingRequiredField(originalMessage);
    if (missing) {
      out.push(
        new StateValidationError(
          {
            kind: "MISSING",
            path: [missing.field],
            field: missing.field,
            expectedType: missing.expectedType, // if your payload supports it
          },
          originalMessage,
        ),
      );
      continue;
    }

    // 2) Unknown field (extra key)
    const unknown = extractUnknownField(originalMessage);
    if (unknown) {
      out.push(
        new StateValidationError(
          {
            kind: "UNKNOWN_FIELD",
            path: [unknown.field],
            field: unknown.field,
            didYouMean: unknown.didYouMean, // optional
          },
          originalMessage,
        ),
      );
      continue;
    }

    // 3) Usual `at "v.path"` extraction (NON_NULL / TYPE)
    const path = extractInputPath(originalMessage);
    const field = lastFieldFromPath(path) ?? "value";
    const expectedType = extractExpectedType(originalMessage);

    if (
      originalMessage.includes("Expected non-nullable type") &&
      originalMessage.includes("not to be null")
    ) {
      out.push(
        new StateValidationError(
          { kind: "NON_NULL", path, field, expectedType },
          originalMessage,
        ),
      );
      continue;
    }

    if (
      originalMessage.includes("cannot represent") ||
      originalMessage.includes("Expected type")
    ) {
      out.push(
        new StateValidationError(
          {
            kind: "TYPE",
            path,
            field,
            expectedType,
            details: originalMessage,
          },
          originalMessage,
        ),
      );
      continue;
    }

    out.push(
      new StateValidationError(
        { kind: "TYPE", path, field, details: originalMessage },
        originalMessage,
      ),
    );
  }

  return out;
}

/**
 * Detects optional fields defined in the schema that are missing from the state object.
 * Returns StateValidationError[] for each missing optional field.
 */
export function detectMissingOptionalFields(
  sharedSchemaDocumentNode: DocumentNode,
  rootTypeNode: ObjectTypeDefinitionNode,
  value: string | Record<string, unknown>,
  basePath: (string | number)[] = [],
): StateValidationError[] {
  let stateObjectJson: Record<string, unknown> | undefined;
  try {
    stateObjectJson =
      typeof value === "string"
        ? (JSON.parse(value) as Record<string, unknown>)
        : value;
  } catch {
    return [];
  }

  const typeByName = indexObjectTypes(sharedSchemaDocumentNode);
  const errors: StateValidationError[] = [];

  for (const field of rootTypeNode.fields ?? []) {
    const fieldName = field.name.value;
    const fieldPath = [...basePath, fieldName];

    // Check if field is missing from the state object
    if (!(fieldName in stateObjectJson)) {
      // Only report if the field is optional (not NonNull)
      // Required fields are already caught by GraphQL validation
      const isRequired = field.type.kind === Kind.NON_NULL_TYPE;
      if (!isRequired) {
        errors.push(
          new StateValidationError({
            kind: "MISSING_OPTIONAL",
            path: fieldPath,
            field: fieldName,
            expectedType: typeNodeToString(field.type),
          }),
        );
      }
      continue;
    }

    // If present and object-typed → recurse to check nested missing fields
    const namedType = unwrapNamedType(field.type);
    const childType = namedType ? typeByName.get(namedType) : undefined;

    if (
      childType &&
      typeof stateObjectJson[fieldName] === "object" &&
      stateObjectJson[fieldName] !== null
    ) {
      const nestedErrors = detectMissingOptionalFields(
        sharedSchemaDocumentNode,
        childType,
        stateObjectJson[fieldName] as Record<string, unknown>,
        fieldPath,
      );
      errors.push(...nestedErrors);
    }
  }

  return errors;
}

/**
 * Converts a TypeNode to its string representation (e.g., "String", "Int!", "[String]!")
 */
function typeNodeToString(typeNode: TypeNode): string {
  switch (typeNode.kind) {
    case Kind.NAMED_TYPE:
      return typeNode.name.value;
    case Kind.NON_NULL_TYPE:
      return `${typeNodeToString(typeNode.type)}!`;
    case Kind.LIST_TYPE:
      return `[${typeNodeToString(typeNode.type)}]`;
  }
}

export function fillMissingFieldsWithNull(
  sharedSchemaDocumentNode: DocumentNode,
  rootTypeNode: ObjectTypeDefinitionNode,
  value: string | Record<string, unknown>,
): string | undefined {
  let stateObjectJson: Record<string, unknown> | undefined;
  try {
    stateObjectJson =
      typeof value === "string"
        ? (JSON.parse(value) as Record<string, unknown>)
        : value;
  } catch {
    return;
  }

  const typeByName = indexObjectTypes(sharedSchemaDocumentNode);

  const result = { ...stateObjectJson };

  let changed = false;

  for (const field of rootTypeNode.fields ?? []) {
    const fieldName = field.name.value;

    // If missing → add null
    if (!(fieldName in result)) {
      result[fieldName] = null;
      changed = true;
      continue;
    }

    // If present and object-typed → recurse
    const namedType = unwrapNamedType(field.type);
    const childType = namedType ? typeByName.get(namedType) : undefined;

    if (
      childType &&
      typeof result[fieldName] === "object" &&
      result[fieldName] !== null
    ) {
      const filledValue = fillMissingFieldsWithNull(
        sharedSchemaDocumentNode,
        childType,
        result[fieldName] as Record<string, unknown>,
      );
      if (filledValue) {
        result[fieldName] = filledValue;
        changed = true;
      }
    }
  }

  return changed ? JSON.stringify(result, null, 2) : undefined;
}

function indexObjectTypes(
  doc: DocumentNode,
): Map<string, ObjectTypeDefinitionNode> {
  const map = new Map<string, ObjectTypeDefinitionNode>();
  for (const def of doc.definitions) {
    if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
      map.set(def.name.value, def);
    }
  }
  return map;
}

function unwrapNamedType(typeNode: TypeNode): string | undefined {
  if (typeNode.kind === Kind.NAMED_TYPE) return typeNode.name.value;
  if (typeNode.kind === Kind.NON_NULL_TYPE)
    return unwrapNamedType(typeNode.type);
  if (typeNode.kind === Kind.LIST_TYPE) return unwrapNamedType(typeNode.type);
  return undefined;
}
