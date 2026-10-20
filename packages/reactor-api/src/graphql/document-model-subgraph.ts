import { camelCase } from "change-case";
import {
  setName,
  type Action,
  type DocumentModelModule,
} from "@powerhousedao/shared/document-model";
import { GraphQLError, Kind, parse } from "graphql";
import { optionalOneOf, requireOneOf } from "./argument-aliases.js";
import {
  type DocumentModelSubgraphTypes,
  documentModelSubgraphTypes,
  getDocumentModelSchemaName,
  getDocumentModelSubgraphName,
  type TemplateDescriptions,
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
import { HOST_GENERATED, type SUBGRAPH_PROTOCOL } from "./subgraph-protocol.js";
import type {
  ResolverCoordinate,
  SchemaBuilder,
  SdlSchema,
} from "./subgraph-schema.js";
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
 * Builds `__resolveType` for each abstract type the model's state declares. A
 * code-first model reads its structured types. A schema-first model parses
 * its state schema. Both pick the member by the presence of a field unique
 * to it.
 */
function abstractTypeResolvers(
  documentModel: DocumentModelModule,
): Record<string, DocumentModelResolverMap> {
  const documentName = getDocumentModelSchemaName(
    documentModel.documentModel.global,
  );
  const structured = structuredModelOf(documentModel);
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
    documentModel.documentModel.global.specifications.at(-1);
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

function mutationOperationsOf(
  documentModel: DocumentModelModule,
): readonly MutationOperation[] {
  const structured = structuredModelOf(documentModel);
  if (structured !== null) {
    return mutationOperations(structured.specification).map((op) => ({
      storedName: op.name,
      creatorKey: op.creatorKey,
      operationType: op.actionType,
      authorizeBuiltActionType: false,
    }));
  }
  const hasUnreadableDefinition =
    (documentModel as { definition?: unknown }).definition !== undefined;
  return (
    documentModel.documentModel.global.specifications
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
      ) ?? []
  );
}

const queryFields = [
  "document",
  "documents",
  "findDocuments",
  "documentOutgoingRelationships",
  "documentIncomingRelationships",
] as const;

const creationFields = ["createDocument", "createEmptyDocument"] as const;

const operationFields = (op: MutationOperation) =>
  [camelCase(op.storedName), `${camelCase(op.storedName)}Async`] as const;

function documentModelResolverCoordinates(
  documentModel: DocumentModelModule,
): readonly ResolverCoordinate[] {
  const documentName = getDocumentModelSchemaName(
    documentModel.documentModel.global,
  );
  const fields = (typeName: string, fieldNames: readonly string[]) =>
    [...new Set(fieldNames)].map((fieldName): ResolverCoordinate => ({
      typeName,
      fieldName,
      resolverKind: "field",
    }));
  return [
    ...Object.keys(abstractTypeResolvers(documentModel)).map(
      (typeName): ResolverCoordinate => ({
        typeName,
        fieldName: null,
        resolverKind: "resolveType",
      }),
    ),
    ...fields("Query", [documentName]),
    ...fields(`${documentName}Queries`, queryFields),
    ...fields("Mutation", [documentName]),
    ...fields(`${documentName}Mutations`, [
      ...creationFields,
      ...mutationOperationsOf(documentModel).flatMap(operationFields),
    ]),
  ];
}

function documentModelResolvers(
  documentModel: DocumentModelModule,
  subgraph: BaseSubgraph,
): DocumentModelSubgraphResolvers {
  /** Drops the items the host's own ACL refuses the caller. */
  const readableItems = async (
    page: PhDocumentResultPage,
    ctx: Context,
  ): Promise<PhDocumentResultPage> => ({
    ...page,
    items: await subgraph.readableByHost(page.items, ctx),
  });
  const documentType = documentModel.documentModel.global.id;
  const documentName = getDocumentModelSchemaName(
    documentModel.documentModel.global,
  );
  const operations = mutationOperationsOf(documentModel);
  const createAction = async (
    op: MutationOperation,
    input: unknown,
    documentIdOrSlug: string,
    ctx: Context,
  ): Promise<Action> => {
    const creator = documentModel.actions[op.creatorKey];
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
      await subgraph.assertCanExecuteOperation(
        documentIdOrSlug,
        action.type,
        ctx,
      );
    }
    return action;
  };

  return {
    ...abstractTypeResolvers(documentModel),
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
          subgraph.reactorClient,
          { idOrSlug, view },
          subgraph.viewSubject(ctx),
        );

        if (result.document.documentType !== documentType) {
          throw new GraphQLError(
            `Document with id ${idOrSlug} is not of type ${documentType}`,
          );
        }

        await subgraph.assertCanReadCanonical(
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
          subgraph.reactorClient,
          { search: { type: documentType }, paging },
          subgraph.viewSubject(ctx),
        );

        return readableItems(result, ctx);
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
          subgraph.reactorClient,
          {
            search: { type: documentType, parentId: search?.parentId },
            view,
            paging,
          },
          subgraph.viewSubject(ctx),
        );

        return readableItems(result, ctx);
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

        const handle = await subgraph.assertCanRead(sourceIdOrSlug, ctx);

        const result = await documentOutgoingRelationshipsResolver(
          subgraph.reactorClient,
          {
            sourceIdOrSlug: handle.fetchIdentifier,
            relationshipType,
            view,
            paging,
          },
          subgraph.viewSubject(ctx),
        );

        const readable = await readableItems(result, ctx);
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

        const handle = await subgraph.assertCanRead(targetIdOrSlug, ctx);

        const result = await documentIncomingRelationshipsResolver(
          subgraph.reactorClient,
          {
            targetIdOrSlug: handle.fetchIdentifier,
            relationshipType,
            view,
            paging,
          },
          subgraph.viewSubject(ctx),
        );

        return readableItems(result, ctx);
      },
    } satisfies Record<(typeof queryFields)[number], unknown>,
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
          const handle = await subgraph.assertCanWrite(parentIdOrSlug, ctx);
          parentIdOrSlug = handle.fetchIdentifier;
        } else {
          subgraph.assertCanCreate(ctx);
        }

        let createdDoc;
        if (initialState || preferredEditor) {
          createdDoc = await createDocumentWithInitialStateResolver(
            subgraph.reactorClient,
            {
              documentType,
              parentIdOrSlug,
              name,
              slug,
              preferredEditor,
              initialState: initialState ?? {},
            },
            subgraph.graphqlManager.reactorDriveClient,
            subgraph.viewSubject(ctx),
          );
        } else {
          createdDoc = await createEmptyDocumentResolver(
            subgraph.reactorClient,
            {
              documentType,
              parentIdOrSlug,
              name,
            },
            subgraph.graphqlManager.reactorDriveClient,
            subgraph.viewSubject(ctx),
          );
        }

        // Auto-ownership: set creator as document owner
        if (ctx.user?.address && createdDoc?.id) {
          await subgraph.documentPermissionService?.initializeDocumentProtection(
            createdDoc.id,
            ctx.user.address,
            subgraph.authorizationService.config.defaultProtection,
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
          const updatedDoc = await subgraph.reactorClient.execute(
            createdDoc.id,
            "main",
            [setName(name)],
            undefined,
            subgraph.viewSubject(ctx),
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
          const handle = await subgraph.assertCanWrite(parentIdOrSlug, ctx);
          parentIdOrSlug = handle.fetchIdentifier;
        } else {
          subgraph.assertCanCreate(ctx);
        }

        const result = await createEmptyDocumentResolver(
          subgraph.reactorClient,
          {
            documentType,
            parentIdOrSlug,
          },
          subgraph.graphqlManager.reactorDriveClient,
          subgraph.viewSubject(ctx),
        );

        // Auto-ownership: set creator as document owner
        if (ctx.user?.address && result?.id) {
          await subgraph.documentPermissionService?.initializeDocumentProtection(
            result.id,
            ctx.user.address,
            subgraph.authorizationService.config.defaultProtection,
          );
        }

        return result;
      },
      // Generate sync and async mutations for each operation
      ...operations.reduce((mutations, op) => {
        const [syncField, asyncField] = operationFields(op);
        // Sync mutation
        mutations[syncField] = async (
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

          const handle = await subgraph.assertCanExecuteOperation(
            documentIdOrSlug,
            op.operationType,
            ctx,
          );
          const effectiveDocId = handle.fetchIdentifier;

          const doc = await subgraph.reactorClient.get(effectiveDocId, {
            subject: subgraph.viewSubject(ctx),
          });
          if (doc.header.documentType !== documentType) {
            throw new GraphQLError(
              `Document with id ${documentIdOrSlug} is not of type ${documentType}`,
            );
          }

          const action = await createAction(op, input, documentIdOrSlug, ctx);

          try {
            const updatedDoc = await subgraph.reactorClient.execute(
              effectiveDocId,
              "main",
              [action],
              undefined,
              subgraph.viewSubject(ctx),
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
        mutations[asyncField] = async (
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

          const handle = await subgraph.assertCanExecuteOperation(
            documentIdOrSlug,
            op.operationType,
            ctx,
          );
          const effectiveDocId = handle.fetchIdentifier;

          const doc = await subgraph.reactorClient.get(effectiveDocId, {
            subject: subgraph.viewSubject(ctx),
          });
          if (doc.header.documentType !== documentType) {
            throw new GraphQLError(
              `Document with id ${documentIdOrSlug} is not of type ${documentType}`,
            );
          }

          const action = await createAction(op, input, documentIdOrSlug, ctx);

          try {
            const jobInfo = await subgraph.reactorClient.executeAsync(
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
    } satisfies Record<(typeof creationFields)[number], unknown>,
  };
}

type GeneratedClassSource = {
  readonly documentModel: DocumentModelModule;
  readonly types: DocumentModelSubgraphTypes;
  readonly resolverCoordinates: readonly ResolverCoordinate[];
};

const generatedSources = new WeakMap<object, GeneratedClassSource>();

function generatedSourceOf(subgraphClass: object): GeneratedClassSource {
  const source = generatedSources.get(subgraphClass);
  if (!source) {
    throw new Error(
      "A document model subgraph class comes from documentModelSubgraphClass, which the host calls for each model.",
    );
  }
  return source;
}

export abstract class DocumentModelSubgraph extends BaseSubgraph {
  static override getSchema(
    schema: SchemaBuilder<DocumentModelSubgraph>,
  ): SdlSchema {
    const { types, resolverCoordinates } = generatedSourceOf(this);
    return schema.graphql({
      typeDefs: types.typeDefs,
      resolverCoordinates,
      resolvers: (subgraph) => subgraph.#resolvers,
    });
  }

  readonly #documentModel: DocumentModelModule;
  readonly #resolvers: DocumentModelSubgraphResolvers;
  /** Names of the types its schema generator emits for the model. */
  readonly generatedTypeNames: ReadonlySet<string>;
  /** Descriptions it adds to the model's generated types. */
  readonly generatedDescriptions: TemplateDescriptions;

  constructor(args: SubgraphArgs) {
    super(args);
    const { documentModel, types } = generatedSourceOf(new.target);
    this.#documentModel = documentModel;
    this.generatedTypeNames = types.typeNames;
    this.generatedDescriptions = types.descriptions;
    this.#resolvers = documentModelResolvers(documentModel, this);
  }

  /** Returns the typed query resolvers for this document model. */
  get queryResolvers(): DocumentModelQueryResolvers {
    const documentName = getDocumentModelSchemaName(
      this.#documentModel.documentModel.global,
    );
    return this.#resolvers[
      `${documentName}Queries`
    ] as DocumentModelQueryResolvers;
  }

  /** Returns the typed mutation resolvers for this document model. */
  get mutationResolvers(): DocumentModelMutationResolvers {
    const documentName = getDocumentModelSchemaName(
      this.#documentModel.documentModel.global,
    );
    return this.#resolvers[
      `${documentName}Mutations`
    ] as DocumentModelMutationResolvers;
  }
}

export type DocumentModelSubgraphClass = {
  new (args: SubgraphArgs): DocumentModelSubgraph;
  readonly subgraphName: string;
} & Pick<typeof DocumentModelSubgraph, "getSchema" | typeof SUBGRAPH_PROTOCOL>;

const classesByModel = new WeakMap<
  DocumentModelModule,
  WeakMap<DocumentModelSubgraphTypes, DocumentModelSubgraphClass>
>();

export function documentModelSubgraphClass(
  documentModel: DocumentModelModule,
  types: DocumentModelSubgraphTypes = documentModelSubgraphTypes(documentModel),
): DocumentModelSubgraphClass {
  let classes = classesByModel.get(documentModel);
  if (!classes) {
    classes = new WeakMap();
    classesByModel.set(documentModel, classes);
  }
  const existing = classes.get(types);
  if (existing) return existing;
  const subgraphClass = class extends DocumentModelSubgraph {
    static override readonly subgraphName = getDocumentModelSubgraphName(
      documentModel.documentModel.global,
    );
    static readonly [HOST_GENERATED] = true;
  };
  Object.defineProperty(subgraphClass, "name", {
    value: `${getDocumentModelSchemaName(documentModel.documentModel.global)}Subgraph`,
  });
  generatedSources.set(subgraphClass, {
    documentModel,
    types,
    resolverCoordinates: documentModelResolverCoordinates(documentModel),
  });
  classes.set(types, subgraphClass);
  return subgraphClass;
}
