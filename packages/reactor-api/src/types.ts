import { type IAnalyticsStore } from "@powerhousedao/analytics-engine-core";
import {
  type IProcessorManager,
  type IRelationalDb,
} from "document-drive/processors/types";
import { type Express } from "express";
import { type GraphQLManager } from "./graphql/graphql-manager.js";
import { type IPackageManager } from "./packages/types.js";

export type { SubgraphClass } from "./graphql/index.js";
export type { IPackageLoader } from "./packages/types.js";
export type { Db } from "./utils/db.js";

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
