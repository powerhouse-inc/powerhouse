import { type Db } from "#types.js";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { type IDocumentDriveServer } from "document-drive";
import { type DocumentNode } from "graphql";
import type { IncomingHttpHeaders } from "http";
import { type GraphQLManager } from "./graphql-manager.js";

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
  relationalDb: Db;
  onSetup?: () => Promise<void>;
};

export type SubgraphArgs = {
  reactor: IDocumentDriveServer;
  relationalDb: Db;
  analyticsStore: IAnalyticsStore;
  graphqlManager: GraphQLManager;
  path?: string;
};
