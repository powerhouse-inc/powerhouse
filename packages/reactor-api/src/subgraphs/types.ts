import type { IncomingHttpHeaders } from "http";
import { IDocumentDriveServer } from "document-drive";
import { DocumentNode } from "graphql";
import { Knex } from "knex";
import { SubgraphManager } from "./manager";

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
  operationalStore: Knex;
  onSetup?: () => Promise<void>;
};

export type SubgraphArgs = {
  reactor: IDocumentDriveServer;
  operationalStore: Knex;
  subgraphManager: SubgraphManager;
};
