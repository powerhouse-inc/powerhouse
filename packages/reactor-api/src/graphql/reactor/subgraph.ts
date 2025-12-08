import { ConsoleLogger } from "@powerhousedao/reactor";
import fs from "fs";
import { withFilter } from "graphql-subscriptions";
import { gql } from "graphql-tag";
import path from "path";
import { fileURLToPath } from "url";
import type { DocumentPermissionService } from "../../services/document-permission.service.js";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SubgraphArgs } from "../types.js";
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

  // Load schema from file
  typeDefs = gql(
    fs.readFileSync(path.join(__dirname, "schema.graphql"), "utf-8"),
  );

  resolvers: Resolvers = {
    Query: {
      documentModels: async (_parent, args) => {
        this.logger.debug("documentModels", args);
        try {
          return await resolvers.documentModels(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentModels:", error);
          throw error;
        }
      },

      document: async (_parent, args) => {
        this.logger.debug("document", args);
        try {
          return await resolvers.document(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in document:", error);
          throw error;
        }
      },

      documentChildren: async (_parent, args) => {
        this.logger.debug("documentChildren", args);
        try {
          return await resolvers.documentChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentChildren:", error);
          throw error;
        }
      },

      documentParents: async (_parent, args) => {
        this.logger.debug("documentParents", args);
        try {
          return await resolvers.documentParents(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in documentParents:", error);
          throw error;
        }
      },

      findDocuments: async (_parent, args) => {
        this.logger.debug("findDocuments", args);
        try {
          return await resolvers.findDocuments(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in findDocuments:", error);
          throw error;
        }
      },

      jobStatus: async (_parent, args) => {
        this.logger.debug("jobStatus", args);
        try {
          return await resolvers.jobStatus(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in jobStatus:", error);
          throw error;
        }
      },

      pollSyncEnvelopes: async (
        _parent: unknown,
        args: { channelId: string; cursorOrdinal: number },
      ) => {
        this.logger.debug("pollSyncEnvelopes", args);
        if (!this.syncManager) {
          throw new Error("SyncManager not available");
        }
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-return
          return await resolvers.pollSyncEnvelopes(this.syncManager, args);
        } catch (error) {
          this.logger.error("Error in pollSyncEnvelopes:", error);
          throw error;
        }
      },

      documentAccess: async (
        _parent: unknown,
        args: { documentId: string },
        ctx: {
          documentPermissionService?: DocumentPermissionService;
        },
      ) => {
        this.logger.debug("documentAccess", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.documentAccess(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in documentAccess:", error);
          throw error;
        }
      },

      userDocumentPermissions: async (
        _parent: unknown,
        _args: unknown,
        ctx: {
          user?: { address: string };
          documentPermissionService?: DocumentPermissionService;
        },
      ) => {
        this.logger.debug("userDocumentPermissions");
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        if (!ctx.user?.address) {
          return [];
        }
        try {
          return await resolvers.userDocumentPermissions(
            this.documentPermissionService,
            ctx.user.address,
          );
        } catch (error) {
          this.logger.error("Error in userDocumentPermissions:", error);
          throw error;
        }
      },

      groups: async () => {
        this.logger.debug("groups");
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.groups(this.documentPermissionService);
        } catch (error) {
          this.logger.error("Error in groups:", error);
          throw error;
        }
      },

      group: async (_parent: unknown, args: { id: number }) => {
        this.logger.debug("group", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.group(this.documentPermissionService, args);
        } catch (error) {
          this.logger.error("Error in group:", error);
          throw error;
        }
      },

      roles: async () => {
        this.logger.debug("roles");
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.roles(this.documentPermissionService);
        } catch (error) {
          this.logger.error("Error in roles:", error);
          throw error;
        }
      },

      role: async (_parent: unknown, args: { id: number }) => {
        this.logger.debug("role", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.role(this.documentPermissionService, args);
        } catch (error) {
          this.logger.error("Error in role:", error);
          throw error;
        }
      },

      userGroups: async (
        _parent: unknown,
        args: { userAddress: string },
      ) => {
        this.logger.debug("userGroups", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.userGroups(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in userGroups:", error);
          throw error;
        }
      },

      userRoles: async (
        _parent: unknown,
        args: { userAddress: string },
      ) => {
        this.logger.debug("userRoles", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.userRoles(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in userRoles:", error);
          throw error;
        }
      },

      canExecuteOperation: async (
        _parent: unknown,
        args: { documentId: string; operationType: string },
        ctx: { user?: { address: string } },
      ) => {
        this.logger.debug("canExecuteOperation", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.canExecuteOperation(
            this.documentPermissionService,
            args,
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in canExecuteOperation:", error);
          throw error;
        }
      },
    },

    Mutation: {
      createDocument: async (_parent, args) => {
        this.logger.debug("createDocument", args);
        try {
          return await resolvers.createDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in createDocument:", error);
          throw error;
        }
      },

      createEmptyDocument: async (_parent, args) => {
        this.logger.debug("createEmptyDocument", args);
        try {
          return await resolvers.createEmptyDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in createEmptyDocument:", error);
          throw error;
        }
      },

      mutateDocument: async (_parent, args) => {
        this.logger.debug("mutateDocument", args);
        try {
          return await resolvers.mutateDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in mutateDocument:", error);
          throw error;
        }
      },

      mutateDocumentAsync: async (_parent, args) => {
        this.logger.debug("mutateDocumentAsync", args);
        try {
          return await resolvers.mutateDocumentAsync(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in mutateDocumentAsync:", error);
          throw error;
        }
      },

      renameDocument: async (_parent, args) => {
        this.logger.debug("renameDocument", args);
        try {
          return await resolvers.renameDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in renameDocument:", error);
          throw error;
        }
      },

      addChildren: async (_parent, args) => {
        this.logger.debug("addChildren", args);
        try {
          return await resolvers.addChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in addChildren:", error);
          throw error;
        }
      },

      removeChildren: async (_parent, args) => {
        this.logger.debug("removeChildren", args);
        try {
          return await resolvers.removeChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in removeChildren:", error);
          throw error;
        }
      },

      moveChildren: async (_parent, args) => {
        this.logger.debug("moveChildren", args);
        try {
          return await resolvers.moveChildren(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in moveChildren:", error);
          throw error;
        }
      },

      deleteDocument: async (_parent, args) => {
        this.logger.debug("deleteDocument", args);
        try {
          return await resolvers.deleteDocument(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in deleteDocument:", error);
          throw error;
        }
      },

      deleteDocuments: async (_parent, args) => {
        this.logger.debug("deleteDocuments", args);
        try {
          return await resolvers.deleteDocuments(this.reactorClient, args);
        } catch (error) {
          this.logger.error("Error in deleteDocuments:", error);
          throw error;
        }
      },

      createChannel: async (
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
          };
        },
      ) => {
        this.logger.debug("createChannel", args);
        if (!this.syncManager) {
          throw new Error("SyncManager not available");
        }
        try {
          return await resolvers.createChannel(this.syncManager, args);
        } catch (error) {
          this.logger.error("Error in createChannel:", error);
          throw error;
        }
      },

      pushSyncEnvelope: async (_parent, args) => {
        this.logger.debug("pushSyncEnvelope", args);
        if (!this.syncManager) {
          throw new Error("SyncManager not available");
        }
        try {
          // Convert readonly arrays to mutable arrays for the resolver
          const mutableArgs = {
            envelope: {
              type: args.envelope.type,
              channelMeta: { id: args.envelope.channelMeta.id },
              operations: args.envelope.operations
                ? args.envelope.operations.map((op) => ({
                    operation: op.operation,
                    context: {
                      documentId: op.context.documentId,
                      documentType: op.context.documentType,
                      scope: op.context.scope,
                      branch: op.context.branch,
                    },
                  }))
                : null,
              cursor: args.envelope.cursor
                ? {
                    remoteName: args.envelope.cursor.remoteName,
                    cursorOrdinal: args.envelope.cursor.cursorOrdinal,
                    lastSyncedAtUtcMs: args.envelope.cursor.lastSyncedAtUtcMs,
                  }
                : null,
            },
          };
          return await resolvers.pushSyncEnvelope(
            this.syncManager,
            mutableArgs,
          );
        } catch (error) {
          this.logger.error("Error in pushSyncEnvelope:", error);
          throw error;
        }
      },

      setDocumentVisibility: async (
        _parent: unknown,
        args: { documentId: string; visibility: string },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("setDocumentVisibility", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.setDocumentVisibility(
            this.documentPermissionService,
            args as {
              documentId: string;
              visibility: "PUBLIC" | "PROTECTED" | "PRIVATE";
            },
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in setDocumentVisibility:", error);
          throw error;
        }
      },

      grantDocumentPermission: async (
        _parent: unknown,
        args: { documentId: string; userAddress: string; permission: string },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("grantDocumentPermission", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.grantDocumentPermission(
            this.documentPermissionService,
            args as {
              documentId: string;
              userAddress: string;
              permission: "READ" | "WRITE" | "ADMIN";
            },
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in grantDocumentPermission:", error);
          throw error;
        }
      },

      revokeDocumentPermission: async (
        _parent: unknown,
        args: { documentId: string; userAddress: string },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("revokeDocumentPermission", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.revokeDocumentPermission(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in revokeDocumentPermission:", error);
          throw error;
        }
      },

      // Group Management Mutations
      createGroup: async (
        _parent: unknown,
        args: { name: string; description?: string | null },
      ) => {
        this.logger.debug("createGroup", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.createGroup(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in createGroup:", error);
          throw error;
        }
      },

      deleteGroup: async (_parent: unknown, args: { id: number }) => {
        this.logger.debug("deleteGroup", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.deleteGroup(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in deleteGroup:", error);
          throw error;
        }
      },

      addUserToGroup: async (
        _parent: unknown,
        args: { userAddress: string; groupId: number },
      ) => {
        this.logger.debug("addUserToGroup", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.addUserToGroup(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in addUserToGroup:", error);
          throw error;
        }
      },

      removeUserFromGroup: async (
        _parent: unknown,
        args: { userAddress: string; groupId: number },
      ) => {
        this.logger.debug("removeUserFromGroup", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.removeUserFromGroup(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in removeUserFromGroup:", error);
          throw error;
        }
      },

      // Group Document Permission Mutations
      grantGroupPermission: async (
        _parent: unknown,
        args: { documentId: string; groupId: number; permission: string },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("grantGroupPermission", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.grantGroupPermission(
            this.documentPermissionService,
            args as {
              documentId: string;
              groupId: number;
              permission: "READ" | "WRITE" | "ADMIN";
            },
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in grantGroupPermission:", error);
          throw error;
        }
      },

      revokeGroupPermission: async (
        _parent: unknown,
        args: { documentId: string; groupId: number },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("revokeGroupPermission", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.revokeGroupPermission(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in revokeGroupPermission:", error);
          throw error;
        }
      },

      // Role Management Mutations
      createRole: async (
        _parent: unknown,
        args: { name: string; description?: string | null },
      ) => {
        this.logger.debug("createRole", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.createRole(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in createRole:", error);
          throw error;
        }
      },

      deleteRole: async (_parent: unknown, args: { id: number }) => {
        this.logger.debug("deleteRole", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.deleteRole(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in deleteRole:", error);
          throw error;
        }
      },

      assignRoleToUser: async (
        _parent: unknown,
        args: { userAddress: string; roleId: number },
      ) => {
        this.logger.debug("assignRoleToUser", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.assignRoleToUser(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in assignRoleToUser:", error);
          throw error;
        }
      },

      removeRoleFromUser: async (
        _parent: unknown,
        args: { userAddress: string; roleId: number },
      ) => {
        this.logger.debug("removeRoleFromUser", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          return await resolvers.removeRoleFromUser(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in removeRoleFromUser:", error);
          throw error;
        }
      },

      // Operation Restriction Mutations
      restrictOperation: async (
        _parent: unknown,
        args: { documentId: string; operationType: string },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("restrictOperation", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.restrictOperation(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in restrictOperation:", error);
          throw error;
        }
      },

      unrestrictOperation: async (
        _parent: unknown,
        args: { documentId: string; operationType: string },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("unrestrictOperation", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.unrestrictOperation(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in unrestrictOperation:", error);
          throw error;
        }
      },

      allowRoleForOperation: async (
        _parent: unknown,
        args: { documentId: string; operationType: string; roleId: number },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("allowRoleForOperation", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.allowRoleForOperation(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in allowRoleForOperation:", error);
          throw error;
        }
      },

      disallowRoleForOperation: async (
        _parent: unknown,
        args: { documentId: string; operationType: string; roleId: number },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("disallowRoleForOperation", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.disallowRoleForOperation(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in disallowRoleForOperation:", error);
          throw error;
        }
      },

      allowGroupForOperation: async (
        _parent: unknown,
        args: { documentId: string; operationType: string; groupId: number },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("allowGroupForOperation", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.allowGroupForOperation(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in allowGroupForOperation:", error);
          throw error;
        }
      },

      disallowGroupForOperation: async (
        _parent: unknown,
        args: { documentId: string; operationType: string; groupId: number },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("disallowGroupForOperation", args);
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.disallowGroupForOperation(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in disallowGroupForOperation:", error);
          throw error;
        }
      },
    },

    // Field Resolvers for nested types
    Group: {
      members: async (parent: { id: number }) => {
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        return resolvers.getGroupMembers(
          this.documentPermissionService,
          parent.id,
        );
      },
    },

    DocumentGroupPermission: {
      group: async (parent: { groupId: number }) => {
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        const grp = await resolvers.group(this.documentPermissionService, {
          id: parent.groupId,
        });
        if (!grp) {
          throw new Error(`Group not found: ${parent.groupId}`);
        }
        return grp;
      },
    },

    OperationRestriction: {
      allowedRoles: async (parent: { id: number }) => {
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        return resolvers.getAllowedRolesForOperation(
          this.documentPermissionService,
          parent.id,
        );
      },
      allowedGroups: async (parent: { id: number }) => {
        if (!this.documentPermissionService) {
          throw new Error("DocumentPermissionService not available");
        }
        return resolvers.getAllowedGroupsForOperation(
          this.documentPermissionService,
          parent.id,
        );
      },
    },

    Subscription: {
      documentChanges: {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        subscribe: withFilter(
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          (() => {
            this.logger.debug("documentChanges subscription started");
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
            this.logger.debug("jobChanges subscription", args);
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
    this.logger.info("Setting up ReactorSubgraph");

    return Promise.resolve();
  }
}
