import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type {
  IProcessorHostModule,
  IProcessorManager,
  IRelationalDb,
  ProcessorFactory,
} from "document-drive";
import type { Express } from "express";
import type { IPackageManager } from "./packages/types.js";
export type { IPackageLoader } from "./packages/types.js";

export type API = {
  app: Express;
  graphqlManager: GraphQLManager;
  processorManager: IProcessorManager;
  packages: IPackageManager;
};

export type ReactorModule = {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDb;
};

export type Processor = ((module: IProcessorHostModule) => ProcessorFactory)[];
