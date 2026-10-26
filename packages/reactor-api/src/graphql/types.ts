import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IReactorReadClient,
  IRelationalDb,
  ISyncManager,
  SyncScopeGate,
} from "@powerhousedao/reactor";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type { DocumentDriveGlobalState } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { DocumentNode } from "graphql";
import type { IHttpScope } from "../http/index.js";
import type { IAttachmentClientProvider } from "../services/authorized-attachment.service.js";
import type { IncomingHttpHeaders } from "http";
import type { IAuthorizationService } from "../services/authorization.service.js";
import type { ICredentialInvalidator } from "../services/auth.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import type { BaseSubgraph } from "./base-subgraph.js";
import type { IReactorInspectionSource } from "./inspection/source.js";
import type { RequestClients } from "./request-clients.js";

export type { RequestClients } from "./request-clients.js";

export type SubgraphClass = typeof BaseSubgraph;

export type Context = {
  driveId?: string;
  document?: PHDocument;
  headers: IncomingHttpHeaders;
  db: unknown;
  user?: {
    address: string;
    chainId: number;
    networkId: string;

    /** The did:key of the app instance that issued this request's token. */
    appKey: string;
  };
  /**
   * The reactor client halves this operation may use. `read` is always there;
   * `write` only while a mutation executes, and reading it anywhere else
   * throws an error naming the field.
   */
  clients: RequestClients;
};

export type ISubgraph = {
  name: string;
  /**
   * @deprecated The GraphQL manager mounts every subgraph under its own base
   * path and does not consult this field for routing, so the value a
   * subgraph holds (including one overwritten by a field initializer after
   * `super()`) has no effect on where it is mounted. Retained for source
   * compatibility.
   */
  path?: string;
  resolvers: Record<string, any>;
  typeDefs: DocumentNode;
  /** The read half, for setup-time lookups; resolvers read through `ctx.clients.read`. */
  readClient?: IReactorReadClient;
  /** @deprecated Resolvers use `ctx.clients`; setup-time code uses `readClient`. */
  reactorClient?: IReactorClient;
  relationalDb: IRelationalDb;
  /**
   * Query fields of this subgraph that read write-side state and so are handed
   * `ctx.clients.write` although they run in a query. Honoured for the host's
   * core subgraphs only.
   */
  writeSideQueries?: readonly string[];
  hasSubscriptions?: boolean;
  onSetup?: () => Promise<void>;
  onDisconnect?: () => Promise<void>;
};

export type SubgraphArgs = {
  /**
   * The read half, for setup-time lookups (schema building, model lookup).
   * Resolvers read through `ctx.clients.read` and write through
   * `ctx.clients.write`. Derived from `reactorClient` when absent.
   */
  readClient?: IReactorReadClient;
  /**
   * @deprecated The facade over both halves, kept for one release for
   * subgraphs that still call it. Use `readClient` and `ctx.clients`.
   */
  reactorClient?: IReactorClient;
  /**
   * The subgraph's package's slice of the HTTP surface, for serving REST
   * routes and webhooks alongside the GraphQL API. Already bound to the
   * package's namespace: there is no way to mount outside it.
   */
  http: IHttpScope;
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  graphqlManager: GraphQLManager;
  syncManager: ISyncManager;
  documentPermissionService?: DocumentPermissionService;
  authorizationService: IAuthorizationService;
  /**
   * Evaluates a document's own policy when serving sync. Absent below
   * `authEnforcement`, where there is no model to enforce and serving falls back
   * to the host's permission tables alone.
   */
  syncServingGate?: SyncScopeGate;
  /**
   * Attachments as the request's caller may use them. Bind per request with
   * `BaseSubgraph.attachmentsFor(ctx)`.
   */
  attachments?: IAttachmentClientProvider;
  /** Read only by `InspectionSubgraph`, registered only when this is set. */
  inspection?: IReactorInspectionSource;
  /**
   * Evicts the host's cached credential checks, e.g. from a package's
   * credential-revoke mutation, so a revoked credential is refused on the
   * next request rather than after the cache TTL. Read it through
   * `BaseSubgraph.credentials`, which is a no-op when the host passes none.
   */
  credentials?: ICredentialInvalidator;
  /**
   * The host's base path, injected by the GraphQL manager when it constructs
   * a subgraph. Subgraph code may read it, but routing ignores it: every
   * subgraph is mounted under the manager's own base path.
   */
  path?: string;
};

export type GqlSigner = {
  user: {
    address: string;
    networkId: string;
    chainId: number;
  };
  app: {
    name: string;
    key: string;
  };
  signatures: string[];
};

export type GqlOperationContext = {
  signer: GqlSigner | undefined;
};

export type GqlSignerUser = {
  address: string;
  networkId: string;
  chainId: number;
};

export type GqlSignerApp = {
  name: string;
  key: string;
};

export type GqlOperation = {
  id: string;
  type: string;
  index: number;
  timestampUtcMs: string;
  hash: string;
  skip: number;
  inputText: string;
  error: string | undefined;
  context: GqlOperationContext;
};

export type GqlDocument = {
  __typename?: string;
  id: string;
  name: string;
  documentType: string;
  revision: number;
  createdAtUtcIso: string;
  lastModifiedAtUtcIso: string;
  operations: GqlOperation[];
  stateJSON: JSON;
  state: unknown;
  initialState: unknown;
};

export type GqlDriveDocument = GqlDocument & {
  meta: {
    preferredEditor?: string;
  };
  slug: string;
  state: DocumentDriveGlobalState;
  initialState: DocumentDriveGlobalState;
};
