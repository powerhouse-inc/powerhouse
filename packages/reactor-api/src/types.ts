import { IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import { IProcessorManager } from "document-drive/processors/types";
import { type Express } from "express";
import { type GraphQLManager } from "./graphql/graphql-manager.js";
import { IPackagesManager } from "./packages/types.js";
import { Db } from "./utils/db.js";
export type { Db } from "./utils/db.js";

export type API = {
  app: Express;
  graphqlManager: GraphQLManager;
  processorManager: IProcessorManager;
  packages: IPackagesManager;
};

export type ReactorModule = {
  analyticsStore: IAnalyticsStore;
  operationalStore: Db;
};
