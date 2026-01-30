import { buildSubgraphSchema } from "@apollo/subgraph";
import type {
  GraphQLResolverMap,
  GraphQLSchemaModule,
} from "@apollo/subgraph/dist/schema-helper/resolverMap.js";
import { typeDefs as scalarsTypeDefs } from "@powerhousedao/document-engineering/graphql";
import type { Context } from "@powerhousedao/reactor-api";
import { camelCase, pascalCase } from "change-case";
import { childLogger, type IDocumentDriveServer } from "document-drive";
import type { DocumentModelGlobalState } from "document-model";
import { type DocumentNode, Kind, print } from "graphql";
import { gql } from "graphql-tag";
import { GraphQLJSONObject } from "graphql-type-json";

const logger = childLogger(["reactor-api", "create-schema"]);

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

export const buildSubgraphSchemaModule = (
  documentDriveServer: IDocumentDriveServer,
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
): GraphQLSchemaModule => {
  const newResolvers = {
    ...resolvers,
    JSONObject: GraphQLJSONObject,
  };

  return {
    typeDefs: getDocumentModelTypeDefs(documentDriveServer, typeDefs),
    resolvers: newResolvers,
  };
};
export const createSchema = (
  documentDriveServer: IDocumentDriveServer,
  resolvers: GraphQLResolverMap<Context>,
  typeDefs: DocumentNode,
) => {
  return buildSubgraphSchema(
    buildSubgraphSchemaModule(documentDriveServer, resolvers, typeDefs),
  );
};

export function getDocumentModelSchemaName(
  documentModel: DocumentModelGlobalState,
) {
  return pascalCase(documentModel.name.replaceAll("/", " "));
}

export const getDocumentModelTypeDefs = (
  documentDriveServer: Pick<IDocumentDriveServer, "getDocumentModelModules">,
  typeDefs: DocumentNode,
) => {
  const documentModels = documentDriveServer.getDocumentModelModules();
  let dmSchema = "";

  const addedDocumentModels = new Set<string>();
  documentModels.forEach(({ documentModel }) => {
    const dmSchemaName = getDocumentModelSchemaName(documentModel.global);
    if (addedDocumentModels.has(dmSchemaName)) {
      logger.debug(
        `Skipping document model with duplicate name: ${dmSchemaName}`,
      );
      return;
    }
    addedDocumentModels.add(dmSchemaName);
    let tmpDmSchema = `
          ${documentModel.global.specifications
            .map((specification) =>
              specification.state.global.schema
                .replaceAll("scalar DateTime", "")
                .replaceAll(/input (.*?) {[\s\S]*?}/g, ""),
            )
            .join("\n")};
  
          ${documentModel.global.specifications
            .map((specification) =>
              specification.state.local.schema
                .replaceAll("scalar DateTime", "")
                .replaceAll(/input (.*?) {[\s\S]*?}/g, "")
                .replaceAll("type AccountSnapshotLocalState", "")
                .replaceAll("type BudgetStatementLocalState", "")
                .replaceAll("type ScopeFrameworkLocalState", ""),
            )
            .join("\n")};

    \n`;

    const found = tmpDmSchema.match(/(type|enum|union|interface)\s+(\w+)\s/g);
    const trimmedFound = found?.map((f) =>
      f
        .replaceAll("type ", "")
        .replaceAll("enum ", "")
        .replaceAll("union ", "")
        .replaceAll("interface ", "")
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
    dmSchema += `
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
          }\n`;
  });

  // add the mutation and query types
  const schema = gql`
    scalar JSONObject
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

  return schema;
};

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
  const { useNewApi = false } = options;

  const specification = documentModel.specifications.at(-1);
  const documentName = getDocumentModelSchemaName(documentModel);
  const stateSchema = specification?.state.global.schema;
  const stateTypeNames = extractTypeNames(stateSchema ?? "");

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
    stateSchema ?? "",
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
  const stateSchemaTypes = stateSchema
    ? applyGraphQLTypePrefixes(
        stateSchema
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
 *
 * Special case: DocumentModel type doesn't have a typed state defined in
 * getDocumentModelTypeDefs(), so we use JSONObject for its state field.
 */
function generateNewApiSchema(
  documentName: string,
  specification: DocumentModelGlobalState["specifications"][0] | undefined,
  _stateSchemaTypes: string,
  prefixedStateInputTypes: string,
  allTypeNames: string[],
  hasValidSchema: (schema: string | null | undefined) => boolean,
): DocumentNode {
  // Special case: DocumentModel doesn't have a typed state in getDocumentModelTypeDefs()
  // Use JSONObject as fallback for DocumentModel, typed state for everything else
  const stateType =
    documentName === "DocumentModel"
      ? "JSONObject"
      : `${documentName}_${documentName}State!`;

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

  // Result types with typed state (or JSONObject for DocumentModel)
  // The state type (${documentName}_${documentName}State) is defined in getDocumentModelTypeDefs()
  const resultTypes = `
    """
    Mutation result type for ${documentName} operations with typed state
    """
    type ${documentName}MutationResult {
      id: String!
      name: String!
      documentType: String!
      revision: Int!
      state: ${stateType}
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

  // Flat queries (not nested) - prefixed input types to avoid conflicts
  const queries = `
    type Query {
      """Get a specific ${documentName} document by identifier"""
      ${documentName}_document(identifier: String!, view: ${documentName}_ViewFilterInput): ${documentName}_DocumentWithChildren

      """Find ${documentName} documents by search criteria"""
      ${documentName}_findDocuments(search: ${documentName}_SearchFilterInput!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Get children of a ${documentName} document"""
      ${documentName}_documentChildren(parentIdentifier: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Get parents of a ${documentName} document"""
      ${documentName}_documentParents(childIdentifier: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!
    }
  `;

  // Mutations: sync and async versions
  const createDocumentMutation = `${documentName}_createDocument(name: String!, driveId: String): ${documentName}MutationResult!`;
  const createEmptyDocumentMutation = `${documentName}_createEmptyDocument(driveId: String): ${documentName}MutationResult!`;

  const operationMutations =
    specification?.modules
      .flatMap((module) =>
        module.operations
          .filter((op) => op.name && hasValidSchema(op.schema))
          .flatMap((op) => [
            // Sync mutation
            `${documentName}_${camelCase(op.name!)}(docId: PHID!, input: ${documentName}_${pascalCase(op.name!)}Input!): ${documentName}MutationResult!`,
            // Async mutation
            `${documentName}_${camelCase(op.name!)}Async(docId: PHID!, input: ${documentName}_${pascalCase(op.name!)}Input!): String!`,
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

    ${commonInputTypes}

    ${resultTypes}

    """
    Queries: ${documentName} Document
    """
    ${queries}

    """
    Mutations: ${documentName}
    """
    type Mutation {
        ${createDocumentMutation}
        ${createEmptyDocumentMutation}

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
