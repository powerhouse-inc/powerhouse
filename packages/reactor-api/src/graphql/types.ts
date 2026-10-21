import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type {
  IReactorClient,
  IRelationalDb,
  ISyncManager,
  SyncScopeGate,
} from "@powerhousedao/reactor";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type { DocumentDriveGlobalState } from "@powerhousedao/shared/document-drive";
import type { PHDocument } from "@powerhousedao/shared/document-model";
import type { IHttpScope } from "../http/index.js";
import type { IAttachmentClientProvider } from "../services/authorized-attachment.service.js";
import type { IncomingHttpHeaders } from "http";
import type { IAuthorizationService } from "../services/authorization.service.js";
import type { ICredentialInvalidator } from "../services/auth.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import type { BaseSubgraph } from "./base-subgraph.js";
import type { IReactorInspectionSource } from "./inspection/source.js";
import type { SUBGRAPH_PROTOCOL } from "./subgraph-protocol.js";

/** A subgraph class the host constructs. */
export type SubgraphClass = (new (args: SubgraphArgs) => BaseSubgraph) &
  Pick<
    typeof BaseSubgraph,
    "subgraphName" | "getSchema" | typeof SUBGRAPH_PROTOCOL
  >;

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
};

export type SubgraphArgs = {
  reactorClient: IReactorClient;
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
