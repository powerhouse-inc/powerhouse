import type { IncomingHttpHeaders } from "http";
import { IDocumentDriveServer } from "document-drive";
import { DocumentNode } from "graphql";
import { SubgraphManager } from "./manager";
import { Db } from "src/types";

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
  subgraphManager: SubgraphManager;
};
