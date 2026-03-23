import type { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import type { GraphQLManager } from "@powerhousedao/reactor-api";
import type {
  IProcessorHostModule,
  ProcessorRecord,
} from "@powerhousedao/shared/processors";
import type { PHDocumentHeader } from "@powerhousedao/shared/document-model";
import type {
  IProcessorHostModuleLegacy,
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
  packages: IPackageManager;
};

export type ReactorModule = {
  analyticsStore: IAnalyticsStore;
  relationalDb: IRelationalDbLegacy;
};

export type ProcessorFactoryBuilderLegacy = (
  module: IProcessorHostModuleLegacy,
) => ProcessorFactoryLegacy;

export type ProcessorFactoryBuilder = (
  module: IProcessorHostModule,
) => (
  driveHeader: PHDocumentHeader,
) => ProcessorRecord[] | Promise<ProcessorRecord[]>;

export type Processor = (
  | ProcessorFactoryBuilderLegacy
  | ProcessorFactoryBuilder
)[];
