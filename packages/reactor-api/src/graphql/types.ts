import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { GraphQLManager, Subgraph } from "@powerhousedao/reactor-api";
import type { IDocumentDriveServer, IRelationalDb } from "document-drive";
import type { DocumentNode } from "graphql";
import type { IncomingHttpHeaders } from "http";

export type SubgraphClass = typeof Subgraph;

export type Context = {
  driveServer: IDocumentDriveServer;
  driveId?: string;
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
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  graphqlManager: GraphQLManager;
  path?: string;
};
