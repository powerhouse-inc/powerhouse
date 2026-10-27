import type {
  IReactorClient,
  IReactorReadClient,
  IRelationalDb,
  ISyncManager,
  SyncScopeGate,
  ViewFilter,
} from "@powerhousedao/reactor";
import type { IAttachmentClient } from "@powerhousedao/reactor-attachments/client";
import type { AuthSubject } from "@powerhousedao/shared/document-model";
import type {
  GraphQLManager,
  ISubgraph,
  SubgraphArgs,
} from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { ForbiddenError, AuthenticationRequiredError } from "./errors.js";
import { gql } from "graphql-tag";
import {
  AuthorizationPolicy,
  AuthorizedDocumentHandle,
  type CanonicalDocumentId,
  type IAuthorizationService,
} from "../services/authorization.service.js";
import { createCanonicalDocumentIdResolver } from "../services/canonical-document-id.js";
import type { IAttachmentClientProvider } from "../services/authorized-attachment.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import {
  createCredentialInvalidator,
  type ICredentialInvalidator,
} from "../services/auth.service.js";
import {
  operationOfClients,
  readOnlyClients,
  type RequestClients,
} from "./request-clients.js";
import type { Context } from "./types.js";

/**
 * Stands in for a client the subgraph was not given: any use names what to
 * use instead rather than failing on `undefined`.
 */
function missingClient<TClient extends object>(
  name: string,
  hint: string,
): TClient {
  return new Proxy({} as TClient, {
    get(_target, property) {
      if (property === "then" || typeof property === "symbol") {
        return undefined;
      }
      throw new Error(`${name}.${String(property)}: ${hint}`);
    },
  });
}

/**
 * The subject a request reads as: its address and the app key its token
 * carries. Anonymous is an empty subject, never the host's signer.
 */
export function callerSubject(user: Context["user"]): AuthSubject {
  return { address: user?.address, key: user?.appKey };
}

export class BaseSubgraph implements ISubgraph {
  name = "example";
  // The host's base path as injected by the GraphQL manager. Routing
  // ignores it: the manager mounts every subgraph under its own base path.
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
  /**
   * The read half, for setup-time use (schema building, model lookup).
   * Resolvers read through `ctx.clients.read` instead.
   */
  readonly readClient: IReactorReadClient;
  /**
   * @deprecated The facade over both halves, for subgraphs that have not
   * moved. Resolvers use `ctx.clients.read` and, in a mutation,
   * `ctx.clients.write`; setup-time code uses {@link readClient}.
   */
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

  readonly #unboundClients: RequestClients;

  readonly #attachments?: IAttachmentClientProvider;

  readonly #attachmentClientMemo = new WeakMap<object, IAttachmentClient>();

  constructor(args: SubgraphArgs) {
    // A facade without halves (an older implementation, a mock) is itself a
    // read client.
    const facadeRead = args.reactorClient?.read as
      | Partial<IReactorReadClient>
      | undefined;
    this.readClient =
      args.readClient ??
      (typeof facadeRead?.get === "function"
        ? (facadeRead as IReactorReadClient)
        : args.reactorClient) ??
      missingClient<IReactorReadClient>(
        "BaseSubgraph.readClient",
        "this subgraph was constructed without a readClient.",
      );
    this.reactorClient =
      args.reactorClient ??
      missingClient<IReactorClient>(
        "BaseSubgraph.reactorClient",
        "this host passes no reactorClient facade. Read through ctx.clients.read (or this.readClient at setup) and write through ctx.clients.write in a mutation.",
      );
    this.#unboundClients = readOnlyClients(this.readClient);
    this.http = args.http;
    this.graphqlManager = args.graphqlManager;
    this.relationalDb = args.relationalDb;
    this.syncManager = args.syncManager;
    this.documentPermissionService = args.documentPermissionService;
    this.authorizationService = args.authorizationService;
    this.syncServingGate = args.syncServingGate;
    this.path = args.path ?? "";
    this.#attachments = args.attachments;
    this.credentials =
      args.credentials ?? createCredentialInvalidator(undefined);
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

  /**
   * The clients this request's operation may use: those the GraphQL layer put
   * on the context. A context it never saw (a resolver called directly) reads
   * through {@link readClient} and may not write.
   */
  clientsOf(ctx: Context | undefined): RequestClients {
    return ctx?.clients ?? this.#unboundClients;
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
   * layer must agree on the subject, so this runs the lookup the data path
   * uses: `resolveIdOrSlug` on the read half for a query, `describe` on the
   * write half for a mutation. A resolution failure (not found, ambiguous, or
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

    const clients = this.clientsOf(requestKey as Context);
    const resolve =
      operationOfClients(clients) === "mutation"
        ? createCanonicalDocumentIdResolver(
            { read: clients.read, write: clients.write },
            "mutation",
          )
        : createCanonicalDocumentIdResolver({ read: clients.read }, "query");
    let canonical: CanonicalDocumentId;
    try {
      canonical = await resolve(identifier);
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

  /** The ids or slugs in `ids` that {@link assertCanRead} admits, in order; the rest are dropped. */
  async filterReadableDocumentIds(
    ids: readonly string[],
    ctx: Context,
  ): Promise<string[]> {
    const readable: string[] = [];
    for (const id of ids) {
      try {
        await this.assertCanRead(id, ctx);
      } catch (error) {
        if (error instanceof ForbiddenError) {
          continue;
        }
        throw error;
      }
      readable.push(id);
    }
    return readable;
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
  protected viewSubject(ctx: Context): AuthSubject {
    return callerSubject(ctx.user);
  }

  /** Whether a listing would serve the document to the caller; fails closed. */
  protected async servesDocument(
    documentId: string,
    ctx: Context,
  ): Promise<boolean> {
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
  protected servesDocumentOrThrows(
    identifier: string,
    ctx: Context,
    view?: Pick<ViewFilter, "branch" | "scopes">,
  ): Promise<boolean> {
    return this.clientsOf(ctx).read.isServed(identifier, {
      ...view,
      subject: this.viewSubject(ctx),
    });
  }

  /**
   * Whether a listing would serve the document to the caller: the reactor read
   * gate, then the host's legacy layer, as `findDocuments` applies them. Absent
   * or withheld is `false`; a failure to decide throws.
   */
  protected async listsDocument(
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
