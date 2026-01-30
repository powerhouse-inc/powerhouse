import type {
  PagedResults,
  PagingOptions,
  ViewFilter,
} from "@powerhousedao/reactor";
import { camelCase, kebabCase } from "change-case";
import { addFile } from "document-drive";
import {
  setName,
  type DocumentModelModule,
  type PHDocument,
} from "document-model";
import { GraphQLError } from "graphql";
import type { GetParentIdsFn } from "../services/document-permission.service.js";
import {
  generateDocumentModelSchema,
  getDocumentModelSchemaName,
} from "../utils/create-schema.js";
import { BaseSubgraph } from "./base-subgraph.js";
import type { Context, SubgraphArgs } from "./types.js";
import { buildGraphQlDocument } from "./utils.js";

// Type for GraphQL paging input
interface GraphQLPagingInput {
  limit?: number;
  offset?: number;
  cursor?: string;
}

// Convert GraphQL paging input to reactor PagingOptions
// Note: Using type assertion because PagingOptions in shared/types has required fields,
// but the actual runtime behavior accepts partial options
function toReactorPaging(
  paging?: GraphQLPagingInput,
): PagingOptions | undefined {
  if (!paging) return undefined;
  if (paging.limit === undefined && paging.cursor === undefined)
    return undefined;
  return {
    ...(paging.limit !== undefined ? { limit: paging.limit } : {}),
    ...(paging.cursor !== undefined ? { cursor: paging.cursor } : {}),
  } as PagingOptions;
}

// Convert GraphQL view input to reactor ViewFilter
function toReactorView(view?: {
  branch?: string;
  scopes?: string[];
}): ViewFilter | undefined {
  if (!view) return undefined;
  return view as ViewFilter;
}

// Adapter function for document-model-specific result pages
function toDocumentModelResultPage(result: PagedResults<PHDocument>): {
  items: ReturnType<typeof buildGraphQlDocument>[];
  totalCount: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  cursor: string | null;
} {
  return {
    cursor: result.nextCursor ?? null,
    hasNextPage: !!result.nextCursor,
    hasPreviousPage: !!result.options.cursor,
    items: result.results.map(buildGraphQlDocument),
    totalCount: result.results.length,
  };
}

/**
 * New document model subgraph that uses reactorClient instead of legacy reactor.
 * This class auto-generates GraphQL queries and mutations for a document model.
 */
export class DocumentModelSubgraph extends BaseSubgraph {
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

  /**
   * Check if user has global read access (admin, user, or guest)
   */
  private hasGlobalReadAccess(ctx: Context): boolean {
    const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
    const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
    const isGlobalGuest =
      ctx.isGuest?.(ctx.user?.address ?? "") ||
      process.env.FREE_ENTRY === "true";
    return !!(isGlobalAdmin || isGlobalUser || isGlobalGuest);
  }

  /**
   * Check if user has global write access (admin or user, not guest)
   */
  private hasGlobalWriteAccess(ctx: Context): boolean {
    const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
    const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
    return !!(isGlobalAdmin || isGlobalUser);
  }

  /**
   * Get the parent IDs function for hierarchical permission checks
   */
  private getParentIdsFn(): GetParentIdsFn {
    return async (documentId: string): Promise<string[]> => {
      try {
        const result = await this.reactorClient.getParents(documentId);
        return result.results.map((doc) => doc.header.id);
      } catch {
        return [];
      }
    };
  }

  /**
   * Check if user can read a document (with hierarchy)
   */
  private async canReadDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    if (this.hasGlobalReadAccess(ctx)) {
      return true;
    }

    if (this.documentPermissionService) {
      return this.documentPermissionService.canRead(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
    }

    return false;
  }

  /**
   * Check if user can write to a document (with hierarchy)
   */
  private async canWriteDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    if (this.hasGlobalWriteAccess(ctx)) {
      return true;
    }

    if (this.documentPermissionService) {
      return this.documentPermissionService.canWrite(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
    }

    return false;
  }

  /**
   * Throw an error if user cannot read the document
   */
  private async assertCanRead(documentId: string, ctx: Context): Promise<void> {
    const canRead = await this.canReadDocument(documentId, ctx);
    if (!canRead) {
      throw new GraphQLError(
        "Forbidden: insufficient permissions to read this document",
      );
    }
  }

  /**
   * Throw an error if user cannot write to the document
   */
  private async assertCanWrite(
    documentId: string,
    ctx: Context,
  ): Promise<void> {
    const canWrite = await this.canWriteDocument(documentId, ctx);
    if (!canWrite) {
      throw new GraphQLError(
        "Forbidden: insufficient permissions to write to this document",
      );
    }
  }

  /**
   * Check if user can execute a specific operation on a document.
   * Throws an error if the operation is restricted and user lacks permission.
   */
  private async assertCanExecuteOperation(
    documentId: string,
    operationType: string,
    ctx: Context,
  ): Promise<void> {
    if (!this.documentPermissionService) {
      return;
    }

    if (ctx.isAdmin?.(ctx.user?.address ?? "")) {
      return;
    }

    const isRestricted =
      await this.documentPermissionService.isOperationRestricted(
        documentId,
        operationType,
      );

    if (isRestricted) {
      const canExecute =
        await this.documentPermissionService.canExecuteOperation(
          documentId,
          operationType,
          ctx.user?.address,
        );

      if (!canExecute) {
        throw new GraphQLError(
          `Forbidden: insufficient permissions to execute operation "${operationType}" on this document`,
        );
      }
    }
  }

  /**
   * Generate resolvers for this document model using reactorClient
   * Uses flat queries (not nested) consistent with ReactorSubgraph patterns
   */
  private generateResolvers(): Record<string, unknown> {
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
      Query: {
        // Flat query: Get a specific document by identifier
        // Uses prefixed input types: ${documentName}_ViewFilterInput
        [`${documentName}_document`]: async (
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

          const doc = await this.reactorClient.get(
            identifier,
            toReactorView(view),
          );

          if (doc.header.documentType !== documentType) {
            throw new GraphQLError(
              `Document with id ${identifier} is not of type ${documentType}`,
            );
          }

          await this.assertCanRead(doc.header.id, ctx);

          // Get children
          const children = await this.reactorClient.getChildren(identifier, {
            branch: view?.branch,
          });

          return {
            document: buildGraphQlDocument(doc),
            childIds: children.results.map((c) => c.header.id),
          };
        },

        // Flat query: Find documents by search criteria (type is built-in)
        // Uses prefixed input types: ${documentName}_SearchFilterInput, ${documentName}_ViewFilterInput, ${documentName}_PagingInput
        [`${documentName}_findDocuments`]: async (
          _: unknown,
          args: {
            search: { parentId?: string; identifiers?: string[] };
            view?: { branch?: string; scopes?: string[] };
            paging?: { limit?: number; offset?: number; cursor?: string };
          },
          ctx: Context,
        ) => {
          const { search, view, paging } = args;

          // Type is built-in for this document model subgraph
          const result = await this.reactorClient.find(
            {
              parentId: search.parentId,
              ids: search.identifiers,
              type: documentType,
            },
            toReactorView(view),
            toReactorPaging(paging),
          );

          // Filter by permission if needed
          if (
            !this.hasGlobalReadAccess(ctx) &&
            this.documentPermissionService
          ) {
            const filteredResults: PHDocument[] = [];
            for (const doc of result.results) {
              const canRead = await this.canReadDocument(doc.header.id, ctx);
              if (canRead) {
                filteredResults.push(doc);
              }
            }
            return toDocumentModelResultPage({
              ...result,
              results: filteredResults,
            });
          }

          return toDocumentModelResultPage(result);
        },

        // Flat query: Get children of a document (filtered by this document type)
        // Uses prefixed input types: ${documentName}_ViewFilterInput, ${documentName}_PagingInput
        [`${documentName}_documentChildren`]: async (
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

          const result = await this.reactorClient.getChildren(
            parentIdentifier,
            toReactorView(view),
            toReactorPaging(paging),
          );

          // Filter children by this document type
          const filteredResults = result.results.filter(
            (doc) => doc.header.documentType === documentType,
          );

          return toDocumentModelResultPage({
            ...result,
            results: filteredResults,
          });
        },

        // Flat query: Get parents of a document
        // Uses prefixed input types: ${documentName}_ViewFilterInput, ${documentName}_PagingInput
        [`${documentName}_documentParents`]: async (
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

          const result = await this.reactorClient.getParents(
            childIdentifier,
            toReactorView(view),
            toReactorPaging(paging),
          );

          return toDocumentModelResultPage(result);
        },
      },
      Mutation: {
        [`${documentName}_createDocument`]: async (
          _: unknown,
          args: { name: string; driveId?: string },
          ctx: Context,
        ) => {
          const { driveId, name } = args;

          if (driveId) {
            await this.assertCanWrite(driveId, ctx);
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          const document = await this.reactorClient.createEmpty(documentType, {
            parentIdentifier: driveId,
          });

          if (name) {
            const updatedDoc = await this.reactorClient.execute(
              document.header.id,
              "main",
              [setName(name)],
            );
            return buildGraphQlDocument(updatedDoc);
          }

          return buildGraphQlDocument(document);
        },
        [`${documentName}_createEmptyDocument`]: async (
          _: unknown,
          args: { driveId?: string },
          ctx: Context,
        ) => {
          const { driveId } = args;

          if (driveId) {
            await this.assertCanWrite(driveId, ctx);
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          const document = await this.reactorClient.createEmpty(documentType, {
            parentIdentifier: driveId,
          });

          return buildGraphQlDocument(document);
        },
        // Generate sync and async mutations for each operation
        ...operations.reduce(
          (mutations, op) => {
            // Sync mutation
            mutations[`${documentName}_${camelCase(op.name!)}`] = async (
              _: unknown,
              args: { docId: string; input: unknown },
              ctx: Context,
            ) => {
              const { docId, input } = args;

              await this.assertCanWrite(docId, ctx);
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
                return buildGraphQlDocument(updatedDoc);
              } catch (error) {
                throw new GraphQLError(
                  error instanceof Error
                    ? error.message
                    : `Failed to ${op.name}`,
                );
              }
            };

            // Async mutation - returns job ID
            mutations[`${documentName}_${camelCase(op.name!)}Async`] = async (
              _: unknown,
              args: { docId: string; input: unknown },
              ctx: Context,
            ) => {
              const { docId, input } = args;

              await this.assertCanWrite(docId, ctx);
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
                  error instanceof Error
                    ? error.message
                    : `Failed to ${op.name}`,
                );
              }
            };

            return mutations;
          },
          {} as Record<string, unknown>,
        ),
      },
    };
  }
}

/**
 * @deprecated Use `DocumentModelSubgraph` instead. This class uses the legacy `reactor` (IDocumentDriveServer)
 * interface. The new `DocumentModelSubgraph` class uses `reactorClient` (IReactorClient) which provides
 * better patterns and more capabilities. Enable via `useNewDocumentModelSubgraph: true` in GraphQLManager.
 */
export class DocumentModelSubgraphLegacy extends BaseSubgraph {
  private documentModel: DocumentModelModule;

  constructor(documentModel: DocumentModelModule, args: SubgraphArgs) {
    super(args);
    this.documentModel = documentModel;
    this.name = kebabCase(documentModel.documentModel.global.name);
    this.typeDefs = generateDocumentModelSchema(
      this.documentModel.documentModel.global,
    );
    this.resolvers = this.generateResolvers();
  }

  /**
   * Check if user has global read access (admin, user, or guest)
   */
  private hasGlobalReadAccess(ctx: Context): boolean {
    const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
    const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
    const isGlobalGuest =
      ctx.isGuest?.(ctx.user?.address ?? "") ||
      process.env.FREE_ENTRY === "true";
    return !!(isGlobalAdmin || isGlobalUser || isGlobalGuest);
  }

  /**
   * Check if user has global write access (admin or user, not guest)
   */
  private hasGlobalWriteAccess(ctx: Context): boolean {
    const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "");
    const isGlobalUser = ctx.isUser?.(ctx.user?.address ?? "");
    return !!(isGlobalAdmin || isGlobalUser);
  }

  /**
   * Get the parent IDs function for hierarchical permission checks
   */
  private getParentIdsFn(): GetParentIdsFn {
    return async (documentId: string): Promise<string[]> => {
      try {
        const result = await this.reactorClient.getParents(documentId);
        return result.results.map((doc) => doc.header.id);
      } catch {
        return [];
      }
    };
  }

  /**
   * Check if user can read a document (with hierarchy)
   */
  private async canReadDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    // Global access allows reading
    if (this.hasGlobalReadAccess(ctx)) {
      return true;
    }

    // Check document-level permissions with hierarchy
    if (this.documentPermissionService) {
      return this.documentPermissionService.canRead(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
    }

    return false;
  }

  /**
   * Check if user can write to a document (with hierarchy)
   */
  private async canWriteDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    // Global write access allows writing
    if (this.hasGlobalWriteAccess(ctx)) {
      return true;
    }

    // Check document-level permissions with hierarchy
    if (this.documentPermissionService) {
      return this.documentPermissionService.canWrite(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
    }

    return false;
  }

  /**
   * Throw an error if user cannot read the document
   */
  private async assertCanRead(documentId: string, ctx: Context): Promise<void> {
    const canRead = await this.canReadDocument(documentId, ctx);
    if (!canRead) {
      throw new GraphQLError(
        "Forbidden: insufficient permissions to read this document",
      );
    }
  }

  /**
   * Throw an error if user cannot write to the document
   */
  private async assertCanWrite(
    documentId: string,
    ctx: Context,
  ): Promise<void> {
    const canWrite = await this.canWriteDocument(documentId, ctx);
    if (!canWrite) {
      throw new GraphQLError(
        "Forbidden: insufficient permissions to write to this document",
      );
    }
  }

  /**
   * Check if user can execute a specific operation on a document.
   * Throws an error if the operation is restricted and user lacks permission.
   */
  private async assertCanExecuteOperation(
    documentId: string,
    operationType: string,
    ctx: Context,
  ): Promise<void> {
    // Skip if no permission service
    if (!this.documentPermissionService) {
      return;
    }

    // Global admins bypass operation-level restrictions
    if (ctx.isAdmin?.(ctx.user?.address ?? "")) {
      return;
    }

    // Check if this operation has any restrictions set
    const isRestricted =
      await this.documentPermissionService.isOperationRestricted(
        documentId,
        operationType,
      );

    if (isRestricted) {
      // Operation is restricted, check if user has permission
      const canExecute =
        await this.documentPermissionService.canExecuteOperation(
          documentId,
          operationType,
          ctx.user?.address,
        );

      if (!canExecute) {
        throw new GraphQLError(
          `Forbidden: insufficient permissions to execute operation "${operationType}" on this document`,
        );
      }
    }
  }

  /**
   * Generate resolvers for this document model with permission checks
   */
  private generateResolvers(): Record<string, any> {
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
      Query: {
        [documentName]: (_: unknown, __: unknown, ctx: Context) => {
          return {
            getDocument: async (args: { docId: string; driveId: string }) => {
              const { docId, driveId } = args;

              if (!docId) {
                throw new Error("Document id is required");
              }

              // Check read permission before accessing document
              await this.assertCanRead(docId, ctx);

              if (driveId) {
                const docIds = await this.reactor.getDocuments(driveId);
                if (!docIds.includes(docId)) {
                  throw new Error(
                    `Document with id ${docId} is not part of ${driveId}`,
                  );
                }
              }

              const doc = await this.reactor.getDocument(docId);
              if (doc.header.documentType !== documentType) {
                throw new Error(
                  `Document with id ${docId} is not of type ${documentType}`,
                );
              }

              return {
                driveId: driveId,
                ...buildGraphQlDocument(doc),
              };
            },
            getDocuments: async (args: { driveId: string }) => {
              const { driveId } = args;

              // Check read permission on drive before listing documents
              await this.assertCanRead(driveId, ctx);

              const docsIds = await this.reactor.getDocuments(driveId);
              const docs = await Promise.all(
                docsIds.map(async (docId) => {
                  const doc = await this.reactor.getDocument(docId);
                  return {
                    driveId: driveId,
                    ...buildGraphQlDocument(doc),
                  };
                }),
              );

              const filteredByType = docs.filter(
                (doc) => doc.documentType === documentType,
              );

              // If user doesn't have global read access, filter by document-level permissions
              if (
                !this.hasGlobalReadAccess(ctx) &&
                this.documentPermissionService
              ) {
                const filteredDocs = [];
                for (const doc of filteredByType) {
                  const canRead = await this.canReadDocument(doc.id, ctx);
                  if (canRead) {
                    filteredDocs.push(doc);
                  }
                }
                return filteredDocs;
              }

              return filteredByType;
            },
          };
        },
      },
      Mutation: {
        [`${documentName}_createDocument`]: async (
          _: unknown,
          args: { name: string; driveId?: string },
          ctx: Context,
        ) => {
          const { driveId, name } = args;

          // If creating under a drive, check write permission on drive
          if (driveId) {
            await this.assertCanWrite(driveId, ctx);
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          const document = await this.reactor.addDocument(documentType);

          if (driveId) {
            await this.reactor.addAction(
              driveId,
              addFile({
                name,
                id: document.header.id,
                documentType: documentType,
              }),
            );
          }

          if (name) {
            await this.reactor.addAction(document.header.id, setName(name));
          }

          return document.header.id;
        },
        ...operations.reduce(
          (mutations, op) => {
            mutations[`${documentName}_${camelCase(op.name!)}`] = async (
              _: unknown,
              args: { docId: string; input: unknown },
              ctx: Context,
            ) => {
              const { docId, input } = args;

              // Check write permission before mutating document
              await this.assertCanWrite(docId, ctx);

              // Check operation-level permissions
              await this.assertCanExecuteOperation(docId, op.name!, ctx);

              const doc = await this.reactor.getDocument(docId);
              if (!doc) {
                throw new Error("Document not found");
              }

              const action = this.documentModel.actions[camelCase(op.name!)];
              if (!action) {
                throw new Error(`Action ${op.name} not found`);
              }

              const result = await this.reactor.addAction(docId, action(input));

              if (result.status !== "SUCCESS") {
                throw new Error(
                  result.error?.message ?? `Failed to ${op.name}`,
                );
              }

              const errorOp = result.operations.find((op) => op.error);
              if (errorOp) {
                throw new Error(errorOp.error);
              }

              return result.operations.at(-1)?.index ?? -1;
            };
            return mutations;
          },
          {} as Record<string, any>,
        ),
      },
    };
  }
}
