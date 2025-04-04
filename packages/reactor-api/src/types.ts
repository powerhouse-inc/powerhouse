import { Express } from "express";
import { SubgraphManager } from "./graphql/manager.js";

export type { Db } from "./utils/db.js";

export type API = {
  app: Express;
  subgraphManager: SubgraphManager;
};
