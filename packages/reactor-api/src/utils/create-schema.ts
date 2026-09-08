import {
  buildSubgraphSchema,
  type GraphQLResolverMap,
  type GraphQLSchemaModule,
} from "@apollo/subgraph";
import { typeDefs as scalarsTypeDefs } from "@powerhousedao/document-engineering/graphql";
import type { Context } from "@powerhousedao/reactor-api";
import type {
  DocumentModelDefinitionV1,
  DocumentModelGlobalState,
  DocumentModelModule,
  DocumentModelSpecificationDefinitionV1,
  LocationFreeGraphQLDocumentNodeV1,
  NamedGraphQLTypeDefinitionV1,
  TypeReferenceDefinitionV1,
} from "@powerhousedao/shared/document-model";
import { camelCase, pascalCase } from "change-case";
import { childLogger } from "document-model";
import {
  buildSpecificationTypeDocument,
  emptyTypePlaceholderName,
} from "document-model/internal/subgraph";
import {
  type DefinitionNode,
  type DocumentNode,
  type InputObjectTypeDefinitionNode,
  type InputValueDefinitionNode,
  Kind,
  OperationTypeNode,
  type OperationTypeDefinitionNode,
  parse,
  print,
  type SchemaDefinitionNode,
  type TypeNode,
  visit,
} from "graphql";
import { gql } from "graphql-tag";
import { GraphQLJSONObject } from "graphql-type-json";

const logger = childLogger(["reactor-api", "create-schema"]);

export type LegacySchemaPipelineEvent = "document-types" | "document-api";

let legacySchemaPipelineObserver:
  | ((event: LegacySchemaPipelineEvent) => void)
  | undefined;

/** Observe legacy schema conversion in tests; omit the observer to disable it. */
export function setLegacySchemaPipelineObserverForTests(
  observer?: (event: LegacySchemaPipelineEvent) => void,
): void {
  legacySchemaPipelineObserver = observer;
}

function observeLegacySchemaPipeline(event: LegacySchemaPipelineEvent): void {
  legacySchemaPipelineObserver?.(event);
}

/**
 * Revision type - matches the definition in reactor/schema.graphql.
 * Used by PHDocument and document mutation results.
 */
const RevisionType = `
  type Revision {
    scope: String!
    revision: Int!
  }
`;

/**
 * Strip scalar definitions from a DocumentNode to avoid duplicates
 * when combining with other schemas that define the same scalars.
 */
const stripScalarDefinitions = (doc: DocumentNode): string => {
  const filteredDefinitions = doc.definitions.filter(
    (def) => def.kind !== Kind.SCALAR_TYPE_DEFINITION,
  );
  return print({ kind: Kind.DOCUMENT, definitions: filteredDefinitions });
};

/**
 * Type-system definition kinds that GraphQL requires to be uniquely named.
 * A subgraph SDL with two definitions sharing a name fails federation
 * composition ("There can be only one type named X"), which is fatal to the
 * whole gateway. We dedupe these by name; field/operation/extension nodes are
 * left untouched.
 */
const TYPE_DEFINITION_KINDS = new Set<Kind>([
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.SCALAR_TYPE_DEFINITION,
  Kind.DIRECTIVE_DEFINITION,
]);

/**
 * Drop duplicate type-system definitions by name, keeping the first occurrence.
 * Type names share one GraphQL namespace, while directive names occupy a
 * separate namespace. Keep-first follows the caller's explicit composition
 * order; in the current assemblers, host/API definitions precede injected
 * state definitions. This heals a document model that defines the same name
 * twice (global+local, state+operation, or twice in one scope) so the assembled
 * subgraph SDL composes instead of crashing the gateway (Sentry #917).
 */
const dedupeTypeDefinitions = (doc: DocumentNode): DocumentNode => {
  const seen = new Set<string>();
  const definitions = doc.definitions.filter((def) => {
    if (!TYPE_DEFINITION_KINDS.has(def.kind)) return true;
    const name = (def as { name?: { value: string } }).name?.value;
    if (!name) return true;
    const namespace =
      def.kind === Kind.DIRECTIVE_DEFINITION ? "directive" : "type";
    const key = `${namespace}:${name}`;
    if (seen.has(key)) {
      // A duplicate here would otherwise crash supergraph composition; log it so
      // production has a breadcrumb of which model shipped a duplicate name.
      logger.debug(`Dropping duplicate type definition: ${name}`);
      return false;
    }
    seen.add(key);
    return true;
  });
  return { kind: Kind.DOCUMENT, definitions };
};

const PREFIXED_DEFINITION_KINDS = new Set<Kind>([
  Kind.OBJECT_TYPE_DEFINITION,
  Kind.OBJECT_TYPE_EXTENSION,
  Kind.ENUM_TYPE_DEFINITION,
  Kind.ENUM_TYPE_EXTENSION,
  Kind.INPUT_OBJECT_TYPE_DEFINITION,
  Kind.INPUT_OBJECT_TYPE_EXTENSION,
  Kind.INTERFACE_TYPE_DEFINITION,
  Kind.INTERFACE_TYPE_EXTENSION,
  Kind.UNION_TYPE_DEFINITION,
  Kind.UNION_TYPE_EXTENSION,
]);

function asDocumentNode(
  document: LocationFreeGraphQLDocumentNodeV1,
): DocumentNode {
  // The location-free shared representation has the same structure as DocumentNode.
  return document as unknown as DocumentNode;
}

function namedDefinitionNames(
  document: DocumentNode,
  includeInputs: boolean,
): Set<string> {
  const names = new Set<string>();
  for (const definition of document.definitions) {
    if (!PREFIXED_DEFINITION_KINDS.has(definition.kind)) continue;
    if (
      !includeInputs &&
      (definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
        definition.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION)
    ) {
      continue;
    }
    const name = (definition as { name?: { value: string } }).name?.value;
    if (name) names.add(name);
  }
  return names;
}

function prefixStructuredDocument(
  document: DocumentNode,
  prefix: string,
  options: {
    readonly includeInputs: boolean;
    readonly omitInputs: boolean;
    readonly omitScalars: boolean;
  },
): DocumentNode {
  const names = namedDefinitionNames(document, options.includeInputs);
  const definitions = document.definitions.filter((definition) => {
    if (
      options.omitInputs &&
      (definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
        definition.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION)
    ) {
      return false;
    }
    if (
      options.omitScalars &&
      (definition.kind === Kind.SCALAR_TYPE_DEFINITION ||
        definition.kind === Kind.SCALAR_TYPE_EXTENSION)
    ) {
      return false;
    }
    return !(
      definition.kind === Kind.SCALAR_TYPE_DEFINITION &&
      definition.name.value === "DateTime"
    );
  });

  const prefixed = visit(
    { kind: Kind.DOCUMENT, definitions },
    {
      NamedType(node) {
        return names.has(node.name.value)
          ? {
              ...node,
              name: { ...node.name, value: `${prefix}_${node.name.value}` },
            }
          : undefined;
      },
      enter(node) {
        if (!PREFIXED_DEFINITION_KINDS.has(node.kind)) return undefined;
        const named = node as typeof node & { name?: { value: string } };
        if (!named.name || !names.has(named.name.value)) return undefined;
        return {
          ...node,
          name: { ...named.name, value: `${prefix}_${named.name.value}` },
        };
      },
    },
  );
  return prefixed;
}

function emptyInputField(): InputValueDefinitionNode {
  return {
    kind: Kind.INPUT_VALUE_DEFINITION,
    name: nameNode(emptyTypePlaceholderName(null)),
    type: { kind: Kind.NAMED_TYPE, name: nameNode("Boolean") },
    directives: [],
  };
}

function definitionCompatibilityDocument(
  definition: DocumentModelDefinitionV1,
): DocumentNode | null {
  const compatibility = definition.specifications.at(-1)?.graphQLCompatibility;
  return compatibility ? asDocumentNode(compatibility.document) : null;
}

function structuredStateDefinitions(
  definition: DocumentModelDefinitionV1,
  prefix: string,
): readonly DefinitionNode[] {
  const document = definitionCompatibilityDocument(definition);
  const prefixed = prefixStructuredDocument(
    document ??
      asDocumentNode(
        buildSpecificationTypeDocument(definition.specifications.at(-1)),
      ),
    prefix,
    {
      // Computed output fields can reference authored input types. Keep those
      // definitions in the state projection so the field arguments and their
      // definitions are namespaced together. The API projection emits the same
      // inputs; the final document deduplication keeps a single definition.
      includeInputs: true,
      omitInputs: false,
      omitScalars: false,
    },
  );
  return prefixed.definitions.filter(
    (definition) =>
      definition.kind !== Kind.SCHEMA_DEFINITION &&
      definition.kind !== Kind.SCHEMA_EXTENSION,
  );
}

/** Merge explicit schema declarations and retain generated root operation types. */
function normalizeSchemaDefinition(document: DocumentNode): DocumentNode {
  const schemaNodes = document.definitions.filter(
    (definition) =>
      definition.kind === Kind.SCHEMA_DEFINITION ||
      definition.kind === Kind.SCHEMA_EXTENSION,
  );
  if (schemaNodes.length === 0) return document;

  const objectNames = new Set(
    document.definitions
      .filter((definition) => definition.kind === Kind.OBJECT_TYPE_DEFINITION)
      .map((definition) => definition.name.value),
  );
  const operationTypes = new Map<
    OperationTypeNode,
    OperationTypeDefinitionNode
  >();
  for (const definition of schemaNodes) {
    for (const operationType of definition.operationTypes ?? []) {
      if (!operationTypes.has(operationType.operation)) {
        operationTypes.set(operationType.operation, operationType);
      }
    }
  }
  for (const [operation, typeName] of [
    [OperationTypeNode.QUERY, "Query"],
    [OperationTypeNode.MUTATION, "Mutation"],
    [OperationTypeNode.SUBSCRIPTION, "Subscription"],
  ] as const) {
    // This schema belongs to the generated Reactor API. If a conventional host
    // root exists, it must remain the root even when an injected compatibility
    // schema declaration points the operation at a model-owned custom type.
    if (objectNames.has(typeName)) {
      operationTypes.set(operation, {
        kind: Kind.OPERATION_TYPE_DEFINITION,
        operation,
        type: { kind: Kind.NAMED_TYPE, name: nameNode(typeName) },
      });
    }
  }

  const base = schemaNodes.find(
    (definition) => definition.kind === Kind.SCHEMA_DEFINITION,
  );
  const normalized: SchemaDefinitionNode = {
    kind: Kind.SCHEMA_DEFINITION,
    ...(base?.description ? { description: base.description } : {}),
    directives: schemaNodes.flatMap(
      (definition) => definition.directives ?? [],
    ),
    operationTypes: Array.from(operationTypes.values()),
  };
  let inserted = false;
  const definitions: DefinitionNode[] = [];
  for (const definition of document.definitions) {
    if (
      definition.kind !== Kind.SCHEMA_DEFINITION &&
      definition.kind !== Kind.SCHEMA_EXTENSION
    ) {
      definitions.push(definition);
      continue;
    }
    if (!inserted) {
      definitions.push(normalized);
      inserted = true;
    }
  }
  return {
    ...document,
    definitions,
  };
}

export const buildSubgraphSchemaModule = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
): GraphQLSchemaModule => {
  const newResolvers = {
    ...resolvers,
    JSONObject: GraphQLJSONObject,
  };

  return {
    typeDefs: normalizeSchemaDefinition(
      getDocumentModelTypeDefs(documentModels, typeDefs),
    ),
    resolvers: newResolvers,
  };
};
export const createSchema = (
  documentModels: DocumentModelModule[],
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
) => {
  // Array form: @apollo/subgraph 2.15 dropped the bare-module overload.
  return buildSubgraphSchema([
    buildSubgraphSchemaModule(documentModels, resolvers, typeDefs),
  ]);
};

/**
 * Create a merged GraphQL schema from multiple subgraph modules.
 * Uses buildSubgraphSchema's array overload to combine type definitions
 * and resolvers from multiple subgraphs into a single executable schema.
 */
export const createMergedSchema = (modules: GraphQLSchemaModule[]) => {
  return buildSubgraphSchema(modules);
};

export function getDocumentModelSchemaName(
  documentModel: DocumentModelGlobalState,
) {
  return pascalCase(documentModel.name.replaceAll("/", " "));
}

export function getDocumentModelModuleSchemaName(
  module: DocumentModelModule,
): string {
  return (
    module.definition?.model.graphQLName ??
    getDocumentModelSchemaName(module.documentModel.global)
  );
}

export const getDocumentModelTypeDefs = (
  documentModels: DocumentModelModule[],
  typeDefs: DocumentNode,
) => {
  let dmSchema = "";
  const structuredDefinitions: DefinitionNode[] = [];

  const addedDocumentModels = new Set<string>();
  documentModels.forEach((module) => {
    const { documentModel } = module;
    const dmSchemaName = getDocumentModelModuleSchemaName(module);
    if (addedDocumentModels.has(dmSchemaName)) {
      logger.debug(
        `Skipping document model with duplicate name: ${dmSchemaName}`,
      );
      return;
    }
    addedDocumentModels.add(dmSchemaName);
    if (module.definition) {
      structuredDefinitions.push(
        ...structuredStateDefinitions(module.definition, dmSchemaName),
      );
      dmSchema += documentInterfaceType(
        dmSchemaName,
        module.definition.specifications.at(-1)?.state.global.root.name,
      );
      return;
    }

    observeLegacySchemaPipeline("document-types");
    // Use only the latest specification to avoid duplicate type definitions
    // when a document model has multiple versions (e.g. v1, v2).
    const latestSpec = documentModel.global.specifications.at(-1);
    const globalSchema = latestSpec?.state.global.schema ?? "";
    const localSchema = latestSpec?.state.local.schema ?? "";
    let tmpDmSchema = `
          ${globalSchema
            .replaceAll("scalar DateTime", "")
            .replaceAll(/input (.*?) {[\s\S]*?}/g, "")};

          ${localSchema
            .replaceAll("scalar DateTime", "")
            .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
            .replaceAll("type AccountSnapshotLocalState", "")
            .replaceAll("type BudgetStatementLocalState", "")
            .replaceAll("type ScopeFrameworkLocalState", "")};

    \n`;

    const found = tmpDmSchema.match(
      /(type|enum|union|interface)\s+(\w+)[\s{]/g,
    );
    const trimmedFound = found?.map((f) =>
      f
        .replaceAll("type ", "")
        .replaceAll("enum ", "")
        .replaceAll("union ", "")
        .replaceAll("interface ", "")
        .replaceAll("{", "")
        .trim(),
    );
    trimmedFound?.forEach((f) => {
      // Create a regex that matches the type name with proper boundaries
      const typeRegex = new RegExp(
        // Match type references in various GraphQL contexts
        `(?<![_A-Za-z0-9])(${f})(?![_A-Za-z0-9])|` + // Basic type references
          `\\[(${f})\\]|` + // Array types without nullability
          `\\[(${f})!\\]|` + // Array of non-null types
          `\\[(${f})\\]!|` + // Non-null array of types
          `\\[(${f})!\\]!`, // Non-null array of non-null types
        "g",
      );

      tmpDmSchema = tmpDmSchema.replace(
        typeRegex,
        (
          match: string,
          p1: string,
          p2: string,
          p3: string,
          p4: string,
          p5: string,
        ) => {
          // If it's an array type, preserve the brackets and ! while replacing the type name
          if (match.startsWith("[")) {
            return match.replace(
              p2 || p3 || p4 || p5,
              `${dmSchemaName}_${p2 || p3 || p4 || p5}`,
            );
          }
          // Basic type reference
          return `${dmSchemaName}_${p1}`;
        },
      );
    });
    dmSchema += tmpDmSchema;
    dmSchema += documentInterfaceType(dmSchemaName);
  });

  // add the mutation and query types
  const schema = gql`
    scalar JSONObject
    scalar AttachmentRef
    ${scalarsTypeDefs.join("\n").replaceAll(";", "")}

    type PHOperationContext {
      signer: Signer
    }

    type Signer {
      user: SignerUser
      app: SignerApp
      signatures: [String!]!
    }

    type SignerUser {
      address: String!
      networkId: String!
      chainId: Int!
    }

    type SignerApp {
      name: String!
      key: String!
    }

    type Operation {
      id: String!
      type: String!
      index: Int!
      timestampUtcMs: DateTime!
      hash: String!
      skip: Int
      inputText: String
      error: String
      context: PHOperationContext
    }

    interface IDocument {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
      stateJSON: JSONObject
    }
    ${dmSchema.replaceAll(";", "")}

    type GqlDocument implements IDocument {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
      stateJSON: JSONObject
    }

    type DriveDocument implements IDocument {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
      operations(first: Int, skip: Int): [Operation!]!
      stateJSON: JSONObject
    }

    ${stripScalarDefinitions(typeDefs)}
  `;

  return dedupeTypeDefinitions({
    kind: Kind.DOCUMENT,
    definitions: [...schema.definitions, ...structuredDefinitions],
  });
};

function documentInterfaceType(
  documentName: string,
  globalStateName = `${documentName}State`,
): string {
  return `
    type ${documentName} implements IDocument {
              id: String!
              name: String!
              documentType: String!
              operations(skip: Int, first: Int): [Operation!]!
              revision: Int!
              createdAtUtcIso: DateTime!
              lastModifiedAtUtcIso: DateTime!
              ${documentName !== "DocumentModel" ? `initialState: ${documentName}_${globalStateName}!` : ""}
              ${documentName !== "DocumentModel" ? `state: ${documentName}_${globalStateName}!` : ""}
              stateJSON: JSONObject
          }\n`;
}

/**
 * Extract type names from a GraphQL schema.
 * @param {string} schema - GraphQL schema string
 * @returns {string[]} Array of type names
 */
function extractTypeNames(schema: string) {
  const found = schema.match(/(type|enum|union|interface|input)\s+(\w+)[\s{]/g);
  if (!found) return [];
  return found.map((f) =>
    f
      .replaceAll("type ", "")
      .replaceAll("enum ", "")
      .replaceAll("union ", "")
      .replaceAll("interface ", "")
      .replaceAll("input ", "")
      .replaceAll("{", "")
      .trim(),
  );
}

/**
 * Extract input type definitions from a GraphQL schema.
 * @param {string} schema - GraphQL schema string
 * @param {Set<string>} excludeTypeNames - Type names to exclude from extraction
 * @returns {string} All input type definitions as a string
 */
function extractInputTypeDefinitions(
  schema: string,
  excludeTypeNames: Set<string> = new Set(),
): string {
  // Match input type blocks: input TypeName { ... }
  const inputTypeRegex = /input\s+(\w+)\s*\{[^}]*\}/g;
  const matches: string[] = [];
  let match;
  while ((match = inputTypeRegex.exec(schema)) !== null) {
    const typeName = match[1];
    // Skip if this type name is in the exclusion set
    if (!excludeTypeNames.has(typeName)) {
      matches.push(match[0]);
    }
  }
  if (matches.length === 0) return "";
  return matches.join("\n\n");
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
function extractRootTypeName(
  schema: string,
  documentName: string,
  scopeName: string,
): string | null {
  try {
    const ast = parse(schema);

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
  } catch {
    // ignore parse errors
  }
  return null;
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
 * Generate GraphQL input type definitions from a state schema string.
 * Converts output type definitions to input types with all fields optional.
 * - Object type references get Input suffix
 * - Union/interface references become JSONObject
 * - Enums and scalars remain unchanged
 */
function generateStateInputTypes(
  stateSchema: string,
  excludeTypeNames?: Set<string>,
): string {
  if (!stateSchema || !stateSchema.trim()) return "";

  let ast;
  try {
    ast = parse(stateSchema);
  } catch {
    return "";
  }

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

/**
 * Apply type prefixes to GraphQL schema to namespace types and avoid collisions.
 * Inlined from @powerhousedao/common/utils to avoid ES module import issues.
 * @param {string} schema - GraphQL schema string
 * @param {string} prefix - Prefix to apply to type names
 * @param {string[]} externalTypeNames - Type names from other schemas to also prefix
 * @returns {string} Schema with prefixed types
 */
function applyGraphQLTypePrefixes(
  schema: string,
  prefix: string,
  externalTypeNames: string[] = [],
): string {
  if (!schema || !schema.trim()) {
    return schema;
  }

  let processedSchema = schema;

  // Find types defined in this schema
  const localTypeNames = extractTypeNames(schema);

  // Combine with external type names (remove duplicates)
  const allTypeNames = [...new Set([...localTypeNames, ...externalTypeNames])];

  if (allTypeNames.length === 0) {
    return schema;
  }

  allTypeNames.forEach((typeName) => {
    const typeRegex = new RegExp(
      // Match type references in various GraphQL contexts
      `(?<![_A-Za-z0-9])(${typeName})(?![_A-Za-z0-9])|` +
        `\\[(${typeName})\\]|` +
        `\\[(${typeName})!\\]|` +
        `\\[(${typeName})\\]!|` +
        `\\[(${typeName})!\\]!`,
      "g",
    );

    processedSchema = processedSchema.replace(
      typeRegex,
      (match, p1, p2, p3, p4, p5) => {
        if (match.startsWith("[")) {
          return match.replace(
            (p2 || p3 || p4 || p5) as string,
            `${prefix}_${p2 || p3 || p4 || p5}`,
          );
        }
        // Basic type reference
        return `${prefix}_${p1}`;
      },
    );
  });

  return processedSchema;
}

/**
 * Options for generating document model GraphQL schemas.
 */
export interface DocumentModelSchemaOptions {
  /**
   * When true, generates new API patterns:
   * - Mutations return full document objects (MutationResult type)
   * - Adds createEmptyDocument mutation
   * - Makes docId and input parameters required
   * @default false
   */
  useNewApi?: boolean;
}

function nameNode(value: string) {
  return { kind: Kind.NAME as const, value };
}

function optionalStateInputType(
  type: TypeReferenceDefinitionV1,
  prefix: string,
  stateInputNames: ReadonlyMap<string, string>,
  abstractTypes: ReadonlySet<string>,
  customTypes: ReadonlySet<string>,
): TypeNode {
  if (type.kind === "list") {
    return {
      kind: Kind.LIST_TYPE,
      type: optionalStateInputType(
        type.item,
        prefix,
        stateInputNames,
        abstractTypes,
        customTypes,
      ),
    };
  }
  let name = type.name;
  if (stateInputNames.has(name)) name = stateInputNames.get(name)!;
  else if (abstractTypes.has(name)) name = "JSONObject";
  if (customTypes.has(type.name) && !abstractTypes.has(type.name)) {
    name = `${prefix}_${name}`;
  }
  return { kind: Kind.NAMED_TYPE, name: nameNode(name) };
}

function stateInputDefinitions(
  specification: DocumentModelSpecificationDefinitionV1,
  prefix: string,
  reservedNames: ReadonlySet<string>,
): readonly DefinitionNode[] {
  const objectDefinitions = specification.types.filter(
    (
      definition,
    ): definition is Extract<
      NamedGraphQLTypeDefinitionV1,
      { readonly kind: "object" }
    > => definition.kind === "object",
  );
  const abstractTypes = new Set(
    specification.types
      .filter(({ kind }) => kind === "union" || kind === "interface")
      .map(({ name }) => name),
  );
  const customTypes = new Set(specification.types.map(({ name }) => name));
  const claimedNames = new Set([
    ...reservedNames,
    ...specification.types.map(({ name }) => name),
  ]);
  for (const operation of specification.modules.flatMap(
    ({ operations }) => operations,
  )) {
    if (operation.input) claimedNames.add(operation.input.name);
  }

  const stateInputNames = new Map<string, string>();
  for (const { name } of objectDefinitions) {
    let candidate = `${name}Input`;
    if (claimedNames.has(candidate)) {
      const base = `${name}InitialStateInput`;
      candidate = base;
      let suffix = 2;
      while (claimedNames.has(candidate)) {
        candidate = `${base}${suffix}`;
        suffix += 1;
      }
    }
    claimedNames.add(candidate);
    stateInputNames.set(name, candidate);
  }

  const generated = objectDefinitions.map<InputObjectTypeDefinitionNode>(
    (definition) => {
      // Fields with an `args` member are computed by resolvers and are not part
      // of persisted state, even when their argument list is empty.
      const storedFields = definition.fields.filter(
        (field) => field.args === undefined,
      );
      return {
        kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
        name: nameNode(`${prefix}_${stateInputNames.get(definition.name)!}`),
        directives: [],
        fields:
          storedFields.length > 0
            ? storedFields.map((field) => ({
                kind: Kind.INPUT_VALUE_DEFINITION,
                name: nameNode(field.name),
                type: optionalStateInputType(
                  field.type,
                  prefix,
                  stateInputNames,
                  abstractTypes,
                  customTypes,
                ),
                directives: [],
              }))
            : [emptyInputField()],
      };
    },
  );

  const scopeFields: InputValueDefinitionNode[] = [
    ["global", specification.state.global.root],
    ["local", specification.state.local.root],
  ].map(([scope, root]) => {
    const rootName = typeof root === "object" && root ? root.name : null;
    const generatedName = rootName ? stateInputNames.get(rootName) : undefined;
    return {
      kind: Kind.INPUT_VALUE_DEFINITION,
      name: nameNode(scope as string),
      type: {
        kind: Kind.NAMED_TYPE,
        name: nameNode(
          generatedName ? `${prefix}_${generatedName}` : "JSONObject",
        ),
      },
      directives: [],
    };
  });

  return [
    ...generated,
    {
      kind: Kind.INPUT_OBJECT_TYPE_DEFINITION,
      name: nameNode(`${prefix}_InitialStateInput`),
      directives: [],
      fields: scopeFields,
    },
  ];
}

const LEGACY_HOST_INPUT_NAMES = ["InitialStateInput"] as const;
const NEW_API_HOST_INPUT_NAMES = [
  ...LEGACY_HOST_INPUT_NAMES,
  "ViewFilterInput",
  "PagingInput",
  "SearchFilterInput",
] as const;

function hostInputNames(useNewApi: boolean): ReadonlySet<string> {
  return new Set(
    useNewApi ? NEW_API_HOST_INPUT_NAMES : LEGACY_HOST_INPUT_NAMES,
  );
}

function assertNoHostInputNameCollisions(
  specification: DocumentModelSpecificationDefinitionV1,
  documentName: string,
  reservedNames: ReadonlySet<string>,
): void {
  const authoredInputNames = new Set(
    specification.types
      .filter(({ kind }) => kind === "input")
      .map(({ name }) => name),
  );
  for (const operation of specification.modules.flatMap(
    ({ operations }) => operations,
  )) {
    if (operation.input) authoredInputNames.add(operation.input.name);
  }
  const collisions = Array.from(authoredInputNames)
    .filter((name) => reservedNames.has(name))
    .sort();
  if (collisions.length > 0) {
    throw new Error(
      `Document model "${documentName}" defines Reactor-reserved GraphQL input type${collisions.length === 1 ? "" : "s"}: ${collisions.join(", ")}`,
    );
  }
}

function structuredApiDefinitions(
  definition: DocumentModelDefinitionV1,
  prefix: string,
): readonly DefinitionNode[] {
  const specification = definition.specifications.at(-1);
  const source =
    definitionCompatibilityDocument(definition) ??
    asDocumentNode(buildSpecificationTypeDocument(specification));
  return prefixStructuredDocument(source, prefix, {
    includeInputs: true,
    omitInputs: false,
    omitScalars: true,
  }).definitions.filter(
    (definition) =>
      definition.kind === Kind.INPUT_OBJECT_TYPE_DEFINITION ||
      definition.kind === Kind.INPUT_OBJECT_TYPE_EXTENSION,
  );
}

/**
 * Project a code-first definition directly from its structured representation.
 * The compatibility AST is transformed as AST; it never enters the legacy
 * regular-expression adapter.
 */
export function generateDocumentModelSchemaFromDefinition(
  definition: DocumentModelDefinitionV1,
  options: DocumentModelSchemaOptions = {},
): DocumentNode {
  const specification = definition.specifications.at(-1);
  const documentName = definition.model.graphQLName;
  const reservedInputNames = hostInputNames(options.useNewApi === true);
  if (specification) {
    assertNoHostInputNameCollisions(
      specification,
      documentName,
      reservedInputNames,
    );
  }
  const operations =
    specification?.modules.flatMap(({ operations }) => operations) ?? [];
  const operationMutations = operations
    .filter((operation) => operation.name && operation.input)
    .flatMap((operation) => {
      const fieldName = operation.creatorKey;
      const inputName = `${documentName}_${operation.input!.name}`;
      return options.useNewApi
        ? [
            `${fieldName}(docId: PHID!, input: ${inputName}!): ${documentName}MutationResult!`,
            `${fieldName}Async(docId: PHID!, input: ${inputName}!): String!`,
          ]
        : [
            `${documentName}_${fieldName}(driveId: String, docId: PHID, input: ${inputName}): Int`,
          ];
    })
    .join("\n");

  const api = options.useNewApi
    ? structuredNewApiSchema(documentName, specification, operationMutations)
    : gql`
        """Queries: ${documentName} Document"""
        type ${documentName}Queries {
          getDocument(docId: PHID!, driveId: PHID): ${documentName}
          getDocuments(driveId: String!): [${documentName}!]
        }
        type Query {
          ${documentName}: ${documentName}Queries
        }
        """Mutations: ${documentName}"""
        type Mutation {
          ${documentName}_createDocument(name: String!, driveId: String): String
          ${operationMutations}
        }
      `;
  const extraDefinitions = specification
    ? stateInputDefinitions(specification, documentName, reservedInputNames)
    : [];
  return dedupeTypeDefinitions({
    kind: Kind.DOCUMENT,
    definitions: [
      ...api.definitions,
      ...extraDefinitions,
      ...structuredApiDefinitions(definition, documentName),
    ],
  });
}

function structuredNewApiSchema(
  documentName: string,
  specification: DocumentModelSpecificationDefinitionV1 | undefined,
  operationMutations: string,
): DocumentNode {
  const globalRoot = specification?.state.global.root.name;
  const localRoot = specification?.state.local.root?.name;
  const globalStateType = globalRoot
    ? `${documentName}_${globalRoot}!`
    : "JSONObject!";
  const localStateType = localRoot
    ? `${documentName}_${localRoot}!`
    : "JSONObject!";
  return gql`
    scalar DateTime
    scalar JSONObject
    scalar AttachmentRef

    ${RevisionType}

    type ${documentName}_PHHashConfig {
      algorithm: String!
      encoding: String!
    }
    type ${documentName}_PHDocumentScopeState {
      version: Int!
      hash: ${documentName}_PHHashConfig!
      isDeleted: Boolean
      deletedAtUtcIso: String
      deletedBy: String
      deletionReason: String
    }
    type ${documentName}_FullState {
      auth: JSONObject!
      document: ${documentName}_PHDocumentScopeState!
      global: ${globalStateType}
      local: ${localStateType}
    }
    input ${documentName}_ViewFilterInput {
      branch: String
      scopes: [String!]
    }
    input ${documentName}_PagingInput {
      limit: Int
      offset: Int
      cursor: String
    }
    input ${documentName}_SearchFilterInput {
      parentId: String
      identifiers: [String!]
    }
    type ${documentName}MutationResult {
      id: String!
      slug: String
      preferredEditor: String
      name: String!
      documentType: String!
      state: ${documentName}_FullState!
      revisionsList: [Revision!]!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
    }
    type ${documentName}_DocumentWithChildren {
      document: ${documentName}MutationResult!
      childIds: [String!]!
    }
    type ${documentName}_DocumentResultPage {
      items: [${documentName}MutationResult!]!
      totalCount: Int!
      hasNextPage: Boolean!
      hasPreviousPage: Boolean!
      cursor: String
    }
    type ${documentName}Queries {
      document(identifier: String!, view: ${documentName}_ViewFilterInput): ${documentName}_DocumentWithChildren
      documents(paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!
      findDocuments(search: ${documentName}_SearchFilterInput, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!
      documentOutgoingRelationships(sourceIdentifier: String!, relationshipType: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!
      documentIncomingRelationships(targetIdentifier: String!, relationshipType: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!
    }
    type ${documentName}Mutations {
      createDocument(name: String!, parentIdentifier: String, slug: String, preferredEditor: String, initialState: ${documentName}_InitialStateInput): ${documentName}MutationResult!
      createEmptyDocument(parentIdentifier: String): ${documentName}MutationResult!
      ${operationMutations}
    }
    type Query {
      ${documentName}: ${documentName}Queries!
    }
    type Mutation {
      ${documentName}: ${documentName}Mutations!
    }
  `;
}

/**
 * Generate a GraphQL schema for a document model.
 *
 * @param documentModel - The document model global state
 * @param options - Schema generation options
 * @returns GraphQL DocumentNode
 */
export function generateDocumentModelSchema(
  documentModel: DocumentModelGlobalState,
  options: DocumentModelSchemaOptions = {},
): DocumentNode {
  observeLegacySchemaPipeline("document-api");
  const { useNewApi = false } = options;

  const specification = documentModel.specifications.at(-1);
  const documentName = getDocumentModelSchemaName(documentModel);
  const globalStateSchema = specification?.state.global.schema;
  const localStateSchema = specification?.state.local.schema;
  const globalStateTypeNames = extractTypeNames(globalStateSchema ?? "");
  const localStateTypeNames = extractTypeNames(localStateSchema ?? "");
  const stateTypeNames = [...globalStateTypeNames, ...localStateTypeNames];

  // Collect ALL type names from all operations' schemas
  const allOperationTypeNames =
    specification?.modules.flatMap((module) =>
      module.operations.flatMap((op) => extractTypeNames(op.schema ?? "")),
    ) ?? [];

  // Combine state types and all operation types for prefixing
  const allTypeNames = [
    ...new Set([...stateTypeNames, ...allOperationTypeNames]),
  ];

  // Extract input type definitions from state schema, excluding operation-specific inputs
  // (those are already defined in op.schema)
  const operationInputTypeNames = new Set(allOperationTypeNames);
  const stateInputTypes = extractInputTypeDefinitions(
    globalStateSchema ?? "",
    operationInputTypeNames,
  );
  const prefixedStateInputTypes = applyGraphQLTypePrefixes(
    stateInputTypes,
    documentName,
    allTypeNames,
  );

  // Helper to check if schema has actual GraphQL type definitions
  const hasValidSchema = (schema: string | null | undefined): boolean =>
    !!(schema && /\b(input|type|enum|union|interface)\s+\w+/.test(schema));

  // Process state schema types (remove input types, clean up, and prefix)
  const stateSchemaTypes = globalStateSchema
    ? applyGraphQLTypePrefixes(
        globalStateSchema
          .replaceAll("scalar DateTime", "")
          .replaceAll(/input (.*?) {[\s\S]*?}/g, ""),
        documentName,
        allTypeNames,
      )
    : "";

  if (useNewApi) {
    // New API: flat queries, typed state, async mutations
    return generateNewApiSchema(
      documentName,
      specification,
      stateSchemaTypes,
      prefixedStateInputTypes,
      allTypeNames,
      hasValidSchema,
    );
  }

  // Legacy API
  return generateLegacyApiSchema(
    documentName,
    specification,
    prefixedStateInputTypes,
    allTypeNames,
    hasValidSchema,
  );
}

/**
 * Generate legacy API schema with nested queries
 */
function generateLegacyApiSchema(
  documentName: string,
  specification: DocumentModelGlobalState["specifications"][0] | undefined,
  prefixedStateInputTypes: string,
  allTypeNames: string[],
  hasValidSchema: (schema: string | null | undefined) => boolean,
): DocumentNode {
  const createDocumentMutation = `${documentName}_createDocument(name:String!, driveId:String): String`;

  const operationMutations =
    specification?.modules
      .flatMap((module) =>
        module.operations
          .filter((op) => op.name && hasValidSchema(op.schema))
          .map(
            (op) =>
              `${documentName}_${camelCase(op.name!)}(
            driveId: String, docId: PHID, input: ${documentName}_${pascalCase(op.name!)}Input): Int`,
          ),
      )
      .join("\n        ") ?? "";

  const moduleSchemas =
    specification?.modules
      .filter((module) =>
        module.operations.some((op) => hasValidSchema(op.schema)),
      )
      .map(
        (module) =>
          `"""
       Module: ${pascalCase(module.name)}
       """
       ${module.operations
         .filter((op) => hasValidSchema(op.schema))
         .map((op) =>
           applyGraphQLTypePrefixes(
             op.schema ?? "",
             documentName,
             allTypeNames,
           ),
         )
         .join("\n  ")}`,
      )
      .join("\n") ?? "";

  return gql`
    """
    Queries: ${documentName} Document
    """

    type ${documentName}Queries {
        getDocument(docId: PHID!, driveId: PHID): ${documentName}
        getDocuments(driveId: String!): [${documentName}!]
    }

    type Query {
        ${documentName}: ${documentName}Queries
    }

    """
    Mutations: ${documentName}
    """
    type Mutation {
        ${createDocumentMutation}

        ${operationMutations}
    }

    ${
      prefixedStateInputTypes
        ? `"""
    Input Types from State Schema
    """
    ${prefixedStateInputTypes}`
        : ""
    }

    ${moduleSchemas}`;
}

/**
 * Generate new API schema with flat queries, typed state, and async mutations.
 * Note: State schema types are NOT included here because they are already defined
 * in getDocumentModelTypeDefs() which is used during schema composition.
 * Including them here would cause duplicate type definitions.
 */
function generateNewApiSchema(
  documentName: string,
  specification: DocumentModelGlobalState["specifications"][0] | undefined,
  _stateSchemaTypes: string,
  prefixedStateInputTypes: string,
  allTypeNames: string[],
  hasValidSchema: (schema: string | null | undefined) => boolean,
): DocumentNode {
  // Use full state type for all document models
  const stateType = `${documentName}_FullState!`;

  // Shared base types for document state structure (same for all document types)
  const sharedBaseTypes = `
    """Hash configuration for document state"""
    type ${documentName}_PHHashConfig {
      algorithm: String!
      encoding: String!
    }

    """Document scope state (same for all document types)"""
    type ${documentName}_PHDocumentScopeState {
      version: Int!
      hash: ${documentName}_PHHashConfig!
      isDeleted: Boolean
      deletedAtUtcIso: String
      deletedBy: String
      deletionReason: String
    }
  `;

  // Full state type with all scopes (auth, document, global, local)
  // Note: DocumentModel uses different naming convention (GlobalState suffix instead of State)
  // For local state, check if the specification defines a local state type
  const localSchema = specification?.state.local.schema ?? "";
  const hasLocalStateType = localSchema.includes(
    `type ${documentName}LocalState`,
  );

  const globalStateType =
    documentName === "DocumentModel"
      ? `${documentName}_${documentName}GlobalState!`
      : `${documentName}_${documentName}State!`;
  const localStateType = !hasLocalStateType
    ? "JSONObject!"
    : `${documentName}_${documentName}LocalState!`;

  const fullStateType = `
    """Full state with all scopes for ${documentName}"""
    type ${documentName}_FullState {
      auth: JSONObject!
      document: ${documentName}_PHDocumentScopeState!
      global: ${globalStateType}
      local: ${localStateType}
    }
  `;

  // Common input types - use extend to avoid conflicts with other subgraphs
  const commonInputTypes = `
    input ${documentName}_ViewFilterInput {
      branch: String
      scopes: [String!]
    }

    input ${documentName}_PagingInput {
      limit: Int
      offset: Int
      cursor: String
    }

    input ${documentName}_SearchFilterInput {
      parentId: String
      identifiers: [String!]
    }
  `;

  // Revision type - imported from shared-schema.ts for consistency with ReactorSubgraph
  // Must be defined in each subgraph for Apollo Federation
  const revisionType = RevisionType;

  // Result types with typed state (or JSONObject for DocumentModel)
  // The state type (${documentName}_${documentName}State) is defined in getDocumentModelTypeDefs()
  // Uses revisionsList with shared Revision type to match ReactorSubgraph pattern
  const resultTypes = `
    """
    Mutation result type for ${documentName} operations with typed state.
    Matches ReactorSubgraph PHDocument pattern with revisionsList.
    """
    type ${documentName}MutationResult {
      id: String!
      slug: String
      preferredEditor: String
      name: String!
      documentType: String!
      state: ${stateType}
      revisionsList: [Revision!]!
      createdAtUtcIso: DateTime!
      lastModifiedAtUtcIso: DateTime!
    }

    """
    Document with children for ${documentName}
    """
    type ${documentName}_DocumentWithChildren {
      document: ${documentName}MutationResult!
      childIds: [String!]!
    }

    """
    Paginated result type for ${documentName} documents
    """
    type ${documentName}_DocumentResultPage {
      items: [${documentName}MutationResult!]!
      totalCount: Int!
      hasNextPage: Boolean!
      hasPreviousPage: Boolean!
      cursor: String
    }
  `;

  // Queries nested under ${documentName} namespace
  const queries = `
    type ${documentName}Queries {
      """Get a specific ${documentName} document by identifier"""
      document(identifier: String!, view: ${documentName}_ViewFilterInput): ${documentName}_DocumentWithChildren

      """Get all ${documentName} documents (paged)"""
      documents(paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Find ${documentName} documents by search criteria"""
      findDocuments(search: ${documentName}_SearchFilterInput, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Get outgoing relationships of a ${documentName} document"""
      documentOutgoingRelationships(sourceIdentifier: String!, relationshipType: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Get incoming relationships to a ${documentName} document"""
      documentIncomingRelationships(targetIdentifier: String!, relationshipType: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!
    }
  `;

  // Generate initial state input types for each scope
  let initialStateInputSchema = "";
  if (specification) {
    const scopeFields: string[] = [];
    const generatedInputTypeParts: string[] = [];

    for (const [scopeName, scopeState] of Object.entries(specification.state)) {
      const schema = (scopeState as { schema?: string }).schema ?? "";
      if (hasValidSchema(schema)) {
        const rootTypeName = extractRootTypeName(
          schema,
          documentName,
          scopeName,
        );
        if (!rootTypeName) {
          scopeFields.push(`  ${scopeName}: JSONObject`);
          continue;
        }
        const scopeInputTypes = generateStateInputTypes(
          schema,
          new Set(allTypeNames),
        );
        if (!scopeInputTypes) {
          scopeFields.push(`  ${scopeName}: JSONObject`);
          continue;
        }
        const prefixedScopeInputTypes = applyGraphQLTypePrefixes(
          scopeInputTypes,
          documentName,
          allTypeNames,
        );
        scopeFields.push(
          `  ${scopeName}: ${documentName}_${rootTypeName}Input`,
        );
        generatedInputTypeParts.push(prefixedScopeInputTypes);
      } else {
        scopeFields.push(`  ${scopeName}: JSONObject`);
      }
    }

    if (scopeFields.length > 0) {
      const inputTypeDefs = generatedInputTypeParts.join("\n\n");
      const wrapper = `input ${documentName}_InitialStateInput {\n${scopeFields.join("\n")}\n}`;
      initialStateInputSchema = inputTypeDefs
        ? `${inputTypeDefs}\n\n${wrapper}`
        : wrapper;
    }
  }

  // Mutations nested under ${documentName} namespace
  const createDocumentMutation = initialStateInputSchema
    ? `createDocument(name: String!, parentIdentifier: String, slug: String, preferredEditor: String, initialState: ${documentName}_InitialStateInput): ${documentName}MutationResult!`
    : `createDocument(name: String!, parentIdentifier: String, preferredEditor: String): ${documentName}MutationResult!`;
  const createEmptyDocumentMutation = `createEmptyDocument(parentIdentifier: String): ${documentName}MutationResult!`;

  const operationMutations =
    specification?.modules
      .flatMap((module) =>
        module.operations
          .filter((op) => op.name && hasValidSchema(op.schema))
          .flatMap((op) => [
            // Sync mutation
            `${camelCase(op.name!)}(docId: PHID!, input: ${documentName}_${pascalCase(op.name!)}Input!): ${documentName}MutationResult!`,
            // Async mutation
            `${camelCase(op.name!)}Async(docId: PHID!, input: ${documentName}_${pascalCase(op.name!)}Input!): String!`,
          ]),
      )
      .join("\n        ") ?? "";

  const moduleSchemas =
    specification?.modules
      .filter((module) =>
        module.operations.some((op) => hasValidSchema(op.schema)),
      )
      .map(
        (module) =>
          `"""
       Module: ${pascalCase(module.name)}
       """
       ${module.operations
         .filter((op) => hasValidSchema(op.schema))
         .map((op) =>
           applyGraphQLTypePrefixes(
             op.schema ?? "",
             documentName,
             allTypeNames,
           ),
         )
         .join("\n  ")}`,
      )
      .join("\n") ?? "";

  return gql`
    scalar DateTime
    scalar JSONObject
    scalar AttachmentRef

    ${revisionType}

    ${sharedBaseTypes}

    ${fullStateType}

    ${commonInputTypes}

    ${resultTypes}

    """
    Queries: ${documentName} Document
    """
    ${queries}

    """
    Mutations: ${documentName}
    """
    type ${documentName}Mutations {
        ${createDocumentMutation}
        ${createEmptyDocumentMutation}

        ${operationMutations}
    }

    type Query {
      ${documentName}: ${documentName}Queries!
    }

    type Mutation {
      ${documentName}: ${documentName}Mutations!
    }

    ${
      prefixedStateInputTypes
        ? `"""
    Input Types from State Schema
    """
    ${prefixedStateInputTypes}`
        : ""
    }

    ${
      initialStateInputSchema
        ? `"""
    Input Types for Initial State
    """
    ${initialStateInputSchema}`
        : ""
    }

    ${moduleSchemas}`;
}
