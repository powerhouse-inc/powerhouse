import type { IReactorClient, ISyncManager } from "@powerhousedao/reactor";
import type {
  GraphQLManager,
  ISubgraph,
  SubgraphArgs,
} from "@powerhousedao/reactor-api";
import type { IRelationalDbLegacy } from "document-drive";
import type { DocumentNode } from "graphql";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import type { AuthorizationService } from "../services/authorization.service.js";
import type {
  DocumentPermissionService,
  GetParentIdsFn,
} from "../services/document-permission.service.js";
import type { Context } from "./types.js";

export class BaseSubgraph implements ISubgraph {
  name = "example";
  path = "";
  resolvers: Record<string, any> = {
    Query: {
      hello: () => this.name,
    },
  };
  typeDefs: DocumentNode = gql`
    type Query {
      hello: String
    }
  `;
  reactorClient: IReactorClient;
  graphqlManager: GraphQLManager;
  relationalDb: IRelationalDbLegacy;
  syncManager: ISyncManager;
  documentPermissionService?: DocumentPermissionService;
  authorizationService?: AuthorizationService;

  constructor(args: SubgraphArgs) {
    this.reactorClient = args.reactorClient;
    this.graphqlManager = args.graphqlManager;
    this.relationalDb = args.relationalDb;
    this.syncManager = args.syncManager;
    this.documentPermissionService = args.documentPermissionService;
    this.authorizationService = args.authorizationService;
    this.path = args.path ?? "";
  }

  async onSetup() {
    // noop
  }

  // ============================================
  // Shared permission helpers
  // ============================================

  protected getParentIdsFn(): GetParentIdsFn {
    return async (documentId: string): Promise<string[]> => {
      try {
        const result = await this.reactorClient.getParents(documentId);
        return result.results.map((doc) => doc.header.id);
      } catch {
        return [];
      }
    };
  }

  protected hasGlobalAdminAccess(ctx: Context): boolean {
    return !!ctx.isAdmin?.(ctx.user?.address ?? "");
  }

  protected async canReadDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    if (this.authorizationService) {
      return this.authorizationService.canRead(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
    }
    if (this.hasGlobalAdminAccess(ctx)) return true;
    if (this.documentPermissionService) {
      return this.documentPermissionService.canRead(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
    }
    return false;
  }

  protected async assertCanRead(
    documentId: string,
    ctx: Context,
  ): Promise<void> {
    if (this.authorizationService) {
      const canRead = await this.authorizationService.canRead(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
      if (!canRead) {
        throw new GraphQLError(
          "Forbidden: insufficient permissions to read this document",
        );
      }
      return;
    }
    // Legacy fallback
    if (!this.hasGlobalAdminAccess(ctx)) {
      if (this.documentPermissionService) {
        const canRead = await this.documentPermissionService.canRead(
          documentId,
          ctx.user?.address,
          this.getParentIdsFn(),
        );
        if (!canRead) {
          throw new GraphQLError(
            "Forbidden: insufficient permissions to read this document",
          );
        }
      } else {
        throw new GraphQLError(
          "Forbidden: insufficient permissions to read this document",
        );
      }
    }
  }

  protected async assertCanWrite(
    documentId: string,
    ctx: Context,
  ): Promise<void> {
    if (this.authorizationService) {
      const canWrite = await this.authorizationService.canWrite(
        documentId,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
      if (!canWrite) {
        throw new GraphQLError(
          "Forbidden: insufficient permissions to write to this document",
        );
      }
      return;
    }
    // Legacy fallback
    if (!this.hasGlobalAdminAccess(ctx)) {
      if (this.documentPermissionService) {
        const canWrite = await this.documentPermissionService.canWrite(
          documentId,
          ctx.user?.address,
          this.getParentIdsFn(),
        );
        if (!canWrite) {
          throw new GraphQLError(
            "Forbidden: insufficient permissions to write to this document",
          );
        }
      } else {
        throw new GraphQLError(
          "Forbidden: insufficient permissions to write to this document",
        );
      }
    }
  }

  protected async assertCanExecuteOperation(
    documentId: string,
    operationType: string,
    ctx: Context,
  ): Promise<void> {
    if (this.authorizationService) {
      const canMutate = await this.authorizationService.canMutate(
        documentId,
        operationType,
        ctx.user?.address,
        this.getParentIdsFn(),
      );
      if (!canMutate) {
        throw new GraphQLError(
          `Forbidden: insufficient permissions to execute operation "${operationType}" on this document`,
        );
      }
      return;
    }
    // Legacy fallback
    if (!this.documentPermissionService) return;
    if (ctx.isAdmin?.(ctx.user?.address ?? "")) return;
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
}
