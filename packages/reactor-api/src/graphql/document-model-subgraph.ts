import { camelCase, kebabCase } from "change-case";
import {
  setName,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { GraphQLError, Kind, parse } from "graphql";
import {
  generateDocumentModelSchema,
  getDocumentModelSchemaName,
} from "../utils/create-schema.js";
import type { CanonicalDocumentId } from "../services/authorization.service.js";
import { BaseSubgraph } from "./base-subgraph.js";
import { structuredOperationNames } from "./structured-model-schema.js";
import { structuredModelOf } from "./structured-projection.js";
import { toGqlPhDocument } from "./reactor/adapters.js";
import type {
  PhDocument,
  PhDocumentResultPage,
} from "./reactor/gen/graphql.js";
import {
  createDocumentWithInitialState as createDocumentWithInitialStateResolver,
  createEmptyDocument as createEmptyDocumentResolver,
  documentIncomingRelationships as documentIncomingRelationshipsResolver,
  documentOutgoingRelationships as documentOutgoingRelationshipsResolver,
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
  documents: (
    parent: unknown,
    args: { paging?: PagingArg },
    ctx: Context,
  ) => Promise<{ items: TDocument[] }>;
  findDocuments: (
    parent: unknown,
    args: {
      search?: { parentId?: string; identifiers?: string[] } | null;
      view?: ViewArg;
      paging?: PagingArg;
    },
    ctx: Context,
  ) => Promise<PhDocumentResultPage>;
  documentOutgoingRelationships: (
    parent: unknown,
    args: {
      sourceIdentifier: string;
      relationshipType: string;
      view?: ViewArg;
      paging?: PagingArg;
    },
    ctx: Context,
  ) => Promise<PhDocumentResultPage>;
  documentIncomingRelationships: (
    parent: unknown,
    args: {
      targetIdentifier: string;
      relationshipType: string;
      view?: ViewArg;
      paging?: PagingArg;
    },
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
 * Resolves a union value to the first member that has a field no sibling has,
 * or to the first member when none matches.
 */
function unionResolver(
  documentName: string,
  members: readonly string[],
  fieldsByObject: ReadonlyMap<string, readonly string[]>,
): DocumentModelResolverMap {
  const uniqueFields = new Map(
    members.map((member) => {
      const others = new Set(
        members
          .filter((candidate) => candidate !== member)
          .flatMap((candidate) => fieldsByObject.get(candidate) ?? []),
      );
      const own = fieldsByObject.get(member) ?? [];
      return [member, own.filter((field) => !others.has(field))] as const;
    }),
  );
  return {
    __resolveType: (obj: Record<string, unknown>) => {
      for (const member of members) {
        const fields = uniqueFields.get(member) ?? [];
        if (fields.length > 0 && fields.some((field) => field in obj)) {
          return `${documentName}_${member}`;
        }
      }
      return `${documentName}_${members[0]}`;
    },
  };
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
    this.typeDefs = generateDocumentModelSchema(this.documentModel, {
      useNewApi: true,
    });
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
   * Builds `__resolveType` for each union the model's state declares. A
   * code-first model reads its structured types. A schema-first model parses
   * its state schema. Both pick the member by the presence of a field unique
   * to it.
   */
  private generateUnionResolvers(): Record<string, DocumentModelResolverMap> {
    const documentName = getDocumentModelSchemaName(
      this.documentModel.documentModel.global,
    );
    const structured = structuredModelOf(this.documentModel);
    if (structured !== null) {
      const stateTypes = [
        ...structured.segments.global,
        ...structured.segments.local,
      ];
      const fieldsByObject = new Map(
        stateTypes.flatMap((type) =>
          type.kind === "object"
            ? [[type.name, type.fields.map((field) => field.name)] as const]
            : [],
        ),
      );
      const resolvers: Record<string, DocumentModelResolverMap> = {};
      for (const type of stateTypes) {
        if (type.kind !== "union" || type.members.length === 0) continue;
        resolvers[`${documentName}_${type.name}`] = unionResolver(
          documentName,
          type.members,
          fieldsByObject,
        );
      }
      return resolvers;
    }
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

      const prefixedUnionName = `${documentName}_${unionName}`;
      resolvers[prefixedUnionName] = unionResolver(
        documentName,
        memberTypes,
        objectFieldsMap,
      );
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
    const structured = structuredModelOf(this.documentModel);
    const operations =
      structured !== null
        ? structuredOperationNames(structured).map((name) => ({ name }))
        : (this.documentModel.documentModel.global.specifications
            .at(-1)
            ?.modules.flatMap((module) =>
              module.operations.filter((op) => op.name),
            ) ?? []);

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

          await this.assertCanReadCanonical(
            result.document.id as CanonicalDocumentId,
            ctx,
          );

          return result;
        },
        // Flat query: Get all documents of this type (paged)
        documents: async (
          _: unknown,
          args: {
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { paging } = args;

          const result = await findDocumentsResolver(this.reactorClient, {
            search: { type: documentType },
            paging,
          });

          // Filter by permission if needed
          if (!this.authorizationService.isSupremeAdmin(ctx.user?.address)) {
            const filteredItems = [];
            for (const item of result.items) {
              const canRead = await this.canReadDocument(
                item.id as CanonicalDocumentId,
                ctx,
              );
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
        // Flat query: Find documents by search criteria (type is built-in)
        // Uses shared findDocumentsResolver from reactor/resolvers.ts
        findDocuments: async (
          _: unknown,
          args: {
            search?: { parentId?: string; identifiers?: string[] } | null;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { search, view, paging } = args;

          const result = await findDocumentsResolver(this.reactorClient, {
            search: {
              type: documentType,
              parentId: search?.parentId,
            },
            view,
            paging,
          });

          if (!this.authorizationService.isSupremeAdmin(ctx.user?.address)) {
            const filteredItems = [];
            for (const item of result.items) {
              const canRead = await this.canReadDocument(
                item.id as CanonicalDocumentId,
                ctx,
              );
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

        documentOutgoingRelationships: async (
          _: unknown,
          args: {
            sourceIdentifier: string;
            relationshipType: string;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { relationshipType, view, paging } = args;

          const handle = await this.assertCanRead(args.sourceIdentifier, ctx);

          const result = await documentOutgoingRelationshipsResolver(
            this.reactorClient,
            {
              sourceIdentifier: handle.fetchIdentifier,
              relationshipType,
              view,
              paging,
            },
          );

          const filteredItems = result.items.filter(
            (item: PhDocument) => item.documentType === documentType,
          );

          return {
            ...result,
            items: filteredItems,
            totalCount: filteredItems.length,
          };
        },

        documentIncomingRelationships: async (
          _: unknown,
          args: {
            targetIdentifier: string;
            relationshipType: string;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { relationshipType, view, paging } = args;

          const handle = await this.assertCanRead(args.targetIdentifier, ctx);

          return documentIncomingRelationshipsResolver(this.reactorClient, {
            targetIdentifier: handle.fetchIdentifier,
            relationshipType,
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
          const { name, slug, preferredEditor, initialState } = args;

          let parentIdentifier = args.parentIdentifier;
          if (parentIdentifier) {
            const handle = await this.assertCanWrite(parentIdentifier, ctx);
            parentIdentifier = handle.fetchIdentifier;
          } else {
            this.assertCanCreate(ctx);
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
              this.graphqlManager.reactorDriveClient,
            );
          } else {
            createdDoc = await createEmptyDocumentResolver(
              this.reactorClient,
              {
                documentType,
                parentIdentifier,
                name,
              },
              this.graphqlManager.reactorDriveClient,
            );
          }

          // Auto-ownership: set creator as document owner
          if (ctx.user?.address && createdDoc?.id) {
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
          let parentIdentifier = args.parentIdentifier;
          if (parentIdentifier) {
            const handle = await this.assertCanWrite(parentIdentifier, ctx);
            parentIdentifier = handle.fetchIdentifier;
          } else {
            this.assertCanCreate(ctx);
          }

          const result = await createEmptyDocumentResolver(
            this.reactorClient,
            {
              documentType,
              parentIdentifier,
            },
            this.graphqlManager.reactorDriveClient,
          );

          // Auto-ownership: set creator as document owner
          if (ctx.user?.address && result?.id) {
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

            const handle = await this.assertCanExecuteOperation(
              docId,
              op.name!,
              ctx,
            );
            const effectiveDocId = handle.fetchIdentifier;

            const doc = await this.reactorClient.get(effectiveDocId);
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
                effectiveDocId,
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

            const handle = await this.assertCanExecuteOperation(
              docId,
              op.name!,
              ctx,
            );
            const effectiveDocId = handle.fetchIdentifier;

            const doc = await this.reactorClient.get(effectiveDocId);
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
                effectiveDocId,
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
