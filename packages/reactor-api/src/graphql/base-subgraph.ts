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
  AuthorizedDocumentHandle,
  type CanonicalDocumentId,
  type IAuthorizationService,
} from "../services/authorization.service.js";
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

  /**
   * Per-request memo of raw identifier to canonical document id, keyed on the
   * request context object so entries are released when the request ends. Lets
   * batch resolvers resolve each distinct identifier at most once.
   */
  readonly #canonicalIdMemo = new WeakMap<
    object,
    Map<string, CanonicalDocumentId>
  >();

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

  /**
   * Resolves a caller-supplied identifier (id or slug) to its canonical
   * document id, memoized per request. Both the decision layer and the data
   * layer must agree on the subject, so this runs the same resolveIdOrSlug
   * lookup the data path uses. A resolution failure (not found, ambiguous, or
   * transient) surfaces as a generic Forbidden, fail-closed, so a bad
   * identifier cannot be used as a document-existence oracle.
   */
  protected async resolveCanonicalDocumentId(
    identifier: string,
    requestKey: object,
  ): Promise<CanonicalDocumentId> {
    let cache = this.#canonicalIdMemo.get(requestKey);
    if (!cache) {
      cache = new Map<string, CanonicalDocumentId>();
      this.#canonicalIdMemo.set(requestKey, cache);
    }

    const cached = cache.get(identifier);
    if (cached !== undefined) return cached;

    let resolved: string;
    try {
      resolved = await this.reactorClient.resolveIdOrSlug(identifier);
    } catch {
      throw new GraphQLError("Forbidden: insufficient permissions");
    }

    const canonical = resolved as CanonicalDocumentId;
    cache.set(identifier, canonical);
    return canonical;
  }

  /**
   * Resolves the args' `documentId` to canonical form. Unconditional (unlike the
   * assertCan* helpers, no admin skip): ACL rows are keyed on the canonical id.
   */
  protected async withCanonicalDocumentId<T extends { documentId: string }>(
    args: T,
    requestKey: object,
  ): Promise<T & { documentId: CanonicalDocumentId }> {
    const documentId = await this.resolveCanonicalDocumentId(
      args.documentId,
      requestKey,
    );
    return { ...args, documentId };
  }

  /**
   * Resolves an identifier for a per-document check, or null when the caller has
   * policy-wide access (OPEN or supreme admin) and the check can be skipped.
   * Only DOCUMENT_PERMISSIONS keys on the document id, so other policies fail
   * closed without resolving.
   */
  async #resolveForCheck(
    identifier: string,
    ctx: Context,
  ): Promise<CanonicalDocumentId | null> {
    if (this.authorizationService.isSupremeAdmin(ctx.user?.address)) {
      return null;
    }
    if (
      this.authorizationService.config.policy !==
      AuthorizationPolicy.DOCUMENT_PERMISSIONS
    ) {
      throw new GraphQLError("Forbidden: insufficient permissions");
    }
    return this.resolveCanonicalDocumentId(identifier, ctx);
  }

  /**
   * Read filter for an already-canonical document id (one sourced from the data
   * layer, such as a fetched document's id). Performs no slug resolution.
   */
  protected async canReadDocument(
    documentId: CanonicalDocumentId,
    ctx: Context,
  ): Promise<boolean> {
    return this.authorizationService.canRead(documentId, ctx.user?.address);
  }

  /**
   * Asserts read access, resolving a slug first. Returns a handle whose
   * `fetchIdentifier` the caller reuses for the data fetch; a denial throws.
   */
  protected async assertCanRead(
    identifier: string,
    ctx: Context,
  ): Promise<AuthorizedDocumentHandle> {
    const documentId = await this.#resolveForCheck(identifier, ctx);
    if (documentId === null) return AuthorizedDocumentHandle.skipped(identifier);
    await this.assertCanReadCanonical(documentId, ctx);
    return AuthorizedDocumentHandle.resolved(documentId);
  }

  protected async assertCanWrite(
    identifier: string,
    ctx: Context,
  ): Promise<AuthorizedDocumentHandle> {
    const documentId = await this.#resolveForCheck(identifier, ctx);
    if (documentId === null) return AuthorizedDocumentHandle.skipped(identifier);
    await this.assertCanWriteCanonical(documentId, ctx);
    return AuthorizedDocumentHandle.resolved(documentId);
  }

  protected async assertCanExecuteOperation(
    identifier: string,
    operationType: string,
    ctx: Context,
  ): Promise<AuthorizedDocumentHandle> {
    const documentId = await this.#resolveForCheck(identifier, ctx);
    if (documentId === null) return AuthorizedDocumentHandle.skipped(identifier);
    await this.assertCanExecuteOperationCanonical(
      documentId,
      operationType,
      ctx,
    );
    return AuthorizedDocumentHandle.resolved(documentId);
  }

  /**
   * Read assertion for an already-canonical document id. No slug resolution;
   * use only with ids sourced from the data layer or already resolved.
   */
  protected async assertCanReadCanonical(
    documentId: CanonicalDocumentId,
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

  protected async assertCanWriteCanonical(
    documentId: CanonicalDocumentId,
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

  protected async assertCanExecuteOperationCanonical(
    documentId: CanonicalDocumentId,
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
