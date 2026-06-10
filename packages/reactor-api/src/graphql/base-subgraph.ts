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
import type { IAuthorizationService } from "../services/authorization.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
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

  protected async canReadDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
    return this.authorizationService.canRead(documentId, ctx.user?.address);
  }

  protected async assertCanRead(
    documentId: string,
    ctx: Context,
  ): Promise<void> {
    const canRead = await this.authorizationService.canRead(
      documentId,
      ctx.user?.address,
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
    );
    if (!canMutate) {
      throw new GraphQLError(
        `Forbidden: insufficient permissions to execute operation "${operationType}" on this document`,
      );
    }
  }

  protected assertCanCreate(ctx: Context): void {
    if (this.authorizationService.canCreate(ctx.user?.address)) return;
    throw new GraphQLError(
      ctx.user?.address
        ? "Forbidden: insufficient permissions to create documents"
        : "Forbidden: authentication required to create documents",
    );
  }
}
