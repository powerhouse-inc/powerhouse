import { Express } from "express";
import { SubgraphManager } from "./subgraphs/manager.js";

export type { Db } from "./utils/db.js";

export type API = {
  app: Express;
  subgraphManager: SubgraphManager;
};
