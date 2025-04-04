import { type Db } from "#types.js";
import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { type IDocumentDriveServer } from "document-drive";
import { type DocumentNode } from "graphql";
import type { IncomingHttpHeaders } from "http";
import { type SubgraphManager } from "./manager.js";

export type Context = {
  driveServer: IDocumentDriveServer;
  driveId?: string;
  headers: IncomingHttpHeaders;
  db: unknown;
};

export type ISubgraph = {
  name: string;
  path?: string;
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
  path?: string;
};
