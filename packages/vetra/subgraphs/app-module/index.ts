import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

export class AppModuleSubgraph extends BaseSubgraph {
  name = "app-module";
  typeDefs = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
