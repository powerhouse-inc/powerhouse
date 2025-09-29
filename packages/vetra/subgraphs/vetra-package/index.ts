import { BaseSubgraph } from "@powerhousedao/reactor-api";

import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

export class VetraPackageSubgraph extends BaseSubgraph {
  name = "vetra-package";

  typeDefs = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
