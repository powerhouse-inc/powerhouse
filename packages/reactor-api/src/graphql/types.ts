import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IReactorClient } from "@powerhousedao/reactor";
import type { IDocumentDriveServer } from "document-drive";
import type { IRelationalDb } from "document-drive/processors/types";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type { IDocumentDriveServer, IRelationalDb } from "document-drive";
import type { DocumentNode } from "graphql";
import type { IncomingHttpHeaders } from "http";
import type { BaseSubgraph } from "./base-subgraph.js";

export type SubgraphClass = typeof BaseSubgraph;

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
  // For now, this sits side-by-side with the reactor. In the future, we will want to replace one with the other.
  reactorClient: IReactorClient;
  relationalDb: IRelationalDb;
  analyticsStore: IAnalyticsStore;
  graphqlManager: GraphQLManager;
  path?: string;
};
