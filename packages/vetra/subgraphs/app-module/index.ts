import type { DocumentNode } from "graphql";
import { schema } from "./schema.js";
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import { getResolvers } from "./resolvers.js";
import { schema } from "./schema.js";

export class AppModuleSubgraph extends BaseSubgraph {
  name = "app-module";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
