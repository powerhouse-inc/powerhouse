import { ts } from "@tmpl/core";

export const subgraphIndexFileTemplate = (v: {
  pascalCaseName: string;
  kebabCaseName: string;
}) =>
  ts`
import { BaseSubgraph } from "@powerhousedao/reactor-api";
import type { DocumentNode } from "graphql";
import { schema } from "./schema.js";
import { getResolvers } from "./resolvers.js";

export class ${v.pascalCaseName}Subgraph extends BaseSubgraph {
  name = "${v.kebabCaseName}";
  typeDefs: DocumentNode = schema;
  resolvers = getResolvers(this);
  additionalContextFields = {};
  async onSetup() {}
  async onDisconnect() {}
}
`.raw;
