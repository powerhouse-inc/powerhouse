import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IReactorClient } from "@powerhousedao/reactor";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type {
  DocumentDriveGlobalState,
  IDocumentDriveServer,
  IRelationalDb,
} from "document-drive";
import type { PHDocument } from "document-model";
import type { DocumentNode } from "graphql";
import type { IncomingHttpHeaders } from "http";
import type { BaseSubgraph } from "./base-subgraph.js";

export type SubgraphClass = typeof BaseSubgraph;

export type Context = {
  driveServer: IDocumentDriveServer;
  driveId?: string;
  document?: PHDocument;
  headers: IncomingHttpHeaders;
  db: unknown;
  isGuest?: (address: string) => boolean;
  isUser?: (address: string) => boolean;
  isAdmin?: (address: string) => boolean;
  user?: {
    address: string;
    chainId: number;
    networkId: string;
  };
};

export type ISubgraph = {
  name: string;
  path?: string;
  resolvers: Record<string, any>;
  typeDefs: DocumentNode;
  reactor: IDocumentDriveServer;
  relationalDb: IRelationalDb;
  onSetup?: () => Promise<void>;
};

export type SubgraphArgs = {
  reactor: IDocumentDriveServer;
  // For now, this sits side-by-side with the reactor. In the future, we will want to replace one with the other.
  reactorClient: IReactorClient;
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  graphqlManager: GraphQLManager;
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
