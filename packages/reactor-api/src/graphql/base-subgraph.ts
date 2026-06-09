import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
} from "@powerhousedao/reactor";
import type {
  GraphQLManager,
  ISubgraph,
  SubgraphArgs,
} from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { GraphQLError } from "graphql";
import { gql } from "graphql-tag";
import {
  AuthorizationPolicy,
  type IAuthorizationService,
} from "../services/authorization.service.js";
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
  relationalDb: IRelationalDb;
  syncManager: ISyncManager;
  documentPermissionService?: DocumentPermissionService;
  authorizationService: IAuthorizationService;

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
        const result = await this.reactorClient.getIncomingRelationships(
          documentId,
          "child",
        );
        return result.results.map((doc) => doc.header.id);
      } catch {
        return [];
      }
    };
  }

  protected async canReadDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    return this.authorizationService.canRead(
      documentId,
      ctx.user?.address,
      this.getParentIdsFn(),
    );
  }

  protected async assertCanRead(
    documentId: string,
    ctx: Context,
  ): Promise<void> {
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
  }

  protected async assertCanWrite(
    documentId: string,
    ctx: Context,
  ): Promise<void> {
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
  }

  protected async assertCanExecuteOperation(
    documentId: string,
    operationType: string,
    ctx: Context,
  ): Promise<void> {
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
  }

  protected assertCanCreate(ctx: Context): void {
    const policy = this.authorizationService.config.policy;
    if (policy === AuthorizationPolicy.OPEN) return;
    if (this.authorizationService.isSupremeAdmin(ctx.user?.address)) return;
    if (policy === AuthorizationPolicy.ADMIN_ONLY) {
      throw new GraphQLError(
        "Forbidden: insufficient permissions to create documents",
      );
    }
    if (!ctx.user?.address) {
      throw new GraphQLError(
        "Forbidden: authentication required to create documents",
      );
    }
  }
}
