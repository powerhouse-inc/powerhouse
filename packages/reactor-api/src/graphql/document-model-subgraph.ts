import { camelCase, kebabCase } from "change-case";
import { addFile } from "document-drive";
import { setName, type DocumentModelModule } from "document-model";
import { GraphQLError } from "graphql";
import type { GetParentIdsFn } from "../services/document-permission.service.js";
import {
  generateDocumentModelSchema,
  getDocumentModelSchemaName,
} from "../utils/create-schema.js";
import { BaseSubgraph } from "./base-subgraph.js";
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
        [documentName]: (_: unknown, __: unknown, ctx: Context) => {
          return {
            getDocument: async (args: { docId: string; driveId: string }) => {
              const { docId, driveId } = args;

              if (!docId) {
                throw new GraphQLError("Document id is required");
              }

              await this.assertCanRead(docId, ctx);

              if (driveId) {
                const result = await this.reactorClient.find({
                  parentId: driveId,
                  ids: [docId],
                });
                if (result.results.length === 0) {
                  throw new GraphQLError(
                    `Document with id ${docId} is not part of ${driveId}`,
                  );
                }
              }

              const doc = await this.reactorClient.get(docId);

              if (doc.header.documentType !== documentType) {
                throw new GraphQLError(
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

              await this.assertCanRead(driveId, ctx);

              const result = await this.reactorClient.find({
                parentId: driveId,
                type: documentType,
              });

              const docs = result.results.map((doc) => ({
                driveId: driveId,
                ...buildGraphQlDocument(doc),
              }));

              if (
                !this.hasGlobalReadAccess(ctx) &&
                this.documentPermissionService
              ) {
                const filteredDocs = [];
                for (const doc of docs) {
                  const canRead = await this.canReadDocument(doc.id, ctx);
                  if (canRead) {
                    filteredDocs.push(doc);
                  }
                }
                return filteredDocs;
              }

              return docs;
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
        ...operations.reduce(
          (mutations, op) => {
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
