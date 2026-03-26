import { ConsoleLogger } from "document-model";
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

  name = "r";
  hasSubscriptions = true;

  /**
   * Check operation-level permissions for an array of actions.
   * Delegates to base assertCanExecuteOperation for each action.
   */
  private async assertCanExecuteOperations(
    documentId: string,
    actions: readonly unknown[],
    ctx: Context,
  ): Promise<void> {
    for (const action of actions) {
      if (!action || typeof action !== "object") continue;
      const actionObj = action as Record<string, unknown>;
      const operationType = actionObj.type;
      if (typeof operationType !== "string") continue;

      await this.assertCanExecuteOperation(documentId, operationType, ctx);
    }
  }

  // Load schema from file
  typeDefs = gql(
    fs.readFileSync(path.join(__dirname, "schema.graphql"), "utf-8"),
  );

  resolvers: Resolvers = {
    // Field resolver for PHDocument.operations - fetches operations on demand
    PHDocument: {
      operations: async (parent, args, ctx: Context) => {
        this.logger.debug(
          "PHDocument.operations(@parent.id, @args)",
          parent.id,
          args,
        );

        await this.assertCanRead(parent.id, ctx);

        try {
          // Build the filter using the document's id
          const filter = {
            documentId: parent.id,
            branch: args.filter?.branch,
            scopes: args.filter?.scopes,
            actionTypes: args.filter?.actionTypes,
            sinceRevision: args.filter?.sinceRevision,
            timestampFrom: args.filter?.timestampFrom,
            timestampTo: args.filter?.timestampTo,
          };

          return await resolvers.documentOperations(this.reactorClient, {
            filter,
            paging: args.paging,
          });
        } catch (error) {
          this.logger.error("Error in PHDocument.operations: @Error", error);
          throw error;
        }
      },
    },

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
          await this.assertCanRead(args.identifier, ctx);
          return await resolvers.document(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in document: @Error", error);
          throw error;
        }
      },

      documentChildren: async (_parent, args, ctx: Context) => {
        this.logger.debug("documentChildren(@args)", args);
        try {
          await this.assertCanRead(args.parentIdentifier, ctx);
          return await resolvers.documentChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentChildren: @Error", error);
          throw error;
        }
      },

      documentParents: async (_parent, args, ctx: Context) => {
        this.logger.debug("documentParents(@args)", args);
        try {
          await this.assertCanRead(args.childIdentifier, ctx);
          const result = await resolvers.documentParents(
            this.reactorClient,
            args,
          );
          // Filter results to only include documents the user can read
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
            };
          }

          return result;
        } catch (error) {
          this.logger.error("Error in documentParents: @Error", error);
          throw error;
        }
      },

      findDocuments: async (_parent, args, ctx: Context) => {
        this.logger.debug("findDocuments(@args)", args);
        try {
          const result = await resolvers.findDocuments(this.reactorClient, {
            ...args,
            search: args.search ?? {},
          });

          // Filter results to only include documents the user can read
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
          await this.assertCanRead(args.filter.documentId, ctx);
          return await resolvers.documentOperations(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentOperations: @Error", error);
          throw error;
        }
      },

      pollSyncEnvelopes: (
        _parent: unknown,
        args: { channelId: string; outboxAck: number; outboxLatest: number },
      ) => {
        this.logger.debug("pollSyncEnvelopes(@args)", args);

        try {
          const { envelopes, ackOrdinal, deadLetters } =
            resolvers.pollSyncEnvelopes(this.syncManager, args);
          return {
            envelopes,
            ackOrdinal,
            deadLetters,
          };
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

            await this.assertCanWrite(parent.document.id, ctx);
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
          const result = await resolvers.createDocument(
            this.reactorClient,
            args,
          );

          // Auto-ownership: set creator as document owner
          if (this.authorizationService && ctx.user?.address && result?.id) {
            await this.documentPermissionService?.initializeDocumentProtection(
              result.id,
              ctx.user.address,
              this.authorizationService.config.defaultProtection,
            );
          }

          return result;
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

            await this.assertCanWrite(parent.document.id, ctx);
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
          const result = await resolvers.createEmptyDocument(
            this.reactorClient,
            args,
          );

          // Auto-ownership: set creator as document owner
          if (this.authorizationService && ctx.user?.address && result?.id) {
            await this.documentPermissionService?.initializeDocumentProtection(
              result.id,
              ctx.user.address,
              this.authorizationService.config.defaultProtection,
            );
          }

          return result;
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
          // assertCanExecuteOperations uses canMutate (which combines write + operation checks)
          // when authorizationService is available. For legacy fallback, assertCanWrite is needed.
          if (!this.authorizationService) {
            await this.assertCanWrite(args.documentIdentifier, ctx);
          }

          // Check operation-level permissions for each action
          await this.assertCanExecuteOperations(
            args.documentIdentifier,
            args.actions,
            ctx,
          );

          return await resolvers.mutateDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in mutateDocument(@args): @Error", error);
          throw error;
        }
      },

      mutateDocumentAsync: async (_parent, args, ctx: Context) => {
        this.logger.debug("mutateDocumentAsync(@args)", args);
        try {
          if (!this.authorizationService) {
            await this.assertCanWrite(args.documentIdentifier, ctx);
          }

          // Check operation-level permissions for each action
          await this.assertCanExecuteOperations(
            args.documentIdentifier,
            args.actions,
            ctx,
          );

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
          await this.assertCanWrite(args.documentIdentifier, ctx);

          return await resolvers.renameDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in renameDocument(@args): @Error", error);
          throw error;
        }
      },

      addChildren: async (_parent, args, ctx: Context) => {
        this.logger.debug("addChildren(@args)", args);
        try {
          await this.assertCanWrite(args.parentIdentifier, ctx);

          return await resolvers.addChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in addChildren(@args): @Error", error);
          throw error;
        }
      },

      removeChildren: async (_parent, args, ctx: Context) => {
        this.logger.debug("removeChildren(@args)", args);
        try {
          await this.assertCanWrite(args.parentIdentifier, ctx);

          return await resolvers.removeChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in removeChildren(@args): @Error", error);
          throw error;
        }
      },

      moveChildren: async (_parent, args, ctx: Context) => {
        this.logger.debug("moveChildren(@args)", args);
        try {
          await this.assertCanWrite(args.sourceParentIdentifier, ctx);
          await this.assertCanWrite(args.targetParentIdentifier, ctx);

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
          await this.assertCanWrite(args.identifier, ctx);

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
            await this.assertCanWrite(identifier, ctx);
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
                      ordinal: op.context.ordinal,
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
              key: envelope.key ?? undefined,
              dependsOn: envelope.dependsOn
                ? [...envelope.dependsOn]
                : undefined,
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
              search?: {
                type?: string | null;
                parentId?: string | null;
              } | null;
            },
          ) => {
            if (!payload) {
              return false;
            }

            const search = {
              type: args.search?.type ?? undefined,
              parentId: args.search?.parentId ?? undefined,
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
