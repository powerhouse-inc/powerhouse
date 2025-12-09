import { ConsoleLogger } from "@powerhousedao/reactor";
import fs from "fs";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import path from "path";
import { fileURLToPath } from "url";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SubgraphArgs } from "../types.js";
import * as resolvers from "../reactor/resolvers.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Auth Subgraph - handles all document permission and authorization operations
 *
 * This subgraph is conditionally registered based on the DOCUMENT_PERMISSIONS_ENABLED
 * feature flag. When enabled, it provides GraphQL operations for:
 * - Document permissions (grant/revoke user access)
 * - Group management (create/delete groups, manage membership)
 * - Group document permissions (grant/revoke group access)
 * - Operation-level permissions (fine-grained operation control)
 */
export class AuthSubgraph extends BaseSubgraph {
  private logger = new ConsoleLogger(["AuthSubgraph"]);

  constructor(args: SubgraphArgs) {
    super(args);
    this.logger.verbose(`constructor()`);
  }

  name = "auth";
  hasSubscriptions = false;

  // Load schema from file
  typeDefs = gql(
    fs.readFileSync(path.join(__dirname, "schema.graphql"), "utf-8"),
  );

  resolvers = {
    Query: {
      documentAccess: async (
        _parent: unknown,
        args: { documentId: string },
      ) => {
        this.logger.debug("documentAccess", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
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
        },
      ) => {
        this.logger.debug("userDocumentPermissions");
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.group(this.documentPermissionService, args);
        } catch (error) {
          this.logger.error("Error in group:", error);
          throw error;
        }
      },

      userGroups: async (_parent: unknown, args: { userAddress: string }) => {
        this.logger.debug("userGroups", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
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

      operationPermissions: async (
        _parent: unknown,
        args: { documentId: string; operationType: string },
      ) => {
        this.logger.debug("operationPermissions", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.operationPermissions(
            this.documentPermissionService,
            args,
          );
        } catch (error) {
          this.logger.error("Error in operationPermissions:", error);
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
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

      // Operation Permission Mutations
      grantOperationPermission: async (
        _parent: unknown,
        args: { documentId: string; operationType: string; userAddress: string },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("grantOperationPermission", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.grantOperationPermission(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in grantOperationPermission:", error);
          throw error;
        }
      },

      revokeOperationPermission: async (
        _parent: unknown,
        args: { documentId: string; operationType: string; userAddress: string },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("revokeOperationPermission", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.revokeOperationPermission(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in revokeOperationPermission:", error);
          throw error;
        }
      },

      grantGroupOperationPermission: async (
        _parent: unknown,
        args: { documentId: string; operationType: string; groupId: number },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("grantGroupOperationPermission", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.grantGroupOperationPermission(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in grantGroupOperationPermission:", error);
          throw error;
        }
      },

      revokeGroupOperationPermission: async (
        _parent: unknown,
        args: { documentId: string; operationType: string; groupId: number },
        ctx: {
          user?: { address: string };
          isAdmin?: (address: string) => boolean;
        },
      ) => {
        this.logger.debug("revokeGroupOperationPermission", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          const isGlobalAdmin = ctx.isAdmin?.(ctx.user?.address ?? "") ?? false;
          return await resolvers.revokeGroupOperationPermission(
            this.documentPermissionService,
            args,
            ctx.user?.address,
            isGlobalAdmin,
          );
        } catch (error) {
          this.logger.error("Error in revokeGroupOperationPermission:", error);
          throw error;
        }
      },
    },

    // Field Resolvers for nested types
    Group: {
      members: async (parent: { id: number }) => {
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
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
          throw new GraphQLError("DocumentPermissionService not available");
        }
        const grp = await resolvers.group(this.documentPermissionService, {
          id: parent.groupId,
        });
        if (!grp) {
          throw new GraphQLError(`Group not found: ${parent.groupId}`);
        }
        return grp;
      },
    },

    OperationGroupPermission: {
      group: async (parent: { groupId: number }) => {
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        const grp = await resolvers.group(this.documentPermissionService, {
          id: parent.groupId,
        });
        if (!grp) {
          throw new GraphQLError(`Group not found: ${parent.groupId}`);
        }
        return grp;
      },
    },
  };

  onSetup(): Promise<void> {
    this.logger.info("Setting up AuthSubgraph");
    return Promise.resolve();
  }
}
