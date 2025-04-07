import { IProcessorManager } from "#processor-manager.js";
import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IReceiver, ListenerFilter } from "document-drive";
import { type Express } from "express";
import { type GraphQLManager } from "./graphql/graphql-manager.js";
import { Db } from "./utils/db.js";

export type { Db } from "./utils/db.js";

export type API = {
  app: Express;
  graphqlManager: GraphQLManager;
  processorManager: IProcessorManager;
};

export interface IProcessor extends IReceiver {
  //
}

export type ProcessorRecord = {
  processor: IProcessor;
  filter: ListenerFilter;
};

export type ReactorModule = {
  analyticsStore: IAnalyticsStore;
  operationalStore: Db;
};

export type ProcessorFactory = (
  driveId: string,
  module: ReactorModule,
) => ProcessorRecord[];
