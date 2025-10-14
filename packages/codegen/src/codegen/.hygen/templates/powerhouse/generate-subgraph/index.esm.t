---
to: "<%= rootDir %>/<%= h.changeCase.param(name) %>/index.ts"
unless_exists: true
---
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { schema } from "./schema.js";
import { getResolvers } from "./resolvers.js";

export class <%= pascalName %>Subgraph extends BaseSubgraph {
  name = "<%= h.changeCase.param(name) %>";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}