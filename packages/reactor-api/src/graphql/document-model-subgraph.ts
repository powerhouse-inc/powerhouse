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
import { toGqlPhDocument } from "./reactor/adapters.js";
import {
  createGetParentIdsFn,
  document as documentResolver,
  documentChildren as documentChildrenResolver,
  documentParents as documentParentsResolver,
  findDocuments as findDocumentsResolver,
  createEmptyDocument as createEmptyDocumentResolver,
} from "./reactor/resolvers.js";
import type { Context, SubgraphArgs } from "./types.js";
import { buildGraphQlDocument } from "./utils.js";

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
   * Get the parent IDs function for hierarchical permission checks.
   * Uses the shared createGetParentIdsFn from reactor/resolvers.
   */
  private getParentIdsFn(): GetParentIdsFn {
    return createGetParentIdsFn(this.reactorClient);
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
        // Uses shared documentResolver from reactor/resolvers.ts
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

          // Use shared resolver function
          const result = await documentResolver(this.reactorClient, {
            identifier,
            view,
          });

          // Validate document type
          if (result.document.documentType !== documentType) {
            throw new GraphQLError(
              `Document with id ${identifier} is not of type ${documentType}`,
            );
          }

          // Check permissions
          await this.assertCanRead(result.document.id, ctx);

          // Return shared resolver result directly (matches PHDocument format)
          return result;
        },

        // Flat query: Find documents by search criteria (type is built-in)
        // Uses shared findDocumentsResolver from reactor/resolvers.ts
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

          // Use shared resolver function with built-in type filter
          const result = await findDocumentsResolver(this.reactorClient, {
            search: {
              type: documentType, // Type is built-in for this document model subgraph
              parentId: search.parentId,
            },
            view,
            paging,
          });

          // Filter by permission if needed
          if (
            !this.hasGlobalReadAccess(ctx) &&
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

          // Return shared resolver result directly (matches PHDocument format)
          return result;
        },

        // Flat query: Get children of a document (filtered by this document type)
        // Uses shared documentChildrenResolver from reactor/resolvers.ts
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

          // Use shared resolver function
          const result = await documentChildrenResolver(this.reactorClient, {
            parentIdentifier,
            view,
            paging,
          });

          // Filter children by this document type
          const filteredItems = result.items.filter(
            (item) => item.documentType === documentType,
          );

          return {
            ...result,
            items: filteredItems,
            totalCount: filteredItems.length,
          };
        },

        // Flat query: Get parents of a document
        // Uses shared documentParentsResolver from reactor/resolvers.ts
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

          // Use shared resolver function - return directly
          return documentParentsResolver(this.reactorClient, {
            childIdentifier,
            view,
            paging,
          });
        },
      },
      Mutation: {
        // Uses shared createEmptyDocumentResolver from reactor/resolvers.ts
        [`${documentName}_createDocument`]: async (
          _: unknown,
          args: { name: string; parentIdentifier?: string },
          ctx: Context,
        ) => {
          const { parentIdentifier, name } = args;

          if (parentIdentifier) {
            await this.assertCanWrite(parentIdentifier, ctx);
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          // Use shared resolver function - returns PHDocument format
          const createdDoc = await createEmptyDocumentResolver(
            this.reactorClient,
            {
              documentType,
              parentIdentifier,
            },
          );

          if (name) {
            const updatedDoc = await this.reactorClient.execute(
              createdDoc.id,
              "main",
              [setName(name)],
            );
            // Use toGqlPhDocument for PHDocument format with revisionsList
            return toGqlPhDocument(updatedDoc);
          }

          // Return directly - already in PHDocument format
          return createdDoc;
        },
        // Uses shared createEmptyDocumentResolver from reactor/resolvers.ts
        [`${documentName}_createEmptyDocument`]: async (
          _: unknown,
          args: { parentIdentifier?: string },
          ctx: Context,
        ) => {
          const { parentIdentifier } = args;

          if (parentIdentifier) {
            await this.assertCanWrite(parentIdentifier, ctx);
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }

          // Use shared resolver function - returns PHDocument format directly
          return createEmptyDocumentResolver(this.reactorClient, {
            documentType,
            parentIdentifier,
          });
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
                // Use toGqlPhDocument for PHDocument format with revisionsList
                return toGqlPhDocument(updatedDoc);
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
