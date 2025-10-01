import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

export class ProcessorModuleSubgraph extends BaseSubgraph {
  name = "processor-module";
  typeDefs = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
