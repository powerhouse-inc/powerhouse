import { camelCase, kebabCase } from "change-case";
import {
  setName,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { GraphQLError, Kind, parse } from "graphql";
import {
  generateDocumentModelSchema,
  generateDocumentModelSchemaFromDefinition,
  getDocumentModelModuleSchemaName,
} from "../utils/create-schema.js";
import type { CanonicalDocumentId } from "../services/authorization.service.js";
import { BaseSubgraph } from "./base-subgraph.js";
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

type AbstractTypeDefinition = {
  readonly name: string;
  readonly members: readonly string[];
};

type RuntimeOperation = {
  readonly actionKey: string;
  readonly fieldName: string;
  readonly operationType: string;
};

function createAbstractTypeResolvers(
  prefix: string,
  definitions: readonly AbstractTypeDefinition[],
  objectFields: ReadonlyMap<string, readonly string[]>,
): Record<string, DocumentModelResolverMap> {
  const resolvers = Object.create(null) as Record<
    string,
    DocumentModelResolverMap
  >;

  for (const definition of definitions) {
    if (definition.members.length === 0) continue;
    const uniqueFields = new Map(
      definition.members.map((member) => {
        const otherFields = new Set(
          definition.members
            .filter((candidate) => candidate !== member)
            .flatMap((candidate) => objectFields.get(candidate) ?? []),
        );
        return [
          member,
          (objectFields.get(member) ?? []).filter(
            (field) => !otherFields.has(field),
          ),
        ] as const;
      }),
    );

    resolvers[`${prefix}_${definition.name}`] = {
      __resolveType: (value: unknown) => {
        if (typeof value !== "object" || value === null) return null;
        const object = value as Record<string, unknown>;
        try {
          const typeDescriptor = Object.getOwnPropertyDescriptor(
            object,
            "__typename",
          );
          const explicitType =
            typeDescriptor && "value" in typeDescriptor
              ? (typeDescriptor.value as unknown)
              : undefined;
          if (typeof explicitType === "string") {
            const member = explicitType.startsWith(`${prefix}_`)
              ? explicitType.slice(prefix.length + 1)
              : explicitType;
            if (definition.members.includes(member)) {
              return `${prefix}_${member}`;
            }
          }

          const matches = definition.members.filter((member) =>
            (uniqueFields.get(member) ?? []).some((field) =>
              Object.hasOwn(object, field),
            ),
          );
          if (matches.length === 1) {
            return `${prefix}_${matches[0]}`;
          }
        } catch {
          // Accessor-backed tags and hostile proxies are not valid type hints.
        }
        return null;
      },
    };
  }

  return resolvers;
}

/**
 * New document model subgraph that uses reactorClient instead of legacy reactor.
 * This class auto-generates GraphQL queries and mutations for a document model.
 */
export class DocumentModelSubgraph extends BaseSubgraph {
  declare resolvers: DocumentModelSubgraphResolvers;
  readonly documentModel: DocumentModelModule;

  constructor(documentModel: DocumentModelModule, args: SubgraphArgs) {
    super(args);
    this.documentModel = documentModel;
    this.name = kebabCase(documentModel.documentModel.global.name);
    this.typeDefs = this.documentModel.definition
      ? generateDocumentModelSchemaFromDefinition(
          this.documentModel.definition,
          { useNewApi: true },
        )
      : generateDocumentModelSchema(this.documentModel.documentModel.global, {
          useNewApi: true,
        });
    this.resolvers = this.generateResolvers();
  }

  /** Returns the typed query resolvers for this document model. */
  get queryResolvers(): DocumentModelQueryResolvers {
    const documentName = getDocumentModelModuleSchemaName(this.documentModel);
    return this.resolvers[
      `${documentName}Queries`
    ] as DocumentModelQueryResolvers;
  }

  /** Returns the typed mutation resolvers for this document model. */
  get mutationResolvers(): DocumentModelMutationResolvers {
    const documentName = getDocumentModelModuleSchemaName(this.documentModel);
    return this.resolvers[
      `${documentName}Mutations`
    ] as DocumentModelMutationResolvers;
  }

  /** Create resolvers for union and interface values in document state. */
  private generateAbstractTypeResolvers(): Record<
    string,
    DocumentModelResolverMap
  > {
    const documentName = getDocumentModelModuleSchemaName(this.documentModel);
    const specification =
      this.documentModel.documentModel.global.specifications.at(-1);
    if (!specification) return {};

    const structuredSpecification =
      this.documentModel.definition?.specifications.at(-1);
    if (structuredSpecification) {
      const objectDefinitions = structuredSpecification.types.filter(
        (definition) => definition.kind === "object",
      );
      const objectFields = new Map(
        objectDefinitions.map(
          (definition) =>
            [
              definition.name,
              definition.fields.map((field) => field.name),
            ] as const,
        ),
      );
      const definitions: AbstractTypeDefinition[] =
        structuredSpecification.types
          .filter(
            (definition) =>
              definition.kind === "union" || definition.kind === "interface",
          )
          .map((definition) => ({
            name: definition.name,
            members:
              definition.kind === "union"
                ? definition.members
                : objectDefinitions
                    .filter((candidate) =>
                      candidate.implements?.includes(definition.name),
                    )
                    .map((candidate) => candidate.name),
          }));
      return createAbstractTypeResolvers(
        documentName,
        definitions,
        objectFields,
      );
    }

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

    const objectDefinitions = ast.definitions.filter(
      (definition) => definition.kind === Kind.OBJECT_TYPE_DEFINITION,
    );
    const objectFields = new Map(
      objectDefinitions.map(
        (definition) =>
          [
            definition.name.value,
            definition.fields?.map((field) => field.name.value) ?? [],
          ] as const,
      ),
    );
    const definitions: AbstractTypeDefinition[] = ast.definitions.flatMap(
      (definition) => {
        if (definition.kind === Kind.UNION_TYPE_DEFINITION) {
          return [
            {
              name: definition.name.value,
              members: definition.types?.map((type) => type.name.value) ?? [],
            },
          ];
        }
        if (definition.kind === Kind.INTERFACE_TYPE_DEFINITION) {
          return [
            {
              name: definition.name.value,
              members: objectDefinitions
                .filter(
                  (candidate) =>
                    candidate.interfaces?.some(
                      (implemented) =>
                        implemented.name.value === definition.name.value,
                    ) ?? false,
                )
                .map((candidate) => candidate.name.value),
            },
          ];
        }
        return [];
      },
    );
    return createAbstractTypeResolvers(documentName, definitions, objectFields);
  }

  /**
   * Generate resolvers for this document model using reactorClient
   * Uses flat queries (not nested) consistent with ReactorSubgraph patterns
   */
  private generateResolvers(): DocumentModelSubgraphResolvers {
    const documentType = this.documentModel.documentModel.global.id;
    const documentName = getDocumentModelModuleSchemaName(this.documentModel);
    const structuredSpecification =
      this.documentModel.definition?.specifications.at(-1);
    const operations: RuntimeOperation[] = structuredSpecification
      ? structuredSpecification.modules.flatMap((module) =>
          module.operations
            .filter((operation) => operation.name && operation.input)
            .map((operation) => ({
              actionKey: operation.creatorKey,
              fieldName: operation.creatorKey,
              operationType: operation.actionType,
            })),
        )
      : (this.documentModel.documentModel.global.specifications
          .at(-1)
          ?.modules.flatMap((module) =>
            module.operations.flatMap((operation) => {
              if (!operation.name) return [];
              const fieldName = camelCase(operation.name);
              return [
                {
                  actionKey: fieldName,
                  fieldName,
                  operationType: operation.name,
                },
              ];
            }),
          ) ?? []);

    return {
      ...this.generateAbstractTypeResolvers(),
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
        ...operations.reduce((mutations, operation) => {
          // Sync mutation
          mutations[operation.fieldName] = async (
            _: unknown,
            args: { docId: string; input: unknown },
            ctx: Context,
          ) => {
            const { docId, input } = args;

            const handle = await this.assertCanExecuteOperation(
              docId,
              operation.operationType,
              ctx,
            );
            const effectiveDocId = handle.fetchIdentifier;

            const doc = await this.reactorClient.get(effectiveDocId);
            if (doc.header.documentType !== documentType) {
              throw new GraphQLError(
                `Document with id ${docId} is not of type ${documentType}`,
              );
            }

            const action = this.documentModel.actions[operation.actionKey];
            if (!action) {
              throw new GraphQLError(`Action ${operation.actionKey} not found`);
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
                error instanceof Error
                  ? error.message
                  : `Failed to execute ${operation.operationType}`,
              );
            }
          };

          // Async mutation - returns job ID
          mutations[`${operation.fieldName}Async`] = async (
            _: unknown,
            args: { docId: string; input: unknown },
            ctx: Context,
          ) => {
            const { docId, input } = args;

            const handle = await this.assertCanExecuteOperation(
              docId,
              operation.operationType,
              ctx,
            );
            const effectiveDocId = handle.fetchIdentifier;

            const doc = await this.reactorClient.get(effectiveDocId);
            if (doc.header.documentType !== documentType) {
              throw new GraphQLError(
                `Document with id ${docId} is not of type ${documentType}`,
              );
            }

            const action = this.documentModel.actions[operation.actionKey];
            if (!action) {
              throw new GraphQLError(`Action ${operation.actionKey} not found`);
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
                error instanceof Error
                  ? error.message
                  : `Failed to execute ${operation.operationType}`,
              );
            }
          };

          return mutations;
        }, {} as DocumentModelResolverMap),
      },
    };
  }
}
