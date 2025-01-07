import type { IncomingHttpHeaders } from "http";
import { IDocumentDriveServer } from "document-drive";
import { DocumentNode } from "graphql";
import { SubgraphManager } from "./manager";
import { Db } from "src/types";
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";

export type Context = {
  driveServer: IDocumentDriveServer;
  driveId?: string;
  headers: IncomingHttpHeaders;
  db: unknown;
};

export type ISubgraph = {
  name: string;
  resolvers: Record<string, any>;
  typeDefs: DocumentNode;
  reactor: IDocumentDriveServer;
  operationalStore: Db;
  onSetup?: () => Promise<void>;
};

export type SubgraphArgs = {
  reactor: IDocumentDriveServer;
  operationalStore: Db;
  analyticsStore: IAnalyticsStore;
  subgraphManager: SubgraphManager;
};
