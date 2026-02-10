import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type {
  IProcessorHostModuleLegacy,
  IProcessorManagerLegacy,
  IRelationalDbLegacy,
  ProcessorFactoryLegacy,
} from "document-drive";
import type { Express } from "express";
import type { IPackageManager } from "./packages/types.js";
export type {
  IPackageLoader,
  IPackageLoaderOptions,
} from "./packages/types.js";

export type API = {
  app: Express;
  graphqlManager: GraphQLManager;
  processorManager: IProcessorManagerLegacy;
  packages: IPackageManager;
};

export type ReactorModule = {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDbLegacy;
};

export type Processor = ((
  module: IProcessorHostModuleLegacy,
) => ProcessorFactoryLegacy)[];
