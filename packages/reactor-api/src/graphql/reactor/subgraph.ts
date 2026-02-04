import { ConsoleLogger } from "@powerhousedao/reactor";
import fs from "fs";
import { GraphQLError } from "graphql";
import { withFilter } from "graphql-subscriptions";
import { gql } from "graphql-tag";
import path from "path";
import { fileURLToPath } from "url";
import { BaseSubgraph } from "../base-subgraph.js";
import type { Context, SubgraphArgs } from "../types.js";
import {
  matchesJobFilter,
  matchesSearchFilter,
  toGqlDocumentChangeEvent,
} from "./adapters.js";
import type { Resolvers } from "./gen/graphql.js";
import {
  ensureGlobalDocumentSubscription,
  ensureJobSubscription,
  getPubSub,
  SUBSCRIPTION_TRIGGERS,
  type DocumentChangesPayload,
  type JobChangesPayload,
} from "./pubsub.js";
import * as resolvers from "./resolvers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ReactorSubgraph extends BaseSubgraph {
  // temp
  private logger = new ConsoleLogger(["ReactorSubgraph"]);

  constructor(args: SubgraphArgs) {
    super(args);
    this.logger.verbose(`constructor()`);
  }

  name = "r/:reactor";
  hasSubscriptions = true;

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
  private getParentIdsFn() {
    return resolvers.createGetParentIdsFn(this.reactorClient);
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
   * Check if user can execute specific operations on a document.
   * Only checks operations that have restrictions set.
   * Throws an error if any operation is restricted and user lacks permission.
   */
  private async assertCanExecuteOperations(
    documentId: string,
    actions: readonly unknown[],
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

    for (const action of actions) {
      if (!action || typeof action !== "object") {
        continue;
      }

      const actionObj = action as Record<string, unknown>;
      const operationType = actionObj.type;

      if (typeof operationType !== "string") {
        continue;
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
  }

  // Load schema from file
  typeDefs = gql(
    fs.readFileSync(path.join(__dirname, "schema.graphql"), "utf-8"),
  );

  resolvers: Resolvers = {
    Query: {
      documentModels: async (_parent, args) => {
        this.logger.debug("documentModels(@args)", args);
        try {
          return await resolvers.documentModels(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentModels: @Error", error);
          throw error;
        }
      },

      document: async (_parent, args, ctx: Context) => {
        this.logger.debug("document(@args)", args);
        try {
          // Resolve the document ID first
          const doc = await resolvers.document(this.reactorClient, args);
          if (doc) {
            await this.assertCanRead(doc.document.id, ctx);
          }
          return doc;
        } catch (error) {
          this.logger.error("Error in document: @Error", error);
          throw error;
        }
      },

      documentChildren: async (_parent, args, ctx: Context) => {
        this.logger.debug("documentChildren(@args)", args);
        try {
          // First resolve the parent to get its ID and check permission
          const parent = await resolvers.document(this.reactorClient, {
            identifier: args.parentIdentifier,
            view: args.view,
          });
          if (parent) {
            await this.assertCanRead(parent.document.id, ctx);
          }
          return await resolvers.documentChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentChildren: @Error", error);
          throw error;
        }
      },

      documentParents: async (_parent, args, ctx: Context) => {
        this.logger.debug("documentParents(@args)", args);
        try {
          // First resolve the child to get its ID and check permission
          const child = await resolvers.document(this.reactorClient, {
            identifier: args.childIdentifier,
            view: args.view,
          });
          if (child) {
            await this.assertCanRead(child.document.id, ctx);
          }
          return await resolvers.documentParents(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentParents: @Error", error);
          throw error;
        }
      },

      findDocuments: async (_parent, args, ctx: Context) => {
        this.logger.debug("findDocuments(@args)", args);
        try {
          const result = await resolvers.findDocuments(
            this.reactorClient,
            args,
          );

          // Filter results to only include documents the user can read
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

          return result;
        } catch (error) {
          this.logger.error("Error in findDocuments: @Error", error);
          throw error;
        }
      },

      jobStatus: async (_parent, args) => {
        this.logger.debug("jobStatus(@args)", args);
        try {
          return await resolvers.jobStatus(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in jobStatus: @Error", error);
          throw error;
        }
      },

      documentOperations: async (_parent, args, ctx: Context) => {
        this.logger.debug("documentOperations(@args)", args);
        try {
          // Resolve the document first to check permissions
          const doc = await resolvers.document(this.reactorClient, {
            identifier: args.filter.documentId,
            view: {
              branch: args.filter.branch,
              scopes: args.filter.scopes,
            },
          });
          if (doc) {
            await this.assertCanRead(doc.document.id, ctx);
          }
          return await resolvers.documentOperations(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentOperations: @Error", error);
          throw error;
        }
      },

      pollSyncEnvelopes: async (
        _parent: unknown,
        args: { channelId: string; cursorOrdinal: number },
      ) => {
        this.logger.debug("pollSyncEnvelopes(@args)", args);

        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return await resolvers.pollSyncEnvelopes(this.syncManager, args);
        } catch (error) {
          this.logger.error("Error in pollSyncEnvelopes(@args): @Error", error);
          throw error;
        }
      },
    },

    Mutation: {
      createDocument: async (_parent, args, ctx: Context) => {
        this.logger.debug("createDocument(@args)", args);
        try {
          // If creating under a parent, check write permission on parent
          if (args.parentIdentifier) {
            const parent = await resolvers.document(this.reactorClient, {
              identifier: args.parentIdentifier,
            });
            if (parent) {
              await this.assertCanWrite(parent.document.id, ctx);
            }
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }
          return await resolvers.createDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in createDocument(@args): @Error", error);
          throw error;
        }
      },

      createEmptyDocument: async (_parent, args, ctx: Context) => {
        this.logger.debug("createEmptyDocument(@args)", args);
        try {
          // If creating under a parent, check write permission on parent
          if (args.parentIdentifier) {
            const parent = await resolvers.document(this.reactorClient, {
              identifier: args.parentIdentifier,
            });
            if (parent) {
              await this.assertCanWrite(parent.document.id, ctx);
            }
          } else if (!this.hasGlobalWriteAccess(ctx)) {
            throw new GraphQLError(
              "Forbidden: insufficient permissions to create documents",
            );
          }
          return await resolvers.createEmptyDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error(
            "Error in createEmptyDocument(@args): @Error",
            error,
          );
          throw error;
        }
      },

      mutateDocument: async (_parent, args, ctx: Context) => {
        this.logger.debug("mutateDocument(@args)", args);
        try {
          // Resolve document and check write permission
          const doc = await resolvers.document(this.reactorClient, {
            identifier: args.documentIdentifier,
            view: args.view,
          });
          if (doc) {
            await this.assertCanWrite(doc.document.id, ctx);
            // Check operation-level permissions for each action
            await this.assertCanExecuteOperations(
              doc.document.id,
              args.actions,
              ctx,
            );
          }
          return await resolvers.mutateDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in mutateDocument(@args): @Error", error);
          throw error;
        }
      },

      mutateDocumentAsync: async (_parent, args, ctx: Context) => {
        this.logger.debug("mutateDocumentAsync(@args)", args);
        try {
          // Resolve document and check write permission
          const doc = await resolvers.document(this.reactorClient, {
            identifier: args.documentIdentifier,
            view: args.view,
          });
          if (doc) {
            await this.assertCanWrite(doc.document.id, ctx);
            // Check operation-level permissions for each action
            await this.assertCanExecuteOperations(
              doc.document.id,
              args.actions,
              ctx,
            );
          }
          return await resolvers.mutateDocumentAsync(this.reactorClient, args);
        } catch (error) {
          this.logger.error(
            "Error in mutateDocumentAsync(@args): @Error",
            error,
          );
          throw error;
        }
      },

      renameDocument: async (_parent, args, ctx: Context) => {
        this.logger.debug("renameDocument(@args)", args);
        try {
          // Resolve document and check write permission
          const doc = await resolvers.document(this.reactorClient, {
            identifier: args.documentIdentifier,
          });
          if (doc) {
            await this.assertCanWrite(doc.document.id, ctx);
          }
          return await resolvers.renameDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in renameDocument(@args): @Error", error);
          throw error;
        }
      },

      addChildren: async (_parent, args, ctx: Context) => {
        this.logger.debug("addChildren(@args)", args);
        try {
          // Check write permission on parent
          const parent = await resolvers.document(this.reactorClient, {
            identifier: args.parentIdentifier,
          });
          if (parent) {
            await this.assertCanWrite(parent.document.id, ctx);
          }
          return await resolvers.addChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in addChildren(@args): @Error", error);
          throw error;
        }
      },

      removeChildren: async (_parent, args, ctx: Context) => {
        this.logger.debug("removeChildren(@args)", args);
        try {
          // Check write permission on parent
          const parent = await resolvers.document(this.reactorClient, {
            identifier: args.parentIdentifier,
          });
          if (parent) {
            await this.assertCanWrite(parent.document.id, ctx);
          }
          return await resolvers.removeChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in removeChildren(@args): @Error", error);
          throw error;
        }
      },

      moveChildren: async (_parent, args, ctx: Context) => {
        this.logger.debug("moveChildren(@args)", args);
        try {
          // Check write permission on both source and target parents
          const sourceParent = await resolvers.document(this.reactorClient, {
            identifier: args.sourceParentIdentifier,
          });
          if (sourceParent) {
            await this.assertCanWrite(sourceParent.document.id, ctx);
          }

          const targetParent = await resolvers.document(this.reactorClient, {
            identifier: args.targetParentIdentifier,
          });
          if (targetParent) {
            await this.assertCanWrite(targetParent.document.id, ctx);
          }
          return await resolvers.moveChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error(
            "Error in moveChildren(@args): @Error @args",
            error,
            args,
          );
          throw error;
        }
      },

      deleteDocument: async (_parent, args, ctx: Context) => {
        this.logger.debug("deleteDocument(@args)", args);
        try {
          // Check write permission on document
          const doc = await resolvers.document(this.reactorClient, {
            identifier: args.identifier,
          });
          if (doc) {
            await this.assertCanWrite(doc.document.id, ctx);
          }
          return await resolvers.deleteDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in deleteDocument(@args): @Error", error);
          throw error;
        }
      },

      deleteDocuments: async (_parent, args, ctx: Context) => {
        this.logger.debug("deleteDocuments(@args)", args);
        try {
          // Check write permission on each document
          for (const identifier of args.identifiers) {
            const doc = await resolvers.document(this.reactorClient, {
              identifier,
            });
            if (doc) {
              await this.assertCanWrite(doc.document.id, ctx);
            }
          }
          return await resolvers.deleteDocuments(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in deleteDocuments(@args): @Error", error);
          throw error;
        }
      },

      touchChannel: async (
        _parent: unknown,
        args: {
          input: {
            id: string;
            name: string;
            collectionId: string;
            filter: {
              documentId: readonly string[];
              scope: readonly string[];
              branch: string;
            };
            sinceTimestampUtcMs: string;
          };
        },
      ) => {
        this.logger.debug("touchChannel(@args)", args);

        try {
          return await resolvers.touchChannel(this.syncManager, args);
        } catch (error) {
          this.logger.error("Error in touchChannel(@args): @Error", error);
          throw error;
        }
      },

      pushSyncEnvelopes: async (_parent, args) => {
        this.logger.debug("pushSyncEnvelopes(@args)", args);

        try {
          // Convert readonly arrays to mutable arrays for the resolver
          const mutableArgs = {
            envelopes: args.envelopes.map((envelope) => ({
              type: envelope.type,
              channelMeta: { id: envelope.channelMeta.id },
              operations: envelope.operations
                ? envelope.operations.map((op) => ({
                    operation: op.operation,
                    context: {
                      documentId: op.context.documentId,
                      documentType: op.context.documentType,
                      scope: op.context.scope,
                      branch: op.context.branch,
                    },
                  }))
                : null,
              cursor: envelope.cursor
                ? {
                    remoteName: envelope.cursor.remoteName,
                    cursorOrdinal: envelope.cursor.cursorOrdinal,
                    lastSyncedAtUtcMs: envelope.cursor.lastSyncedAtUtcMs,
                  }
                : null,
            })),
          };

          return await resolvers.pushSyncEnvelopes(
            this.syncManager,
            mutableArgs,
          );
        } catch (error) {
          this.logger.error("Error in pushSyncEnvelopes(@args): @Error", error);
          throw error;
        }
      },
    },

    Subscription: {
      documentChanges: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        subscribe: withFilter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          (() => {
            this.logger.debug("documentChanges(@args) subscription started");
            ensureGlobalDocumentSubscription(this.reactorClient);

            return getPubSub().asyncIterableIterator<DocumentChangesPayload>(
              SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
            );
          }) as any,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          ((
            payload: DocumentChangesPayload | undefined,
            args: {
              search: { type?: string | null; parentId?: string | null };
            },
          ) => {
            if (!payload) {
              return false;
            }

            const search = {
              type: args.search.type ?? undefined,
              parentId: args.search.parentId ?? undefined,
            };

            return matchesSearchFilter(payload.documentChanges, search);
          }) as any,
        ) as any,
        resolve: (payload: DocumentChangesPayload) => {
          return toGqlDocumentChangeEvent(payload.documentChanges);
        },
      },

      jobChanges: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        subscribe: withFilter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          ((_parent: unknown, args: { jobId: string }) => {
            this.logger.debug("jobChanges(@args) subscription started", args);
            ensureJobSubscription(this.reactorClient, args.jobId);

            return getPubSub().asyncIterableIterator<JobChangesPayload>(
              SUBSCRIPTION_TRIGGERS.JOB_CHANGES,
            );
          }) as any,
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          ((
            payload: JobChangesPayload | undefined,
            args: { jobId: string },
          ) => {
            if (!payload) {
              return false;
            }

            return matchesJobFilter(payload, args);
          }) as any,
        ) as any,
        resolve: (payload: JobChangesPayload) => {
          return payload.jobChanges;
        },
      },
    },
  };

  onSetup(): Promise<void> {
    this.logger.debug("Setting up ReactorSubgraph");

    return Promise.resolve();
  }
}
