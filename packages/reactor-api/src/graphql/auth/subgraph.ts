import { ConsoleLogger } from "document-model";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import schemaSource from "./schema.graphql";
import { requireOneOf } from "../argument-aliases.js";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SubgraphArgs } from "../types.js";
import * as resolvers from "./resolvers.js";

type DocumentArgs = {
  documentIdOrSlug?: string | null;
  documentId?: string | null;
};

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
        args: DocumentArgs,
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
            await this.#withCanonicalDocumentArgs(args, ctx),
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
        args: DocumentArgs & { operationType: string },
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
            await this.#withCanonicalDocumentArgs(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in operationPermissions: @error", error);
          throw error;
        }
      },

      canExecuteOperation: async (
        _parent: unknown,
        args: DocumentArgs & { operationType: string },
        ctx: { user?: { address: string } },
      ) => {
        this.logger.debug("canExecuteOperation(@args)", args);
        try {
          return await resolvers.canExecuteOperation(
            this.authorizationService,
            await this.#withCanonicalDocumentArgs(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in canExecuteOperation: @error", error);
          throw error;
        }
      },

      documentProtection: async (
        _parent: unknown,
        args: DocumentArgs,
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
            await this.#withCanonicalDocumentArgs(args, ctx),
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
        args: DocumentArgs & { protected: boolean },
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
            await this.#withCanonicalDocumentArgs(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in setDocumentProtection: @error", error);
          throw error;
        }
      },

      transferDocumentOwnership: async (
        _parent: unknown,
        args: DocumentArgs & { newOwnerAddress: string },
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
            await this.#withCanonicalDocumentArgs(args, ctx),
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
        args: DocumentArgs & { userAddress: string; permission: string },
        ctx: {
          user?: { address: string };
        },
      ) => {
        this.logger.debug("grantDocumentPermission(@args)", args);
        if (!this.documentPermissionService) {
          throw new GraphQLError("DocumentPermissionService not available");
        }
        try {
          const resolved = await this.#withCanonicalDocumentArgs(args, ctx);
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
        args: DocumentArgs & { userAddress: string },
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
            await this.#withCanonicalDocumentArgs(args, ctx),
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
        args: DocumentArgs & { operationType: string; userAddress: string },
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
            await this.#withCanonicalDocumentArgs(args, ctx),
            ctx.user?.address,
          );
        } catch (error) {
          this.logger.error("Error in grantOperationPermission: @error", error);
          throw error;
        }
      },

      revokeOperationPermission: async (
        _parent: unknown,
        args: DocumentArgs & { operationType: string; userAddress: string },
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
            await this.#withCanonicalDocumentArgs(args, ctx),
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

  #withCanonicalDocumentArgs<T extends DocumentArgs>(args: T, ctx: object) {
    const { documentIdOrSlug, documentId, ...rest } = args;
    return this.withCanonicalDocumentId(
      {
        ...rest,
        documentId: requireOneOf<string>(
          { documentIdOrSlug, documentId },
          "documentIdOrSlug",
          "documentId",
        ),
      },
      ctx,
    );
  }

  onSetup(): Promise<void> {
    this.logger.debug("Setting up AuthSubgraph");
    return Promise.resolve();
  }
}
