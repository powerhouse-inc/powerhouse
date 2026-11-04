import { pascalCase } from "change-case";
import {
  type ASTNode,
  type DefinitionNode,
  type DocumentNode,
  Kind,
  Lexer,
  type NameNode,
  parse,
  print,
  Source,
  TokenKind,
  visit,
} from "graphql";

export const EMPTY_DOCUMENT: DocumentNode = {
  kind: Kind.DOCUMENT,
  definitions: [],
};

const OUTPUT_TYPE_KINDS = [
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.OBJECT_TYPE_EXTENSION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.ENUM_TYPE_EXTENSION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.UNION_TYPE_EXTENSION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_EXTENSION,
];

// Kinds whose names get prefixed: state schemas (inputs stripped) and operation schemas.
const STATE_PREFIX_KINDS = new Set<Kind>(OUTPUT_TYPE_KINDS);
export const ALL_PREFIX_KINDS = new Set<Kind>([
  ...OUTPUT_TYPE_KINDS,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_EXTENSION,
]);

// Nodes whose `name` is a type name: definitions, extensions and references.
const TYPE_NAME_KINDS = new Set<Kind>([
  ...ALL_PREFIX_KINDS,
  Kind.SCALAR_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_EXTENSION,
  Kind.NAMED_TYPE,
]);

// Stub local state types dropped from legacy models.
const LOCAL_STATE_STUBS = new Set([
  "AccountSnapshotLocalState",
  "BudgetStatementLocalState",
  "ScopeFrameworkLocalState",
]);

/** Parse SDL; blank or comment-only input yields an empty document. */
export function parseSdl(sdl: string): DocumentNode {
  const source = new Source(sdl);
  if (new Lexer(source).advance().kind === TokenKind.EOF) return EMPTY_DOCUMENT;
  try {
    return parse(source, { noLocation: true });
  } catch (error) {
    // Retry without stray semicolons, which GraphQL rejects.
    const withoutSemicolons = sdl.replaceAll(";", "");
    if (withoutSemicolons === sdl) throw error;
    return parse(withoutSemicolons, { noLocation: true });
  }
}

export function definedTypeNames(
  doc: DocumentNode,
  kinds: ReadonlySet<Kind>,
): string[] {
  return doc.definitions
    .filter((def) => kinds.has(def.kind))
    .map((def) => (def as DefinitionNode & { name: NameNode }).name.value);
}

/** Prefix type definition names and type references found in `names`. */
function prefixTypeNames(
  doc: DocumentNode,
  prefix: string,
  names: ReadonlySet<string>,
): DocumentNode {
  return visit(doc, {
    enter(node: ASTNode) {
      if (!TYPE_NAME_KINDS.has(node.kind)) return undefined;
      const { name } = node as ASTNode & { name: NameNode };
      if (!names.has(name.value)) return undefined;
      return { ...node, name: { ...name, value: `${prefix}_${name.value}` } };
    },
  });
}

/** State schema definitions without inputs, `DateTime` or the given object types. */
function stateDefinitions(
  doc: DocumentNode,
  droppedObjectTypes: ReadonlySet<string> = new Set(),
): DefinitionNode[] {
  return doc.definitions.filter(
    (def) =>
      def.kind !== Kind.INPUT_OBJECT_TYPE_DEFINITION &&
      def.kind !== Kind.INPUT_OBJECT_TYPE_EXTENSION &&
      !(
        def.kind === Kind.SCALAR_TYPE_DEFINITION &&
        def.name.value === "DateTime"
      ) &&
      !(
        def.kind === Kind.OBJECT_TYPE_DEFINITION &&
        droppedObjectTypes.has(def.name.value)
      ),
  );
}

/** The state types and the document type a model adds to the generated schema. */
export function generatedModelDefinitions(
  dmSchemaName: string,
  global: DocumentNode,
  local: DocumentNode,
): DefinitionNode[] {
  const stateDoc: DocumentNode = {
    kind: Kind.DOCUMENT,
    definitions: [
      ...stateDefinitions(global),
      ...stateDefinitions(local, LOCAL_STATE_STUBS),
    ],
  };
  const prefixed = prefixTypeNames(
    stateDoc,
    dmSchemaName,
    new Set(definedTypeNames(stateDoc, STATE_PREFIX_KINDS)),
  );
  const documentType = parseSdl(`
    type ${dmSchemaName} implements IDocument {
              id: String!
              name: String!
              documentType: String!
              operations(skip: Int, first: Int): [Operation!]!
              revision: Int!
              createdAtUtcIso: DateTime!
              lastModifiedAtUtcIso: DateTime!
              ${dmSchemaName !== "DocumentModel" ? `initialState: ${dmSchemaName}_${dmSchemaName}State!` : ""}
              ${dmSchemaName !== "DocumentModel" ? `state: ${dmSchemaName}_${dmSchemaName}State!` : ""}
              stateJSON: JSONObject
          }`);
  return [...prefixed.definitions, ...documentType.definitions];
}

/**
 * Print the input type definitions of a schema document.
 * @param excludeTypeNames - Input type names to leave out
 */
export function printInputTypeDefinitions(
  doc: DocumentNode,
  excludeTypeNames: Set<string> = new Set(),
): string {
  const definitions = doc.definitions.filter(
    (def) =>
      def.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION &&
      !excludeTypeNames.has(def.name.value),
  );
  if (definitions.length === 0) return "";
  return print({ kind: Kind.DOCUMENT, definitions });
}

/**
 * Apply type prefixes to GraphQL schema to namespace types and avoid collisions.
 * Inlined from @powerhousedao/common/utils to avoid ES module import issues.
 * @param {string} schema - GraphQL schema string
 * @param {string} prefix - Prefix to apply to type names
 * @param {string[]} externalTypeNames - Type names from other schemas to also prefix
 * @returns {string} Schema with prefixed types
 */
export function applyGraphQLTypePrefixes(
  schema: string,
  prefix: string,
  externalTypeNames: string[] = [],
): string {
  if (!schema || !schema.trim()) {
    return schema;
  }

  const doc = parseSdl(schema);
  const names = new Set([
    ...definedTypeNames(doc, ALL_PREFIX_KINDS),
    ...externalTypeNames,
  ]);
  if (names.size === 0) return schema;
  return print(prefixTypeNames(doc, prefix, names));
}

export function printModuleOperations(
  operations: readonly DocumentNode[],
  documentName: string,
  names: ReadonlySet<string>,
): string | null {
  const definitions = operations.flatMap((doc) => {
    const opNames = new Set([
      ...names,
      ...definedTypeNames(doc, ALL_PREFIX_KINDS),
    ]);
    return prefixTypeNames(doc, documentName, opNames).definitions;
  });
  return definitions.length === 0
    ? null
    : print({ kind: Kind.DOCUMENT, definitions });
}

export function globalStateTypeName(documentName: string): string {
  // DocumentModel names its root `DocumentModelGlobalState`.
  return documentName === "DocumentModel"
    ? `${documentName}_${documentName}GlobalState`
    : `${documentName}_${documentName}State`;
}

/**
 * AST type node shape for recursive type conversion.
 */
type GraphQLTypeNode = {
  kind: Kind;
  name?: { value: string };
  type?: GraphQLTypeNode;
};

/**
 * Extract the root state type name from a scope's GraphQL schema.
 * Uses the naming convention: {DocumentName}State for global,
 * {DocumentName}{PascalScope}State for other scopes (e.g., DocumentDriveLocalState).
 * Falls back to the last ObjectTypeDefinition (root types are conventionally last).
 */
function rootTypeName(
  ast: DocumentNode,
  documentName: string,
  scopeName: string,
): string | null {
  // Try conventions:
  // 1. {DocumentName}State for global, {DocumentName}{Scope}State otherwise
  // 2. {DocumentName}GlobalState (DocumentModel uses this variant)
  const scopeSuffix = scopeName === "global" ? "" : pascalCase(scopeName);
  const candidates = [
    `${documentName}${scopeSuffix}State`,
    `${documentName}${pascalCase(scopeName)}State`,
  ];

  let lastObjectType: string | null = null;
  for (const def of ast.definitions) {
    if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
      if (candidates.includes(def.name.value)) {
        return def.name.value;
      }
      lastObjectType = def.name.value;
    }
  }

  // Fallback: last object type (root state types are defined last by convention)
  return lastObjectType;
}

/**
 * Convert a GraphQL output type AST node to an optional input type string.
 * Strips non-null markers and converts object type references to Input suffix.
 */
function convertTypeNodeToInput(
  typeNode: GraphQLTypeNode,
  objectNames: Set<string>,
  unionNames: Set<string>,
  interfaceNames: Set<string>,
): string {
  if (typeNode.kind === Kind.NON_NULL_TYPE && typeNode.type) {
    return convertTypeNodeToInput(
      typeNode.type,
      objectNames,
      unionNames,
      interfaceNames,
    );
  }
  if (typeNode.kind === Kind.LIST_TYPE && typeNode.type) {
    const inner = convertTypeNodeToInput(
      typeNode.type,
      objectNames,
      unionNames,
      interfaceNames,
    );
    return `[${inner}]`;
  }
  if (typeNode.kind === Kind.NAMED_TYPE && typeNode.name) {
    const name = typeNode.name.value;
    if (objectNames.has(name)) return `${name}Input`;
    if (unionNames.has(name) || interfaceNames.has(name)) return "JSONObject";
    return name;
  }
  return "JSONObject";
}

/**
 * Generate GraphQL input type definitions from a state schema document.
 * Converts output type definitions to input types with all fields optional.
 * - Object type references get Input suffix
 * - Union/interface references become JSONObject
 * - Enums and scalars remain unchanged
 */
function stateInputTypes(
  ast: DocumentNode,
  excludeTypeNames?: Set<string>,
): string {
  const enumNames = new Set<string>();
  const unionNames = new Set<string>();
  const interfaceNames = new Set<string>();
  const objectNames = new Set<string>();
  const existingInputNames = new Set<string>();

  for (const def of ast.definitions) {
    switch (def.kind) {
      case Kind.ENUM_TYPE_DEFINITION:
        enumNames.add(def.name.value);
        break;
      case Kind.UNION_TYPE_DEFINITION:
        unionNames.add(def.name.value);
        break;
      case Kind.INTERFACE_TYPE_DEFINITION:
        interfaceNames.add(def.name.value);
        break;
      case Kind.OBJECT_TYPE_DEFINITION:
        objectNames.add(def.name.value);
        break;
      case Kind.INPUT_OBJECT_TYPE_DEFINITION:
        existingInputNames.add(def.name.value);
        break;
    }
  }

  const inputTypes: string[] = [];

  for (const def of ast.definitions) {
    if (def.kind !== Kind.OBJECT_TYPE_DEFINITION) continue;
    // Skip if an input type with the same name already exists in the schema
    // or in operation schemas (to avoid duplicates with moduleSchemas)
    const inputName = `${def.name.value}Input`;
    if (existingInputNames.has(inputName)) continue;
    if (excludeTypeNames?.has(inputName)) continue;
    const fields = def.fields ?? [];
    if (fields.length === 0) continue;

    const inputFields = fields.map((field) => {
      const fieldName = field.name.value;
      const fieldType = convertTypeNodeToInput(
        field.type as GraphQLTypeNode,
        objectNames,
        unionNames,
        interfaceNames,
      );
      return `  ${fieldName}: ${fieldType}`;
    });

    inputTypes.push(
      `input ${def.name.value}Input {\n${inputFields.join("\n")}\n}`,
    );
  }

  return inputTypes.join("\n\n");
}

export function scopeInitialState(
  ast: DocumentNode,
  documentName: string,
  scopeName: string,
  allTypeNames: string[],
): { type: string; inputTypes?: string } {
  const rootName = rootTypeName(ast, documentName, scopeName);
  if (!rootName) return { type: "JSONObject" };
  const scopeInputTypes = stateInputTypes(ast, new Set(allTypeNames));
  if (!scopeInputTypes) return { type: "JSONObject" };
  return {
    type: `${documentName}_${rootName}Input`,
    inputTypes: applyGraphQLTypePrefixes(
      scopeInputTypes,
      documentName,
      allTypeNames,
    ),
  };
}
