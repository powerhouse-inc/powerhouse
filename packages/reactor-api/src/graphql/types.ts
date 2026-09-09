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
import type { DocumentNode } from "graphql";
import type { IHttpScope } from "../http/index.js";
import type { IncomingHttpHeaders } from "http";
import type { IAuthorizationService } from "../services/authorization.service.js";
import type { DocumentPermissionService } from "../services/document-permission.service.js";
import type { BaseSubgraph } from "./base-subgraph.js";

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
  reactorClient: IReactorClient;
  relationalDb: IRelationalDb;
  hasSubscriptions?: boolean;
  onSetup?: () => Promise<void>;
  onDisconnect?: () => Promise<void>;
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
