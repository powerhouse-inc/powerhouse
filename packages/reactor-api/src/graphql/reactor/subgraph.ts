import { ConsoleLogger } from "document-model";
import { DriveCollectionId } from "@powerhousedao/reactor";
import { GraphQLError } from "graphql";
import { withFilter } from "graphql-subscriptions";
import { gql } from "graphql-tag";
import schemaSource from "./schema.graphql";
import {
  AuthorizedDocumentHandle,
  type CanonicalDocumentId,
} from "../../services/authorization.service.js";
import { BaseSubgraph } from "../base-subgraph.js";
import type { Context, SubgraphArgs } from "../types.js";
import {
  collectChangedDocumentIds,
  matchesJobFilter,
  matchesSearchFilter,
  toGqlDocumentChangeEvent,
} from "./adapters.js";
import { isDriveContainerType } from "./constants.js";
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
  ): Promise<AuthorizedDocumentHandle> {
    let handle = AuthorizedDocumentHandle.skipped(documentId);
    for (const action of actions) {
      if (!action || typeof action !== "object") continue;
      const actionObj = action as Record<string, unknown>;
      const operationType = actionObj.type;
      if (typeof operationType !== "string") continue;

      handle = await this.assertCanExecuteOperation(
        documentId,
        operationType,
        ctx,
      );
    }
    return handle;
  }

  /**
   * Returns the drive id when the given identifier (id or slug) refers
   * to a drive document, otherwise undefined. Used by deleteDocument to
   * decide whether to invalidate the drive-ownership cache after a
   * successful delete.
   */
  async #resolveDriveId(identifier: string): Promise<string | undefined> {
    try {
      const doc = await this.reactorClient.get(identifier);
      if (isDriveContainerType(doc.header.documentType)) {
        return doc.header.id;
      }
      return undefined;
    } catch {
      return undefined;
    }
  }

  /**
   * Adds to `forbidden` the canonical document ids in `syncOps` that the caller
   * cannot read, checking each distinct id once. Sync operation document ids are
   * canonical (never slugs), so no resolution is needed.
   */
  async #collectForbiddenDocuments(
    syncOps: ReadonlyArray<{ documentId: string }>,
    forbidden: Set<string>,
    ctx: Context,
  ): Promise<void> {
    const checked = new Set<string>();
    for (const syncOp of syncOps) {
      const documentId = syncOp.documentId;
      if (checked.has(documentId) || forbidden.has(documentId)) continue;
      checked.add(documentId);
      const canRead = await this.canReadDocument(
        documentId as CanonicalDocumentId,
        ctx,
      );
      if (!canRead) forbidden.add(documentId);
    }
  }

  typeDefs = gql(schemaSource);

  resolvers: Resolvers = {
    // Field resolver for PHDocument.operations - fetches operations on demand
    PHDocument: {
      operations: async (parent, args, ctx: Context) => {
        this.logger.debug(
          "PHDocument.operations(@parent.id, @args)",
          parent.id,
          args,
        );

        await this.assertCanReadCanonical(
          parent.id as CanonicalDocumentId,
          ctx,
        );

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
          const handle = await this.assertCanRead(args.identifier, ctx);
          return await resolvers.document(this.reactorClient, {
            ...args,
            identifier: handle.fetchIdentifier,
          });
        } catch (error) {
          this.logger.error("Error in document: @Error", error);
          throw error;
        }
      },

      documentOutgoingRelationships: async (_parent, args, ctx: Context) => {
        this.logger.debug("documentOutgoingRelationships(@args)", args);
        try {
          const handle = await this.assertCanRead(args.sourceIdentifier, ctx);
          return await resolvers.documentOutgoingRelationships(
            this.reactorClient,
            { ...args, sourceIdentifier: handle.fetchIdentifier },
          );
        } catch (error) {
          this.logger.error(
            "Error in documentOutgoingRelationships: @Error",
            error,
          );
          throw error;
        }
      },

      documentIncomingRelationships: async (_parent, args, ctx: Context) => {
        this.logger.debug("documentIncomingRelationships(@args)", args);
        try {
          const handle = await this.assertCanRead(args.targetIdentifier, ctx);
          const result = await resolvers.documentIncomingRelationships(
            this.reactorClient,
            { ...args, targetIdentifier: handle.fetchIdentifier },
          );
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
            };
          }

          return result;
        } catch (error) {
          this.logger.error(
            "Error in documentIncomingRelationships: @Error",
            error,
          );
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
          const handle = await this.assertCanRead(args.filter.documentId, ctx);
          return await resolvers.documentOperations(this.reactorClient, {
            ...args,
            filter: {
              ...args.filter,
              documentId: handle.fetchIdentifier,
            },
          });
        } catch (error) {
          this.logger.error("Error in documentOperations: @Error", error);
          throw error;
        }
      },

      pollSyncEnvelopes: async (
        _parent: unknown,
        args: { channelId: string; outboxAck: number; outboxLatest: number },
        ctx: Context,
      ) => {
        this.logger.debug("pollSyncEnvelopes(@args)", args);

        try {
          let remote;
          try {
            remote = this.syncManager.getById(args.channelId);
          } catch (error) {
            throw new GraphQLError(
              `Channel not found: ${error instanceof Error ? error.message : "Unknown error"}`,
            );
          }

          // A collection is a drive-level abstraction; its canonical drive id is
          // carried by the collection id (never a slug).
          const driveId = remote.collectionId.driveId as CanonicalDocumentId;
          const isAdmin = this.authorizationService.isSupremeAdmin(
            ctx.user?.address,
          );

          // Tier 1: reading any operation in a collection requires read access to
          // the drive it belongs to. No drive read, no document read.
          if (!isAdmin) {
            await this.assertCanReadCanonical(driveId, ctx);
          }

          // Tier 2/3: drop operations and dead letters for documents the caller
          // cannot read individually.
          const forbiddenIds = new Set<string>();
          if (!isAdmin) {
            // A caller who can read a *protected* drive holds a grant that
            // inherits to every in-collection member, so the outbox needs no
            // per-document check. Only a world-readable drive can contain an
            // individually-protected member this caller cannot read.
            const driveWorldReadable = await this.authorizationService.canRead(
              driveId,
              undefined,
            );
            if (driveWorldReadable) {
              await this.#collectForbiddenDocuments(
                remote.channel.outbox.items,
                forbiddenIds,
                ctx,
              );
            }
            // Dead letters can carry documents outside this collection (failed
            // inbox jobs) that the drive gate does not cover, so always filter.
            await this.#collectForbiddenDocuments(
              remote.channel.deadLetter.items,
              forbiddenIds,
              ctx,
            );
          }

          const { envelopes, ackOrdinal, deadLetters, hasMore } =
            resolvers.pollSyncEnvelopes(this.syncManager, args, forbiddenIds);
          return {
            envelopes,
            ackOrdinal,
            deadLetters,
            hasMore,
          };
        } catch (error) {
          this.logger.error(
            "Error in pollSyncEnvelopes(@args): @Error",
            args,
            error,
          );
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

            await this.assertCanWriteCanonical(
              parent.document.id as CanonicalDocumentId,
              ctx,
            );
          } else {
            this.assertCanCreate(ctx);
          }
          const result = await resolvers.createDocument(
            this.reactorClient,
            args,
            this.graphqlManager.reactorDriveClient,
          );

          if (result?.id && isDriveContainerType(result.documentType)) {
            this.graphqlManager.driveOwnershipCache.add(result.id);
          }

          // Auto-ownership: set creator as document owner
          if (ctx.user?.address && result?.id) {
            await this.documentPermissionService?.initializeDocumentProtection(
              result.id,
              ctx.user.address,
              this.authorizationService.config.defaultProtection,
            );
          }

          return result;
        } catch (error) {
          this.logger.error(
            "Error in createDocument(@args): @Error",
            args,
            error,
          );
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

            await this.assertCanWriteCanonical(
              parent.document.id as CanonicalDocumentId,
              ctx,
            );
          } else {
            this.assertCanCreate(ctx);
          }
          const result = await resolvers.createEmptyDocument(
            this.reactorClient,
            args,
            this.graphqlManager.reactorDriveClient,
          );

          if (result?.id && isDriveContainerType(result.documentType)) {
            this.graphqlManager.driveOwnershipCache.add(result.id);
          }

          // Auto-ownership: set creator as document owner
          if (ctx.user?.address && result?.id) {
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
            args,
            error,
          );
          throw error;
        }
      },

      mutateDocument: async (_parent, args, ctx: Context) => {
        this.logger.debug("mutateDocument(@args)", args);
        try {
          // canMutate combines the write + operation checks per action.
          const handle = await this.assertCanExecuteOperations(
            args.documentIdentifier,
            args.actions,
            ctx,
          );

          return await resolvers.mutateDocument(this.reactorClient, {
            ...args,
            documentIdentifier: handle.fetchIdentifier,
          });
        } catch (error) {
          this.logger.error(
            "Error in mutateDocument(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },

      mutateDocumentAsync: async (_parent, args, ctx: Context) => {
        this.logger.debug("mutateDocumentAsync(@args)", args);
        try {
          const handle = await this.assertCanExecuteOperations(
            args.documentIdentifier,
            args.actions,
            ctx,
          );

          return await resolvers.mutateDocumentAsync(this.reactorClient, {
            ...args,
            documentIdentifier: handle.fetchIdentifier,
          });
        } catch (error) {
          this.logger.error(
            "Error in mutateDocumentAsync(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },

      renameDocument: async (_parent, args, ctx: Context) => {
        this.logger.debug("renameDocument(@args)", args);
        try {
          const handle = await this.assertCanWrite(
            args.documentIdentifier,
            ctx,
          );

          return await resolvers.renameDocument(this.reactorClient, {
            ...args,
            documentIdentifier: handle.fetchIdentifier,
          });
        } catch (error) {
          this.logger.error(
            "Error in renameDocument(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },

      setPreferredEditor: async (_parent, args, ctx: Context) => {
        this.logger.debug("setPreferredEditor(@args)", args);
        try {
          const handle = await this.assertCanWrite(
            args.documentIdentifier,
            ctx,
          );

          return await resolvers.setPreferredEditor(this.reactorClient, {
            ...args,
            documentIdentifier: handle.fetchIdentifier,
          });
        } catch (error) {
          this.logger.error(
            "Error in setPreferredEditor(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },

      addRelationship: async (_parent, args, ctx: Context) => {
        this.logger.debug("addRelationship(@args)", args);
        try {
          const handle = await this.assertCanWrite(args.sourceIdentifier, ctx);

          return await resolvers.addRelationship(this.reactorClient, {
            ...args,
            sourceIdentifier: handle.fetchIdentifier,
          });
        } catch (error) {
          this.logger.error(
            "Error in addRelationship(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },

      removeRelationship: async (_parent, args, ctx: Context) => {
        this.logger.debug("removeRelationship(@args)", args);
        try {
          const handle = await this.assertCanWrite(args.sourceIdentifier, ctx);

          return await resolvers.removeRelationship(this.reactorClient, {
            ...args,
            sourceIdentifier: handle.fetchIdentifier,
          });
        } catch (error) {
          this.logger.error(
            "Error in removeRelationship(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },

      moveRelationship: async (_parent, args, ctx: Context) => {
        this.logger.debug("moveRelationship(@args)", args);
        try {
          const sourceHandle = await this.assertCanWrite(
            args.sourceParentIdentifier,
            ctx,
          );
          const targetHandle = await this.assertCanWrite(
            args.targetParentIdentifier,
            ctx,
          );

          return await resolvers.moveRelationship(this.reactorClient, {
            ...args,
            sourceParentIdentifier: sourceHandle.fetchIdentifier,
            targetParentIdentifier: targetHandle.fetchIdentifier,
          });
        } catch (error) {
          this.logger.error(
            "Error in moveRelationship(@args): @Error @args",
            error,
            args,
          );
          throw error;
        }
      },

      deleteDocument: async (_parent, args, ctx: Context) => {
        this.logger.debug("deleteDocument(@args)", args);
        try {
          const handle = await this.assertCanWrite(args.identifier, ctx);
          const identifier = handle.fetchIdentifier;

          // Resolve identifier (id or slug) to detect drive deletes for cache
          // invalidation. Only one read; no-op for non-drive callers via the
          // catch.
          const driveIdToInvalidate = await this.#resolveDriveId(identifier);

          const result = await resolvers.deleteDocument(
            this.reactorClient,
            { ...args, identifier },
            this.graphqlManager.reactorDriveClient,
          );

          if (result && driveIdToInvalidate) {
            this.graphqlManager.driveOwnershipCache.remove(driveIdToInvalidate);
          }

          return result;
        } catch (error) {
          this.logger.error(
            "Error in deleteDocument(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },

      deleteDocuments: async (_parent, args, ctx: Context) => {
        this.logger.debug("deleteDocuments(@args)", args);
        try {
          // Check write permission on each document, resolving slugs so the
          // delete targets the same canonical ids the checks authorized.
          const identifiers: string[] = [];
          for (const identifier of args.identifiers) {
            const handle = await this.assertCanWrite(identifier, ctx);
            identifiers.push(handle.fetchIdentifier);
          }
          return await resolvers.deleteDocuments(this.reactorClient, {
            ...args,
            identifiers,
          });
        } catch (error) {
          this.logger.error(
            "Error in deleteDocuments(@args): @Error",
            args,
            error,
          );
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
        ctx: Context,
      ) => {
        this.logger.debug("touchChannel(@args)", args);

        try {
          // A channel synchronizes a collection, i.e. a drive. Registering one
          // requires read access to that drive; pushed operations are still
          // authorized per-operation in pushSyncEnvelopes. The collection id
          // carries the canonical drive id (never a slug).
          if (!this.authorizationService.isSupremeAdmin(ctx.user?.address)) {
            const driveId = DriveCollectionId.fromKey(args.input.collectionId)
              .driveId as CanonicalDocumentId;
            await this.assertCanReadCanonical(driveId, ctx);
          }

          return await resolvers.touchChannel(this.syncManager, args);
        } catch (error) {
          this.logger.error(
            "Error in touchChannel(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },

      pushSyncEnvelopes: async (_parent, args, ctx: Context) => {
        this.logger.debug("pushSyncEnvelopes(@args)", args);

        try {
          // Check canMutate per distinct (documentId, action type). Nested map
          // rather than a joined key: a separator could be forged to collide
          // two distinct pairs and skip a check.
          const checkedOperations = new Map<string, Set<string>>();
          for (const envelope of args.envelopes) {
            for (const op of envelope.operations ?? []) {
              const documentId = op.context.documentId;
              const operationType = op.operation.action.type;
              let checkedTypes = checkedOperations.get(documentId);
              if (!checkedTypes) {
                checkedTypes = new Set<string>();
                checkedOperations.set(documentId, checkedTypes);
              }
              if (checkedTypes.has(operationType)) continue;
              checkedTypes.add(operationType);
              // Operation context ids are canonical document ids supplied by the
              // sync protocol (never slugs) and may reference documents not yet
              // materialized locally, so check them without slug resolution.
              await this.assertCanExecuteOperationCanonical(
                documentId as CanonicalDocumentId,
                operationType,
                ctx,
              );
            }
          }

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
          this.logger.error(
            "Error in pushSyncEnvelopes(@args): @Error",
            args,
            error,
          );
          throw error;
        }
      },
    },

    Subscription: {
      documentChanges: {
        // Drop events referencing any document the subscriber cannot read. The
        // check lives in the withFilter predicate (fail-closed on throw) so it
        // covers both transports, which share this resolver.
        subscribe: (
          rootValue: unknown,
          args: {
            search?: { type?: string | null; parentId?: string | null } | null;
          },
          ctx: Context,
          info: unknown,
        ) => {
          this.logger.debug("documentChanges subscription started");
          const filtered = withFilter<
            DocumentChangesPayload,
            {
              search?: {
                type?: string | null;
                parentId?: string | null;
              } | null;
            },
            Context
          >(
            () => {
              ensureGlobalDocumentSubscription(this.reactorClient);
              return getPubSub().asyncIterableIterator<DocumentChangesPayload>(
                SUBSCRIPTION_TRIGGERS.DOCUMENT_CHANGES,
              );
            },
            async (payload, filterArgs, filterCtx) => {
              if (!payload) return false;

              const search = {
                type: filterArgs?.search?.type ?? undefined,
                parentId: filterArgs?.search?.parentId ?? undefined,
              };
              if (!matchesSearchFilter(payload.documentChanges, search)) {
                return false;
              }

              if (
                this.authorizationService.isSupremeAdmin(
                  filterCtx?.user?.address,
                )
              ) {
                return true;
              }

              const documentIds = collectChangedDocumentIds(
                payload.documentChanges,
              );
              if (documentIds.length === 0) return false;
              for (const documentId of documentIds) {
                const canRead = await this.canReadDocument(
                  documentId as CanonicalDocumentId,
                  filterCtx as Context,
                );
                if (!canRead) return false;
              }
              return true;
            },
          );
          return filtered(rootValue as DocumentChangesPayload, args, ctx, info);
        },
        resolve: (payload: DocumentChangesPayload) => {
          return toGqlDocumentChangeEvent(payload.documentChanges);
        },
      },

      jobChanges: {
        // Drop events unless the subscriber can read the job's document.
        subscribe: (
          rootValue: unknown,
          args: { jobId: string },
          ctx: Context,
          info: unknown,
        ) => {
          this.logger.debug("jobChanges(@args) subscription started", args);
          const filtered = withFilter<
            JobChangesPayload,
            { jobId: string },
            Context
          >(
            () => {
              ensureJobSubscription(this.reactorClient, args.jobId);
              return getPubSub().asyncIterableIterator<JobChangesPayload>(
                SUBSCRIPTION_TRIGGERS.JOB_CHANGES,
              );
            },
            async (payload, filterArgs, filterCtx) => {
              if (!payload || !filterArgs) return false;
              if (!matchesJobFilter(payload, filterArgs)) return false;

              if (
                this.authorizationService.isSupremeAdmin(
                  filterCtx?.user?.address,
                )
              ) {
                return true;
              }

              if (!payload.documentId) return false;
              return this.canReadDocument(
                payload.documentId as CanonicalDocumentId,
                filterCtx as Context,
              );
            },
          );
          return filtered(rootValue as JobChangesPayload, args, ctx, info);
        },
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
