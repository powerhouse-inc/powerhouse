import { type Express } from "express";
import { type GraphQLManager } from "./graphql/graphql-manager.js";

export type { Db } from "./utils/db.js";

export type API = {
  app: Express;
  graphqlManager: GraphQLManager;
};
