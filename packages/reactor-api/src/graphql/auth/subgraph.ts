import { ConsoleLogger } from "document-model";
import { GraphQLError } from "graphql";
import type { DocumentPermissionService } from "../../services/document-permission.service.js";
import { requireOneOf } from "../argument-aliases.js";
import { BaseSubgraph } from "../base-subgraph.js";
import type { SchemaBuilder } from "../subgraph-schema.js";
import type { SubgraphArgs } from "../types.js";
import * as resolvers from "./resolvers.js";
import { authMutations, authQueries, authSchema } from "./schema.js";

function wirePermission<T extends { createdAt: Date; updatedAt: Date }>(
  entry: T,
): Omit<T, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
} {
  return {
    ...entry,
    createdAt: entry.createdAt.toISOString(),
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function wireOperationPermission<T extends { createdAt: Date }>(
  entry: T,
): Omit<T, "createdAt"> & { createdAt: string } {
  return { ...entry, createdAt: entry.createdAt.toISOString() };
}

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

  static override readonly subgraphName = authSchema.subgraphName;

  static override getSchema(schema: SchemaBuilder<AuthSubgraph>) {
    return [
      schema.query("documentAccess", {
        ...authQueries.documentAccess,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("documentAccess(@args)", args);
          return subgraph.#withPermissions(
            "documentAccess",
            async (service) => {
              const access = await resolvers.documentAccess(
                service,
                subgraph.authorizationService,
                await subgraph.#withCanonicalDocumentArgs(args, request),
                request.user?.address,
              );
              return {
                ...access,
                permissions: access.permissions.map(wirePermission),
              };
            },
          );
        },
      }),
      schema.query("documentProtection", {
        ...authQueries.documentProtection,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("documentProtection(@args)", args);
          return subgraph.#withPermissions(
            "documentProtection",
            async (service) =>
              resolvers.documentProtection(
                service,
                subgraph.authorizationService,
                await subgraph.#withCanonicalDocumentArgs(args, request),
                request.user?.address,
              ),
          );
        },
      }),
      schema.query("userDocumentPermissions", {
        ...authQueries.userDocumentPermissions,
        resolve: ({ subgraph, request }) => {
          subgraph.logger.debug("userDocumentPermissions");
          const address = request.user?.address;
          return subgraph.#withPermissions(
            "userDocumentPermissions",
            async (service) =>
              address
                ? (
                    await resolvers.userDocumentPermissions(service, address)
                  ).map(wirePermission)
                : [],
          );
        },
      }),
      schema.query("operationPermissions", {
        ...authQueries.operationPermissions,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("operationPermissions(@args)", args);
          return subgraph.#withPermissions(
            "operationPermissions",
            async (service) => {
              const permissions = await resolvers.operationPermissions(
                service,
                subgraph.authorizationService,
                await subgraph.#withCanonicalDocumentArgs(args, request),
                request.user?.address,
              );
              return {
                ...permissions,
                userPermissions: permissions.userPermissions.map(
                  wireOperationPermission,
                ),
              };
            },
          );
        },
      }),
      schema.query("canExecuteOperation", {
        ...authQueries.canExecuteOperation,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("canExecuteOperation(@args)", args);
          return subgraph.#logged("canExecuteOperation", async () =>
            resolvers.canExecuteOperation(
              subgraph.authorizationService,
              await subgraph.#withCanonicalDocumentArgs(args, request),
              request.user?.address,
            ),
          );
        },
      }),
      schema.mutation("setDocumentProtection", {
        ...authMutations.setDocumentProtection,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("setDocumentProtection(@args)", args);
          return subgraph.#withPermissions(
            "setDocumentProtection",
            async (service) =>
              resolvers.setDocumentProtection(
                service,
                subgraph.authorizationService,
                await subgraph.#withCanonicalDocumentArgs(args, request),
                request.user?.address,
              ),
          );
        },
      }),
      schema.mutation("transferDocumentOwnership", {
        ...authMutations.transferDocumentOwnership,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("transferDocumentOwnership(@args)", args);
          return subgraph.#withPermissions(
            "transferDocumentOwnership",
            async (service) =>
              resolvers.transferDocumentOwnership(
                service,
                subgraph.authorizationService,
                await subgraph.#withCanonicalDocumentArgs(args, request),
                request.user?.address,
              ),
          );
        },
      }),
      schema.mutation("grantDocumentPermission", {
        ...authMutations.grantDocumentPermission,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("grantDocumentPermission(@args)", args);
          return subgraph.#withPermissions(
            "grantDocumentPermission",
            async (service) =>
              wirePermission(
                await resolvers.grantDocumentPermission(
                  service,
                  subgraph.authorizationService,
                  await subgraph.#withCanonicalDocumentArgs(args, request),
                  request.user?.address,
                ),
              ),
          );
        },
      }),
      schema.mutation("revokeDocumentPermission", {
        ...authMutations.revokeDocumentPermission,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("revokeDocumentPermission(@args)", args);
          return subgraph.#withPermissions(
            "revokeDocumentPermission",
            async (service) =>
              resolvers.revokeDocumentPermission(
                service,
                subgraph.authorizationService,
                await subgraph.#withCanonicalDocumentArgs(args, request),
                request.user?.address,
              ),
          );
        },
      }),
      schema.mutation("grantOperationPermission", {
        ...authMutations.grantOperationPermission,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("grantOperationPermission(@args)", args);
          return subgraph.#withPermissions(
            "grantOperationPermission",
            async (service) =>
              wireOperationPermission(
                await resolvers.grantOperationPermission(
                  service,
                  subgraph.authorizationService,
                  await subgraph.#withCanonicalDocumentArgs(args, request),
                  request.user?.address,
                ),
              ),
          );
        },
      }),
      schema.mutation("revokeOperationPermission", {
        ...authMutations.revokeOperationPermission,
        resolve: ({ args, subgraph, request }) => {
          subgraph.logger.debug("revokeOperationPermission(@args)", args);
          return subgraph.#withPermissions(
            "revokeOperationPermission",
            async (service) =>
              resolvers.revokeOperationPermission(
                service,
                subgraph.authorizationService,
                await subgraph.#withCanonicalDocumentArgs(args, request),
                request.user?.address,
              ),
          );
        },
      }),
    ];
  }

  #withPermissions<T>(
    field: string,
    run: (service: DocumentPermissionService) => Promise<T>,
  ): Promise<T> {
    const service = this.documentPermissionService;
    if (!service) {
      throw new GraphQLError("DocumentPermissionService not available");
    }
    return this.#logged(field, () => run(service));
  }

  async #logged<T>(field: string, run: () => Promise<T>): Promise<T> {
    try {
      return await run();
    } catch (error) {
      this.logger.error(`Error in ${field}: @error`, error);
      throw error;
    }
  }

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

  override onSetup(): Promise<void> {
    this.logger.debug("Setting up AuthSubgraph");
    return Promise.resolve();
  }
}
