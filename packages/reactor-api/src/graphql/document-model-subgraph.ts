import { camelCase, kebabCase } from "change-case";
import {
  setName,
  type Action,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { GraphQLError, Kind, parse } from "graphql";
import { optionalOneOf, requireOneOf } from "./argument-aliases.js";
import {
  generateDocumentModelSchema,
  getDocumentModelSchemaName,
} from "../utils/create-schema.js";
import type { CanonicalDocumentId } from "../services/authorization.service.js";
import { BaseSubgraph } from "./base-subgraph.js";
import { mutationOperations } from "./structured-model-schema.js";
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
    args: {
      idOrSlug?: string | null;
      identifier?: string | null;
      view?: ViewArg;
    },
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
      sourceIdOrSlug?: string | null;
      sourceIdentifier?: string | null;
      relationshipType: string;
      view?: ViewArg;
      paging?: PagingArg;
    },
    ctx: Context,
  ) => Promise<PhDocumentResultPage>;
  documentIncomingRelationships: (
    parent: unknown,
    args: {
      targetIdOrSlug?: string | null;
      targetIdentifier?: string | null;
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
      parentIdOrSlug?: string | null;
      parentIdentifier?: string | null;
      slug?: string;
      preferredEditor?: string;
      initialState?: Record<string, Record<string, unknown>>;
    },
    ctx: Context,
  ) => Promise<TDocument>;
  createEmptyDocument: (
    parent: unknown,
    args: { parentIdOrSlug?: string | null; parentIdentifier?: string | null },
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

type MutationOperation = {
  readonly storedName: string;
  readonly creatorKey: string;
  readonly operationType: string;
  readonly authorizeBuiltActionType: boolean;
};

/**
 * Resolves an abstract value by its typename or a field unique to a member,
 * falling back to the first member when neither identifies it.
 */
function abstractTypeResolver(
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
      const declared = members.find(
        (member) =>
          obj.__typename === member ||
          obj.__typename === `${documentName}_${member}`,
      );
      if (declared) return `${documentName}_${declared}`;
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

  /** Drops the items the host's own ACL refuses the caller. */
  async #readableItems(
    page: PhDocumentResultPage,
    ctx: Context,
  ): Promise<PhDocumentResultPage> {
    if (this.authorizationService.isSupremeAdmin(ctx.user?.address)) {
      return page;
    }
    const items: PhDocument[] = [];
    for (const item of page.items) {
      if (await this.canReadDocument(item.id as CanonicalDocumentId, ctx)) {
        items.push(item);
      }
    }
    return { ...page, items };
  }

  /**
   * Builds `__resolveType` for each abstract type the model's state declares. A
   * code-first model reads its structured types. A schema-first model parses
   * its state schema. Both pick the member by the presence of a field unique
   * to it.
   */
  private generateAbstractTypeResolvers(): Record<
    string,
    DocumentModelResolverMap
  > {
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
        if (type.kind !== "union" && type.kind !== "interface") continue;
        const members =
          type.kind === "union"
            ? type.members
            : stateTypes.flatMap((candidate) =>
                candidate.kind === "object" &&
                candidate.implements?.includes(type.name)
                  ? [candidate.name]
                  : [],
              );
        if (members.length === 0) continue;
        resolvers[`${documentName}_${type.name}`] = abstractTypeResolver(
          documentName,
          members,
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
      if (
        def.kind !== Kind.UNION_TYPE_DEFINITION &&
        def.kind !== Kind.INTERFACE_TYPE_DEFINITION
      )
        continue;
      const memberTypes =
        def.kind === Kind.UNION_TYPE_DEFINITION
          ? (def.types?.map((t) => t.name.value) ?? [])
          : ast.definitions.flatMap((candidate) =>
              candidate.kind === Kind.OBJECT_TYPE_DEFINITION &&
              candidate.interfaces?.some(
                (interface_) => interface_.name.value === def.name.value,
              )
                ? [candidate.name.value]
                : [],
            );
      if (memberTypes.length === 0) continue;

      resolvers[`${documentName}_${def.name.value}`] = abstractTypeResolver(
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
    const hasUnreadableDefinition =
      structured === null &&
      (this.documentModel as { definition?: unknown }).definition !== undefined;
    const operations: readonly MutationOperation[] =
      structured !== null
        ? mutationOperations(structured.specification).map((op) => ({
            storedName: op.name,
            creatorKey: op.creatorKey,
            operationType: op.actionType,
            authorizeBuiltActionType: false,
          }))
        : (this.documentModel.documentModel.global.specifications
            .at(-1)
            ?.modules.flatMap((module) =>
              module.operations.flatMap((op) =>
                op.name
                  ? [
                      {
                        storedName: op.name,
                        creatorKey: camelCase(op.name),
                        operationType: op.name,
                        authorizeBuiltActionType: hasUnreadableDefinition,
                      },
                    ]
                  : [],
              ),
            ) ?? []);
    const createAction = async (
      op: MutationOperation,
      input: unknown,
      documentIdOrSlug: string,
      ctx: Context,
    ): Promise<Action> => {
      const creator = this.documentModel.actions[op.creatorKey];
      if (!creator) {
        throw new GraphQLError(`Action ${op.storedName} not found`);
      }
      let action: Action;
      try {
        action = creator(input);
      } catch (error) {
        throw new GraphQLError(
          error instanceof Error ? error.message : `Failed to ${op.storedName}`,
        );
      }
      if (op.authorizeBuiltActionType && action.type !== op.operationType) {
        await this.assertCanExecuteOperation(
          documentIdOrSlug,
          action.type,
          ctx,
        );
      }
      return action;
    };

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
            idOrSlug?: string | null;
            identifier?: string | null;
            view?: { branch?: string; scopes?: string[] };
          },
          ctx: Context,
        ) => {
          const idOrSlug = requireOneOf<string>(args, "idOrSlug", "identifier");
          const { view } = args;

          if (!idOrSlug) {
            throw new GraphQLError("Document identifier is required");
          }

          const result = await documentResolver(
            this.reactorClient,
            { idOrSlug, view },
            this.viewSubject(ctx),
          );

          if (result.document.documentType !== documentType) {
            throw new GraphQLError(
              `Document with id ${idOrSlug} is not of type ${documentType}`,
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

          const result = await findDocumentsResolver(
            this.reactorClient,
            { search: { type: documentType }, paging },
            this.viewSubject(ctx),
          );

          return this.#readableItems(result, ctx);
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

          const result = await findDocumentsResolver(
            this.reactorClient,
            {
              search: { type: documentType, parentId: search?.parentId },
              view,
              paging,
            },
            this.viewSubject(ctx),
          );

          return this.#readableItems(result, ctx);
        },

        documentOutgoingRelationships: async (
          _: unknown,
          args: {
            sourceIdOrSlug?: string | null;
            sourceIdentifier?: string | null;
            relationshipType: string;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const sourceIdOrSlug = requireOneOf<string>(
            args,
            "sourceIdOrSlug",
            "sourceIdentifier",
          );
          const { relationshipType, view, paging } = args;

          const handle = await this.assertCanRead(sourceIdOrSlug, ctx);

          const result = await documentOutgoingRelationshipsResolver(
            this.reactorClient,
            {
              sourceIdOrSlug: handle.fetchIdentifier,
              relationshipType,
              view,
              paging,
            },
            this.viewSubject(ctx),
          );

          const readable = await this.#readableItems(result, ctx);
          const filteredItems = readable.items.filter(
            (item: PhDocument) => item.documentType === documentType,
          );

          return { ...readable, items: filteredItems };
        },

        documentIncomingRelationships: async (
          _: unknown,
          args: {
            targetIdOrSlug?: string | null;
            targetIdentifier?: string | null;
            relationshipType: string;
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const targetIdOrSlug = requireOneOf<string>(
            args,
            "targetIdOrSlug",
            "targetIdentifier",
          );
          const { relationshipType, view, paging } = args;

          const handle = await this.assertCanRead(targetIdOrSlug, ctx);

          const result = await documentIncomingRelationshipsResolver(
            this.reactorClient,
            {
              targetIdOrSlug: handle.fetchIdentifier,
              relationshipType,
              view,
              paging,
            },
            this.viewSubject(ctx),
          );

          return this.#readableItems(result, ctx);
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
            parentIdOrSlug?: string | null;
            parentIdentifier?: string | null;
            slug?: string;
            preferredEditor?: string;
            initialState?: Record<string, Record<string, unknown>>;
          },
          ctx: Context,
        ) => {
          const { name, slug, preferredEditor, initialState } = args;

          let parentIdOrSlug = optionalOneOf<string>(
            args,
            "parentIdOrSlug",
            "parentIdentifier",
          );
          if (parentIdOrSlug) {
            const handle = await this.assertCanWrite(parentIdOrSlug, ctx);
            parentIdOrSlug = handle.fetchIdentifier;
          } else {
            this.assertCanCreate(ctx);
          }

          let createdDoc;
          if (initialState || preferredEditor) {
            createdDoc = await createDocumentWithInitialStateResolver(
              this.reactorClient,
              {
                documentType,
                parentIdOrSlug,
                name,
                slug,
                preferredEditor,
                initialState: initialState ?? {},
              },
              this.graphqlManager.reactorDriveClient,
              this.viewSubject(ctx),
            );
          } else {
            createdDoc = await createEmptyDocumentResolver(
              this.reactorClient,
              {
                documentType,
                parentIdOrSlug,
                name,
              },
              this.graphqlManager.reactorDriveClient,
              this.viewSubject(ctx),
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
              undefined,
              this.viewSubject(ctx),
            );
            return toGqlPhDocument(updatedDoc);
          }

          return createdDoc;
        },
        createEmptyDocument: async (
          _: unknown,
          args: {
            parentIdOrSlug?: string | null;
            parentIdentifier?: string | null;
          },
          ctx: Context,
        ) => {
          let parentIdOrSlug = optionalOneOf<string>(
            args,
            "parentIdOrSlug",
            "parentIdentifier",
          );
          if (parentIdOrSlug) {
            const handle = await this.assertCanWrite(parentIdOrSlug, ctx);
            parentIdOrSlug = handle.fetchIdentifier;
          } else {
            this.assertCanCreate(ctx);
          }

          const result = await createEmptyDocumentResolver(
            this.reactorClient,
            {
              documentType,
              parentIdOrSlug,
            },
            this.graphqlManager.reactorDriveClient,
            this.viewSubject(ctx),
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
          mutations[camelCase(op.storedName)] = async (
            _: unknown,
            args: {
              documentIdOrSlug?: string | null;
              docId?: string | null;
              input: unknown;
            },
            ctx: Context,
          ) => {
            const documentIdOrSlug = requireOneOf<string>(
              args,
              "documentIdOrSlug",
              "docId",
            );
            const { input } = args;

            const handle = await this.assertCanExecuteOperation(
              documentIdOrSlug,
              op.operationType,
              ctx,
            );
            const effectiveDocId = handle.fetchIdentifier;

            const doc = await this.reactorClient.get(effectiveDocId, {
              subject: this.viewSubject(ctx),
            });
            if (doc.header.documentType !== documentType) {
              throw new GraphQLError(
                `Document with id ${documentIdOrSlug} is not of type ${documentType}`,
              );
            }

            const action = await createAction(op, input, documentIdOrSlug, ctx);

            try {
              const updatedDoc = await this.reactorClient.execute(
                effectiveDocId,
                "main",
                [action],
                undefined,
                this.viewSubject(ctx),
              );
              return toGqlPhDocument(updatedDoc);
            } catch (error) {
              throw new GraphQLError(
                error instanceof Error
                  ? error.message
                  : `Failed to ${op.storedName}`,
              );
            }
          };

          // Async mutation - returns job ID
          mutations[`${camelCase(op.storedName)}Async`] = async (
            _: unknown,
            args: {
              documentIdOrSlug?: string | null;
              docId?: string | null;
              input: unknown;
            },
            ctx: Context,
          ) => {
            const documentIdOrSlug = requireOneOf<string>(
              args,
              "documentIdOrSlug",
              "docId",
            );
            const { input } = args;

            const handle = await this.assertCanExecuteOperation(
              documentIdOrSlug,
              op.operationType,
              ctx,
            );
            const effectiveDocId = handle.fetchIdentifier;

            const doc = await this.reactorClient.get(effectiveDocId, {
              subject: this.viewSubject(ctx),
            });
            if (doc.header.documentType !== documentType) {
              throw new GraphQLError(
                `Document with id ${documentIdOrSlug} is not of type ${documentType}`,
              );
            }

            const action = await createAction(op, input, documentIdOrSlug, ctx);

            try {
              const jobInfo = await this.reactorClient.executeAsync(
                effectiveDocId,
                "main",
                [action],
              );
              return jobInfo.id;
            } catch (error) {
              throw new GraphQLError(
                error instanceof Error
                  ? error.message
                  : `Failed to ${op.storedName}`,
              );
            }
          };

          return mutations;
        }, {} as DocumentModelResolverMap),
      },
    };
  }
}
