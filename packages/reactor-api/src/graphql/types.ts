import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { IDocumentDriveServer } from "document-drive";
import type { IRelationalDb } from "document-drive/processors/types";
import type { DocumentNode } from "graphql";
import type { IncomingHttpHeaders } from "http";
import type { GraphQLManager } from "./graphql-manager.js";

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
