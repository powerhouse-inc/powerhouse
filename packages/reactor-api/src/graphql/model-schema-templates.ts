import type { DocumentModelGlobalState } from "@powerhousedao/shared/document-model";
import { pascalCase } from "change-case";
import { Kind, parse, print, type DocumentNode } from "graphql";
import { gql } from "graphql-tag";

/**
 * Matches `Revision` in reactor/schema.graphql. PHDocument and document
 * mutation results use it, and each subgraph must define it for Apollo
 * Federation.
 */
const RevisionType = `
  type Revision {
    scope: String!
    revision: Int!
  }
`;

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

export function getDocumentModelSchemaName(
  documentModel: DocumentModelGlobalState,
) {
  return pascalCase(documentModel.name.replaceAll("/", " "));
}

/**
 * The values the shared templates need beyond literal text. The stored-SDL and
 * structured projections each build one, so both paths render the schema
 * through the same template code.
 */
export type ModelProjection = {
  readonly documentName: string;
  /** One entry per operation that contributes a mutation, in declaration order. */
  readonly operations: readonly {
    readonly camelName: string;
    /** The namespaced input type the mutation takes. */
    readonly inputTypeName: string;
  }[];
  /**
   * Printed, namespaced operation input types per module, in declaration
   * order. A module that declares none is left out.
   */
  readonly modules: readonly { readonly name: string; readonly sdl: string }[];
  /** Printed, namespaced input types declared beside the state. */
  readonly stateInputTypes: string;
  /** The namespaced global state type the new API's full state exposes. */
  readonly globalStateTypeName: string;
  /** The namespaced local state type, or `null` when the model declares none. */
  readonly localStateTypeName: string | null;
  /** The new API's initial-state argument. */
  readonly initialState: {
    /** Printed, namespaced input types the scopes reference. */
    readonly inputTypes: string;
    /** Each scope's input type, or `JSONObject`. Empty when there is no state. */
    readonly scopes: readonly {
      readonly name: string;
      readonly type: string;
    }[];
  };
};

export function generateModelSchema(
  projection: ModelProjection,
  options: DocumentModelSchemaOptions,
): DocumentNode {
  return options.useNewApi === true
    ? generateNewApiSchema(projection)
    : generateLegacyApiSchema(projection);
}

function printModuleSchemas(modules: ModelProjection["modules"]): string {
  return modules
    .map(({ name, sdl }) => {
      const document = parse(sdl);
      const [first, ...rest] = document.definitions;
      if (first && "description" in first && first.description === undefined) {
        return print({
          ...document,
          definitions: [
            {
              ...first,
              description: {
                kind: Kind.STRING,
                value: `Module: ${pascalCase(name)}`,
                block: true,
              },
            },
            ...rest,
          ],
        });
      }
      return print(document);
    })
    .join("\n");
}

/**
 * Generate legacy API schema with nested queries
 */
function generateLegacyApiSchema(projection: ModelProjection): DocumentNode {
  const { documentName } = projection;
  const createDocumentMutation = `${documentName}_createDocument(name:String!, driveId:String): String`;

  const operationMutations = projection.operations
    .map(
      ({ camelName, inputTypeName }) =>
        `${documentName}_${camelName}(
            driveId: String, docId: PHID, input: ${inputTypeName}): Int`,
    )
    .join("\n        ");

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
      projection.stateInputTypes
        ? `"""
    Input Types from State Schema
    """
    ${projection.stateInputTypes}`
        : ""
    }

    ${printModuleSchemas(projection.modules)}`;
}

/**
 * Generate new API schema with flat queries, typed state, and async mutations.
 * Note: State schema types are NOT included here because they are already defined
 * in getDocumentModelTypeDefs() which is used during schema composition.
 * Including them here would cause duplicate type definitions.
 */
function generateNewApiSchema(projection: ModelProjection): DocumentNode {
  const { documentName } = projection;
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

  // Full state type with all scopes (auth, document, global, local). The
  // projection supplies the global and local state type names.
  const globalStateType = `${projection.globalStateTypeName}!`;
  const localStateType =
    projection.localStateTypeName === null
      ? "JSONObject!"
      : `${projection.localStateTypeName}!`;

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
      identifiers: [String!] @deprecated(reason: "Ignored. Filter by parentId.")
    }
  `;

  // Result types with typed state (or JSONObject for DocumentModel)
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
      hasNextPage: Boolean!
      hasPreviousPage: Boolean!
      cursor: String
    }
  `;

  // Queries nested under ${documentName} namespace
  const queries = `
    type ${documentName}Queries {
      """Get a specific ${documentName} document by identifier"""
      document(idOrSlug: String, identifier: String @deprecated(reason: "Use idOrSlug."), view: ${documentName}_ViewFilterInput): ${documentName}_DocumentWithChildren

      """Get all ${documentName} documents (paged)"""
      documents(paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Find ${documentName} documents by search criteria"""
      findDocuments(search: ${documentName}_SearchFilterInput, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Get outgoing relationships of a ${documentName} document"""
      documentOutgoingRelationships(sourceIdOrSlug: String, sourceIdentifier: String @deprecated(reason: "Use sourceIdOrSlug."), relationshipType: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!

      """Get incoming relationships to a ${documentName} document"""
      documentIncomingRelationships(targetIdOrSlug: String, targetIdentifier: String @deprecated(reason: "Use targetIdOrSlug."), relationshipType: String!, view: ${documentName}_ViewFilterInput, paging: ${documentName}_PagingInput): ${documentName}_DocumentResultPage!
    }
  `;

  const { initialState } = projection;
  const initialStateInputSchema =
    initialState.scopes.length === 0
      ? ""
      : [
          initialState.inputTypes,
          `input ${documentName}_InitialStateInput {\n${initialState.scopes
            .map(({ name, type }) => `  ${name}: ${type}`)
            .join("\n")}\n}`,
        ]
          .filter(Boolean)
          .join("\n\n");

  // Mutations nested under ${documentName} namespace
  const createDocumentMutation = initialStateInputSchema
    ? `createDocument(name: String!, parentIdOrSlug: String, parentIdentifier: String @deprecated(reason: "Use parentIdOrSlug."), slug: String, preferredEditor: String, initialState: ${documentName}_InitialStateInput): ${documentName}MutationResult!`
    : `createDocument(name: String!, parentIdOrSlug: String, parentIdentifier: String @deprecated(reason: "Use parentIdOrSlug."), preferredEditor: String): ${documentName}MutationResult!`;
  const createEmptyDocumentMutation = `createEmptyDocument(parentIdOrSlug: String, parentIdentifier: String @deprecated(reason: "Use parentIdOrSlug.")): ${documentName}MutationResult!`;

  const operationMutations = projection.operations
    .flatMap(({ camelName, inputTypeName }) => [
      // Sync mutation
      `${camelName}(documentIdOrSlug: String, docId: PHID @deprecated(reason: "Use documentIdOrSlug."), input: ${inputTypeName}!): ${documentName}MutationResult!`,
      // Async mutation
      `${camelName}Async(documentIdOrSlug: String, docId: PHID @deprecated(reason: "Use documentIdOrSlug."), input: ${inputTypeName}!): String!`,
    ])
    .join("\n        ");

  return gql`
    scalar DateTime
    scalar JSONObject
    scalar AttachmentRef

    ${RevisionType}

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
      projection.stateInputTypes
        ? `"""
    Input Types from State Schema
    """
    ${projection.stateInputTypes}`
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

    ${printModuleSchemas(projection.modules)}`;
}
