import { camelCase, kebabCase } from "change-case";
import { setName, type DocumentModelModule } from "document-model";
import { GraphQLError, Kind, parse } from "graphql";
import {
  generateDocumentModelSchema,
  getDocumentModelSchemaName,
} from "../utils/create-schema.js";
import { BaseSubgraph } from "./base-subgraph.js";
import { toGqlPhDocument } from "./reactor/adapters.js";
import type {
  PhDocument,
  PhDocumentResultPage,
} from "./reactor/gen/graphql.js";
import {
  createDocumentWithInitialState as createDocumentWithInitialStateResolver,
  createEmptyDocument as createEmptyDocumentResolver,
  documentChildren as documentChildrenResolver,
  documentParents as documentParentsResolver,
  document as documentResolver,
  findDocuments as findDocumentsResolver,
} from "./reactor/resolvers.js";
import type { Context, SubgraphArgs } from "./types.js";

/** A resolver function that lives inside a document-model subgraph. */

export type DocumentModelResolverFn = (...args: any[]) => unknown;

/**
 * A resolver map for a single GraphQL type in a document-model subgraph.
 * Each key is a field name (or `__resolveType` for unions) and each value
 * is a resolver function.
 */
export type DocumentModelResolverMap = Record<string, DocumentModelResolverFn>;

/** View filter shared across query resolvers. */
type ViewArg = { branch?: string; scopes?: string[] };

/** Paging argument shared across query resolvers. */
type PagingArg = { limit?: number; offset?: number; cursor?: string };

/**
 * Known query resolvers generated for every document model.
 * `TDocument` is the GQL representation of the document (defaults to `PhDocument`).
 */
export interface DocumentModelQueryResolvers<
  TDocument extends PhDocument = PhDocument,
> {
  document: (
    parent: unknown,
    args: { identifier: string; view?: ViewArg },
    ctx: Context,
  ) => Promise<{ document: TDocument; childIds: string[] }>;
  findDocuments: (
    parent: unknown,
    args: {
      search?: { parentId?: string; identifiers?: string[] };
      view?: ViewArg;
      paging?: PagingArg;
    },
    ctx: Context,
  ) => Promise<PhDocumentResultPage>;
  documentChildren: (
    parent: unknown,
    args: { parentIdentifier: string; view?: ViewArg; paging?: PagingArg },
    ctx: Context,
  ) => Promise<PhDocumentResultPage>;
  documentParents: (
    parent: unknown,
    args: { childIdentifier: string; view?: ViewArg; paging?: PagingArg },
    ctx: Context,
  ) => Promise<PhDocumentResultPage>;
}

/**
 * Known mutation resolvers generated for every document model.
 * `TDocument` is the GQL representation of the document (defaults to `PhDocument`).
 * Operations specific to each model are captured by the index signature.
 */
export interface DocumentModelMutationResolvers<
  TDocument extends PhDocument = PhDocument,
> {
  createDocument: (
    parent: unknown,
    args: {
      name: string;
      parentIdentifier?: string;
      slug?: string;
      preferredEditor?: string;
      initialState?: Record<string, Record<string, unknown>>;
    },
    ctx: Context,
  ) => Promise<TDocument>;
  createEmptyDocument: (
    parent: unknown,
    args: { parentIdentifier?: string },
    ctx: Context,
  ) => Promise<TDocument>;
  /** Dynamic operation resolvers (sync and async variants). */
  [operationName: string]: DocumentModelResolverFn;
}

/** The resolvers that a `DocumentModelSubgraph` exposes. */
export interface DocumentModelSubgraphResolvers<
  TDocument extends PhDocument = PhDocument,
> {
  Query: DocumentModelResolverMap;
  Mutation: DocumentModelResolverMap;
  [namespaceKey: string]:
    | DocumentModelResolverMap
    | DocumentModelQueryResolvers<TDocument>
    | DocumentModelMutationResolvers<TDocument>;
}

/**
 * New document model subgraph that uses reactorClient instead of legacy reactor.
 * This class auto-generates GraphQL queries and mutations for a document model.
 */
export class DocumentModelSubgraph extends BaseSubgraph {
  declare resolvers: DocumentModelSubgraphResolvers;
  private documentModel: DocumentModelModule;

  constructor(documentModel: DocumentModelModule, args: SubgraphArgs) {
    super(args);
    this.documentModel = documentModel;
    this.name = kebabCase(documentModel.documentModel.global.name);
    this.typeDefs = generateDocumentModelSchema(
      this.documentModel.documentModel.global,
      { useNewApi: true },
    );
    this.resolvers = this.generateResolvers();
  }

  /** Returns the typed query resolvers for this document model. */
  get queryResolvers(): DocumentModelQueryResolvers {
    const documentName = getDocumentModelSchemaName(
      this.documentModel.documentModel.global,
    );
    return this.resolvers[
      `${documentName}Queries`
    ] as DocumentModelQueryResolvers;
  }

  /** Returns the typed mutation resolvers for this document model. */
  get mutationResolvers(): DocumentModelMutationResolvers {
    const documentName = getDocumentModelSchemaName(
      this.documentModel.documentModel.global,
    );
    return this.resolvers[
      `${documentName}Mutations`
    ] as DocumentModelMutationResolvers;
  }

  /**
   * Generate __resolveType functions for union types found in the document model schema.
   * Parses the state schema to find union definitions and their member types,
   * then uses unique field presence to discriminate between member types at runtime.
   */
  private generateUnionResolvers(): Record<string, DocumentModelResolverMap> {
    const documentName = getDocumentModelSchemaName(
      this.documentModel.documentModel.global,
    );
    const specification =
      this.documentModel.documentModel.global.specifications.at(-1);
    if (!specification) return {};

    const globalSchema = specification.state.global.schema ?? "";
    const localSchema = specification.state.local.schema ?? "";
    const fullSchema = `${globalSchema}\n${localSchema}`;

    if (!fullSchema.trim()) return {};

    let ast;
    try {
      ast = parse(fullSchema);
    } catch {
      return {};
    }

    // Build map: object type name -> field names
    const objectFieldsMap = new Map<string, string[]>();
    for (const def of ast.definitions) {
      if (def.kind === Kind.OBJECT_TYPE_DEFINITION) {
        objectFieldsMap.set(
          def.name.value,
          def.fields?.map((f) => f.name.value) ?? [],
        );
      }
    }

    const resolvers: Record<string, DocumentModelResolverMap> = {};

    for (const def of ast.definitions) {
      if (def.kind !== Kind.UNION_TYPE_DEFINITION) continue;

      const unionName = def.name.value;
      const memberTypes = def.types?.map((t) => t.name.value) ?? [];
      if (memberTypes.length === 0) continue;

      // Compute unique fields per member type
      const uniqueFields: Record<string, string[]> = {};
      for (const memberType of memberTypes) {
        const ownFields = objectFieldsMap.get(memberType) ?? [];
        const otherFields = new Set(
          memberTypes
            .filter((t) => t !== memberType)
            .flatMap((t) => objectFieldsMap.get(t) ?? []),
        );
        uniqueFields[memberType] = ownFields.filter((f) => !otherFields.has(f));
      }

      const prefixedUnionName = `${documentName}_${unionName}`;

      resolvers[prefixedUnionName] = {
        __resolveType: (obj: Record<string, unknown>) => {
          for (const memberType of memberTypes) {
            const fields = uniqueFields[memberType] ?? [];
            if (fields.length > 0 && fields.some((f) => f in obj)) {
              return `${documentName}_${memberType}`;
            }
          }
          return `${documentName}_${memberTypes[0]}`;
        },
      };
    }

    return resolvers;
  }

  /**
   * Generate resolvers for this document model using reactorClient
   * Uses flat queries (not nested) consistent with ReactorSubgraph patterns
   */
  private generateResolvers(): DocumentModelSubgraphResolvers {
    const documentType = this.documentModel.documentModel.global.id;
    const documentName = getDocumentModelSchemaName(
      this.documentModel.documentModel.global,
    );
    const operations =
      this.documentModel.documentModel.global.specifications
        .at(-1)
        ?.modules.flatMap((module) =>
          module.operations.filter((op) => op.name),
        ) ?? [];

    return {
      ...this.generateUnionResolvers(),
      Query: {
        // Namespace resolver: returns empty object so nested field resolvers can run
        [documentName]: () => ({}),
      },
      [`${documentName}Queries`]: {
        // Get a specific document by identifier
        document: async (
          _: unknown,
          args: {
            identifier: string;
            view?: { branch?: string; scopes?: string[] };
          },
          ctx: Context,
        ) => {
          const { identifier, view } = args;

          if (!identifier) {
            throw new GraphQLError("Document identifier is required");
          }

          const result = await documentResolver(this.reactorClient, {
            identifier,
            view,
          });

          if (result.document.documentType !== documentType) {
            throw new GraphQLError(
              `Document with id ${identifier} is not of type ${documentType}`,
            );
          }

          await this.assertCanRead(result.document.id, ctx);

          return result;
        },
        // Flat query: Find documents by search criteria (type is built-in)
        // Uses shared findDocumentsResolver from reactor/resolvers.ts
        findDocuments: async (
          _: unknown,
          args: {
            search?: { parentId?: string; identifiers?: string[] };
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { search, view, paging } = args;

          const result = await findDocumentsResolver(this.reactorClient, {
            search: {
              ...search,
              type: documentType,
              parentId: search?.parentId,
            },
            view,
            paging,
          });

          if (
            !this.hasGlobalAdminAccess(ctx) &&
            this.documentPermissionService
          ) {
            const filteredItems = [];
            for (const item of result.items) {
              const canRead = await this.canReadDocument(item.id, ctx);
              if (canRead) {
                filteredItems.push(item);
              }
            }
            return {
              ...result,
              items: filteredItems,
              totalCount: filteredItems.length,
            };
          }

          return result;
        },

        // Get children of a document (filtered by this document type)
        documentChildren: async (
          _: unknown,
          args: {
            parentIdentifier: string;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { parentIdentifier, view, paging } = args;

          await this.assertCanRead(parentIdentifier, ctx);

          const result = await documentChildrenResolver(this.reactorClient, {
            parentIdentifier,
            view,
            paging,
          });

          const filteredItems = result.items.filter(
            (item) => item.documentType === documentType,
          );

          return {
            ...result,
            items: filteredItems,
            totalCount: filteredItems.length,
          };
        },

        // Get parents of a document
        documentParents: async (
          _: unknown,
          args: {
            childIdentifier: string;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { childIdentifier, view, paging } = args;

          await this.assertCanRead(childIdentifier, ctx);

          return documentParentsResolver(this.reactorClient, {
            childIdentifier,
            view,
            paging,
          });
        },
      },
      Mutation: {
        // Namespace resolver: returns empty object so nested field resolvers can run
        [documentName]: () => ({}),
      },
      [`${documentName}Mutations`]: {
        createDocument: async (
          _: unknown,
          args: {
            name: string;
            parentIdentifier?: string;
            slug?: string;
            preferredEditor?: string;
            initialState?: Record<string, Record<string, unknown>>;
          },
          ctx: Context,
        ) => {
          const {
            parentIdentifier,
            name,
            slug,
            preferredEditor,
            initialState,
          } = args;

          if (parentIdentifier) {
            await this.assertCanWrite(parentIdentifier, ctx);
          } else if (this.authorizationService) {
            if (!ctx.user?.address) {
              throw new GraphQLError(
                "Forbidden: authentication required to create documents",
              );
            }
          } else if (!this.hasGlobalAdminAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          let createdDoc;
          if (initialState || preferredEditor) {
            createdDoc = await createDocumentWithInitialStateResolver(
              this.reactorClient,
              {
                documentType,
                parentIdentifier,
                name,
                slug,
                preferredEditor,
                initialState: initialState ?? {},
              },
            );
          } else {
            createdDoc = await createEmptyDocumentResolver(this.reactorClient, {
              documentType,
              parentIdentifier,
              name,
            });
          }

          // Auto-ownership: set creator as document owner
          if (
            this.authorizationService &&
            ctx.user?.address &&
            createdDoc?.id
          ) {
            await this.documentPermissionService?.initializeDocumentProtection(
              createdDoc.id,
              ctx.user.address,
              this.authorizationService.config.defaultProtection,
            );
          }

          // Name fallback via SET_NAME (only for non-initialState path,
          // since initialState path sets name on header before creation)
          if (
            !initialState &&
            !preferredEditor &&
            name &&
            createdDoc.name !== name
          ) {
            const updatedDoc = await this.reactorClient.execute(
              createdDoc.id,
              "main",
              [setName(name)],
            );
            return toGqlPhDocument(updatedDoc);
          }

          return createdDoc;
        },
        createEmptyDocument: async (
          _: unknown,
          args: { parentIdentifier?: string },
          ctx: Context,
        ) => {
          const { parentIdentifier } = args;

          if (parentIdentifier) {
            await this.assertCanWrite(parentIdentifier, ctx);
          } else if (this.authorizationService) {
            if (!ctx.user?.address) {
              throw new GraphQLError(
                "Forbidden: authentication required to create documents",
              );
            }
          } else if (!this.hasGlobalAdminAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          const result = await createEmptyDocumentResolver(this.reactorClient, {
            documentType,
            parentIdentifier,
          });

          // Auto-ownership: set creator as document owner
          if (this.authorizationService && ctx.user?.address && result?.id) {
            await this.documentPermissionService?.initializeDocumentProtection(
              result.id,
              ctx.user.address,
              this.authorizationService.config.defaultProtection,
            );
          }

          return result;
        },
        // Generate sync and async mutations for each operation
        ...operations.reduce((mutations, op) => {
          // Sync mutation
          mutations[camelCase(op.name!)] = async (
            _: unknown,
            args: { docId: string; input: unknown },
            ctx: Context,
          ) => {
            const { docId, input } = args;

            if (!this.authorizationService) {
              await this.assertCanWrite(docId, ctx);
            }
            await this.assertCanExecuteOperation(docId, op.name!, ctx);

            const doc = await this.reactorClient.get(docId);
            if (doc.header.documentType !== documentType) {
              throw new GraphQLError(
                `Document with id ${docId} is not of type ${documentType}`,
              );
            }

            const action = this.documentModel.actions[camelCase(op.name!)];
            if (!action) {
              throw new GraphQLError(`Action ${op.name} not found`);
            }

            try {
              const updatedDoc = await this.reactorClient.execute(
                docId,
                "main",
                [action(input)],
              );
              return toGqlPhDocument(updatedDoc);
            } catch (error) {
              throw new GraphQLError(
                error instanceof Error ? error.message : `Failed to ${op.name}`,
              );
            }
          };

          // Async mutation - returns job ID
          mutations[`${camelCase(op.name!)}Async`] = async (
            _: unknown,
            args: { docId: string; input: unknown },
            ctx: Context,
          ) => {
            const { docId, input } = args;

            if (!this.authorizationService) {
              await this.assertCanWrite(docId, ctx);
            }
            await this.assertCanExecuteOperation(docId, op.name!, ctx);

            const doc = await this.reactorClient.get(docId);
            if (doc.header.documentType !== documentType) {
              throw new GraphQLError(
                `Document with id ${docId} is not of type ${documentType}`,
              );
            }

            const action = this.documentModel.actions[camelCase(op.name!)];
            if (!action) {
              throw new GraphQLError(`Action ${op.name} not found`);
            }

            try {
              const jobInfo = await this.reactorClient.executeAsync(
                docId,
                "main",
                [action(input)],
              );
              return jobInfo.id;
            } catch (error) {
              throw new GraphQLError(
                error instanceof Error ? error.message : `Failed to ${op.name}`,
              );
            }
          };

          return mutations;
        }, {} as DocumentModelResolverMap),
      },
    };
  }
}
