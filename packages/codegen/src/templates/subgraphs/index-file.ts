import {
  GRAPHQL_PACKAGE,
  REACTOR_API_PACKAGE,
} from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const subgraphIndexFileTemplate = (v: {
  pascalCaseName: string;
  kebabCaseName: string;
}) =>
  ts`
import { BaseSubgraph } from "${REACTOR_API_PACKAGE}";
import type { DocumentNode } from "${GRAPHQL_PACKAGE}";
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
