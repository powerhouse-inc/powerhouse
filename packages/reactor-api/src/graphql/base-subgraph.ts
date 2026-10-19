import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
  SyncScopeGate,
  ViewFilter,
} from "@powerhousedao/reactor";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type { GraphQLManager, SubgraphArgs } from "@powerhousedao/reactor-api";
import { ForbiddenError, AuthenticationRequiredError } from "./errors.js";
import {
  AuthorizationPolicy,
  AuthorizedDocumentHandle,
  type CanonicalDocumentId,
  type IAuthorizationService,
} from "../services/authorization.service.js";
import {
  createCanonicalDocumentIdResolver,
  type CanonicalDocumentIdResolver,
} from "../services/canonical-document-id.js";
import type { IAttachmentClientProvider } from "../services/authorized-attachment.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import {
  createCredentialInvalidator,
  type ICredentialInvalidator,
} from "../services/auth.service.js";
import { seedLegacyPath, type LegacySubgraphArgs } from "./legacy-subgraph.js";
import {
  SUBGRAPH_PROTOCOL,
  subgraphProtocolOf,
  type SubgraphProtocol,
} from "./subgraph-protocol.js";
import type {
  requestType,
  SchemaBuilder,
  SubgraphSchema,
} from "./subgraph-schema.js";
import type { Context } from "./types.js";

/**
 * The subject a request reads as: its address and the app key its token
 * carries. Anonymous is an empty subject, never the host's signer.
 */
export function callerSubject(user: Context["user"]): AuthSubject {
  return { address: user?.address, key: user?.appKey };
}

/**
 * A GraphQL subgraph. A concrete class declares its route segment and its
 * schema as statics:
 *
 * ```ts
 * class InvoicesSubgraph extends BaseSubgraph<ShopContext> {
 *   static override readonly subgraphName = "invoices";
 *   static override getSchema(schema: SchemaBuilder<InvoicesSubgraph>) {
 *     return [schema.query("invoice", { returns, resolve })];
 *   }
 * }
 * ```
 *
 * The host compiles each class once, constructs it, awaits `onSetup`, and
 * then binds the schema to the instance. Resolvers reach the instance as
 * `subgraph`, never through `this`.
 */
export class BaseSubgraph<TRequest extends Context = Context> {
  /**
   * The route segment and manifest id: lowercase kebab-case. Declared by
   * concrete classes only; a shared base leaves it undeclared.
   */
  declare static readonly subgraphName: string | undefined;

  /**
   * The schema: typed entries, or one `schema.graphql(...)` result. Runs once
   * per class with the class as receiver, and must be deterministic. Extend a
   * parent's with `[...super.getSchema(schema), ...]`.
   */
  static getSchema(_schema: SchemaBuilder<BaseSubgraph>): SubgraphSchema {
    return [];
  }

  static [SUBGRAPH_PROTOCOL](): SubgraphProtocol {
    return subgraphProtocolOf(this);
  }

  declare readonly [requestType]?: TRequest;

  declare readonly name?: never;
  declare readonly typeDefs?: never;
  declare readonly resolvers?: never;
  declare readonly hasSubscriptions?: never;
  declare readonly path?: never;

  reactorClient: IReactorClient;
  /** This package's namespaced slice of the HTTP surface. */
  readonly http: SubgraphArgs["http"];
  graphqlManager: GraphQLManager;
  relationalDb: IRelationalDb;
  syncManager: ISyncManager;
  documentPermissionService?: DocumentPermissionService;
  authorizationService: IAuthorizationService;
  syncServingGate?: SyncScopeGate;
  /**
   * The host's credential cache, for a package that revokes credentials:
   * call `this.credentials.invalidateCredential(address, chainId?, appDid?)`
   * right after the revocation is stored, so this host refuses the credential
   * on the next request and closes WebSocket connections that rely on it.
   * A no-op on a host without authentication.
   */
  readonly credentials: ICredentialInvalidator;

  /**
   * Per-request memo of raw identifier to canonical document id, keyed on the
   * request context object so entries are released when the request ends. Lets
   * batch resolvers resolve each distinct identifier at most once.
   */
  readonly #canonicalIdMemo = new WeakMap<
    object,
    Map<string, CanonicalDocumentId>
  >();

  readonly #resolveCanonical: CanonicalDocumentIdResolver;

  readonly #attachments?: IAttachmentClientProvider;

  readonly #attachmentClientMemo = new WeakMap<object, IAttachmentClient>();

  constructor(args: SubgraphArgs) {
    this.#resolveCanonical = createCanonicalDocumentIdResolver(
      args.reactorClient,
    );
    this.http = args.http;
    this.reactorClient = args.reactorClient;
    this.graphqlManager = args.graphqlManager;
    this.relationalDb = args.relationalDb;
    this.syncManager = args.syncManager;
    this.documentPermissionService = args.documentPermissionService;
    this.authorizationService = args.authorizationService;
    this.syncServingGate = args.syncServingGate;
    this.#attachments = args.attachments;
    this.credentials =
      args.credentials ?? createCredentialInvalidator(undefined);
    seedLegacyPath(this, new.target, (args as LegacySubgraphArgs).path);
  }

  get subgraphName(): string {
    return (this.constructor as typeof BaseSubgraph)
      [SUBGRAPH_PROTOCOL]()
      .describe().subgraphName;
  }

  /**
   * An attachment client bound to this request's caller, memoized per request.
   *
   * @throws Error when the host provides no attachment client to subgraphs.
   */
  attachmentsFor(ctx: Context): IAttachmentClient {
    if (!this.#attachments) {
      throw new Error("This host provides no attachment client to subgraphs");
    }
    let client = this.#attachmentClientMemo.get(ctx);
    if (!client) {
      client = this.#attachments.forSubject(callerSubject(ctx.user));
      this.#attachmentClientMemo.set(ctx, client);
    }
    return client;
  }

  async onSetup() {
    // noop
  }

  async onDisconnect(): Promise<void> {
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
  async resolveCanonicalDocumentId(
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

    let canonical: CanonicalDocumentId;
    try {
      canonical = await this.#resolveCanonical(identifier);
    } catch {
      throw new ForbiddenError();
    }

    cache.set(identifier, canonical);
    return canonical;
  }

  /**
   * Resolves the args' `documentId` to canonical form. Unconditional (unlike the
   * assertCan* helpers, no admin skip): ACL rows are keyed on the canonical id.
   */
  async withCanonicalDocumentId<T extends { documentId: string }>(
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
      throw new ForbiddenError();
    }
    return this.resolveCanonicalDocumentId(identifier, ctx);
  }

  /**
   * Read filter for an already-canonical document id (one sourced from the data
   * layer, such as a fetched document's id). Performs no slug resolution.
   */
  async canReadDocument(
    documentId: CanonicalDocumentId,
    ctx: Context,
  ): Promise<boolean> {
    return this.authorizationService.canRead(documentId, ctx.user?.address);
  }

  /** Drops the items the host's own ACL refuses the caller. */
  async readableByHost<T extends { id: string }>(
    items: readonly T[],
    ctx: Context,
  ): Promise<T[]> {
    if (this.authorizationService.isSupremeAdmin(ctx.user?.address)) {
      return [...items];
    }
    const readable: T[] = [];
    for (const item of items) {
      if (await this.canReadDocument(item.id as CanonicalDocumentId, ctx)) {
        readable.push(item);
      }
    }
    return readable;
  }

  /**
   * The principal a request decides as: the authenticated caller's address, and
   * the did:key of the app instance whose token authenticated it.
   *
   * Both, because a policy can name either. The key is what a document records
   * as its creator, so a subject built without one cannot match the creator's
   * standing permission over the auth scope -- the document's own creator would
   * be refused an operation the write path accepts, since a signed action
   * carries the same key. Anonymous callers supply neither.
   */
  viewSubject(ctx: Context): AuthSubject {
    return callerSubject(ctx.user);
  }

  /** Whether a listing would serve the document to the caller; fails closed. */
  async servesDocument(documentId: string, ctx: Context): Promise<boolean> {
    if (!documentId) {
      return false;
    }
    try {
      return await this.servesDocumentOrThrows(documentId, ctx);
    } catch {
      return false;
    }
  }

  /** {@link servesDocument}, but a reactor that cannot answer throws. */
  servesDocumentOrThrows(
    identifier: string,
    ctx: Context,
    view?: Pick<ViewFilter, "branch" | "scopes">,
  ): Promise<boolean> {
    return this.reactorClient.isServed(identifier, {
      ...view,
      subject: this.viewSubject(ctx),
    });
  }

  /**
   * Whether a listing would serve the document to the caller: the reactor read
   * gate, then the host's legacy layer, as `findDocuments` applies them. Absent
   * or withheld is `false`; a failure to decide throws.
   */
  async listsDocument(
    identifier: string,
    ctx: Context,
    view?: Pick<ViewFilter, "branch" | "scopes">,
  ): Promise<boolean> {
    if (!(await this.servesDocumentOrThrows(identifier, ctx, view))) {
      return false;
    }
    if (this.authorizationService.isSupremeAdmin(ctx.user?.address)) {
      return true;
    }
    return this.canReadDocument(
      await this.resolveCanonicalDocumentId(identifier, ctx),
      ctx,
    );
  }

  /**
   * Asserts read access, resolving a slug first. Returns a handle whose
   * `fetchIdentifier` the caller reuses for the data fetch; a denial throws.
   */
  async assertCanRead(
    identifier: string,
    ctx: Context,
  ): Promise<AuthorizedDocumentHandle> {
    const documentId = await this.#resolveForCheck(identifier, ctx);
    if (documentId === null)
      return AuthorizedDocumentHandle.skipped(identifier);
    await this.assertCanReadCanonical(documentId, ctx);
    return AuthorizedDocumentHandle.resolved(documentId);
  }

  async assertCanWrite(
    identifier: string,
    ctx: Context,
  ): Promise<AuthorizedDocumentHandle> {
    const documentId = await this.#resolveForCheck(identifier, ctx);
    if (documentId === null)
      return AuthorizedDocumentHandle.skipped(identifier);
    await this.assertCanWriteCanonical(documentId, ctx);
    return AuthorizedDocumentHandle.resolved(documentId);
  }

  async assertCanExecuteOperation(
    identifier: string,
    operationType: string,
    ctx: Context,
  ): Promise<AuthorizedDocumentHandle> {
    const documentId = await this.#resolveForCheck(identifier, ctx);
    if (documentId === null)
      return AuthorizedDocumentHandle.skipped(identifier);
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
  async assertCanReadCanonical(
    documentId: CanonicalDocumentId,
    ctx: Context,
  ): Promise<void> {
    const canRead = await this.authorizationService.canRead(
      documentId,
      ctx.user?.address,
    );
    if (!canRead) {
      throw new ForbiddenError("to read this document");
    }
  }

  async assertCanWriteCanonical(
    documentId: CanonicalDocumentId,
    ctx: Context,
  ): Promise<void> {
    const canWrite = await this.authorizationService.canWrite(
      documentId,
      ctx.user?.address,
    );
    if (!canWrite) {
      throw new ForbiddenError("to write to this document");
    }
  }

  async assertCanExecuteOperationCanonical(
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
      throw new ForbiddenError(
        `to execute operation "${operationType}" on this document`,
      );
    }
  }

  assertCanCreate(ctx: Context): void {
    if (this.authorizationService.canCreate(ctx.user?.address)) return;
    if (ctx.user?.address) {
      throw new ForbiddenError("to create documents");
    }
    throw new AuthenticationRequiredError("to create documents");
  }
}
