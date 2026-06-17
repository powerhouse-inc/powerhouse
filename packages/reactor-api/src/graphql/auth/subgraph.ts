import { ConsoleLogger } from "document-model";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import schemaSource from "./schema.graphql";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SubgraphArgs } from "../types.js";
import * as resolvers from "./resolvers.js";

/**
 * Auth Subgraph - handles all document permission and authorization operations
 *
 * This subgraph is conditionally registered based on the DOCUMENT_PERMISSIONS_ENABLED
 * feature flag. When enabled, it provides GraphQL operations for:
 * - Document permissions (grant/revoke user access)
 * - Document protection and ownership
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

  typeDefs = gql(schemaSource);

  resolvers = {
    Query: {
      documentAccess: async (
        _parent: unknown,
        args: { documentId: string },
        ctx: { user?: { address: string } },
      ) => {
        this.logger.debug("documentAccess(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.documentAccess(
            this.documentPermissionService,
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in documentAccess: @error", error);
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
          this.logger.error("Error in userDocumentPermissions: @error", error);
          throw error;
        }
      },

      operationPermissions: async (
        _parent: unknown,
        args: { documentId: string; operationType: string },
        ctx: { user?: { address: string } },
      ) => {
        this.logger.debug("operationPermissions(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.operationPermissions(
            this.documentPermissionService,
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in operationPermissions: @error", error);
          throw error;
        }
      },

      canExecuteOperation: async (
        _parent: unknown,
        args: { documentId: string; operationType: string },
        ctx: { user?: { address: string } },
      ) => {
        this.logger.debug("canExecuteOperation(@args)", args);
        try {
          return await resolvers.canExecuteOperation(
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in canExecuteOperation: @error", error);
          throw error;
        }
      },

      documentProtection: async (
        _parent: unknown,
        args: { documentId: string },
        ctx: {
          user?: { address: string };
        },
      ) => {
        this.logger.debug("documentProtection(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.documentProtection(
            this.documentPermissionService,
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in documentProtection: @error", error);
          throw error;
        }
      },
    },

    Mutation: {
      setDocumentProtection: async (
        _parent: unknown,
        args: { documentId: string; protected: boolean },
        ctx: {
          user?: { address: string };
        },
      ) => {
        this.logger.debug("setDocumentProtection(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.setDocumentProtection(
            this.documentPermissionService,
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in setDocumentProtection: @error", error);
          throw error;
        }
      },

      transferDocumentOwnership: async (
        _parent: unknown,
        args: { documentId: string; newOwnerAddress: string },
        ctx: {
          user?: { address: string };
        },
      ) => {
        this.logger.debug("transferDocumentOwnership(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.transferDocumentOwnership(
            this.documentPermissionService,
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error(
            "Error in transferDocumentOwnership: @error",
            error,
          );
          throw error;
        }
      },

      grantDocumentPermission: async (
        _parent: unknown,
        args: { documentId: string; userAddress: string; permission: string },
        ctx: {
          user?: { address: string };
        },
      ) => {
        this.logger.debug("grantDocumentPermission(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          const resolved = await this.withCanonicalDocumentId(args, ctx);
          return await resolvers.grantDocumentPermission(
            this.documentPermissionService,
            this.authorizationService,
            {
              ...resolved,
              permission: resolved.permission as "READ" | "WRITE" | "ADMIN",
            },
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in grantDocumentPermission: @error", error);
          throw error;
        }
      },

      revokeDocumentPermission: async (
        _parent: unknown,
        args: { documentId: string; userAddress: string },
        ctx: {
          user?: { address: string };
        },
      ) => {
        this.logger.debug("revokeDocumentPermission(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.revokeDocumentPermission(
            this.documentPermissionService,
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in revokeDocumentPermission: @error", error);
          throw error;
        }
      },

      // Operation Permission Mutations
      grantOperationPermission: async (
        _parent: unknown,
        args: {
          documentId: string;
          operationType: string;
          userAddress: string;
        },
        ctx: {
          user?: { address: string };
        },
      ) => {
        this.logger.debug("grantOperationPermission(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.grantOperationPermission(
            this.documentPermissionService,
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in grantOperationPermission: @error", error);
          throw error;
        }
      },

      revokeOperationPermission: async (
        _parent: unknown,
        args: {
          documentId: string;
          operationType: string;
          userAddress: string;
        },
        ctx: {
          user?: { address: string };
        },
      ) => {
        this.logger.debug("revokeOperationPermission(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          return await resolvers.revokeOperationPermission(
            this.documentPermissionService,
            this.authorizationService,
            await this.withCanonicalDocumentId(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error(
            "Error in revokeOperationPermission: @error",
            error,
          );
          throw error;
        }
      },
    },
  };

  onSetup(): Promise<void> {
    this.logger.debug("Setting up AuthSubgraph");
    return Promise.resolve();
  }
}
