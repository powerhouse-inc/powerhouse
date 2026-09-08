import { parse } from "graphql";
import { BaseSubgraph } from "../../../../../packages/reactor-api/src/graphql/base-subgraph.js";
import { defineSubgraph } from "../../../../../packages/reactor-api/src/graphql/define-subgraph.js";

const typeDefs = parse("type Query { loaderFixture: String! }");
const resolvers = { Query: { loaderFixture: () => "loaded" } };

export class LegacyLoaderSubgraph extends BaseSubgraph {
  name = "loader-fixture";
  hasSubscriptions = false;
  typeDefs = typeDefs;
  resolvers = resolvers;
}

export const CodeFirstLoaderSubgraph = defineSubgraph({
  name: "loader-fixture",
  schemaKind: "graphql-ast-compat",
  compatibility: {
    kind: "graphql-ast-v1",
    typeDefs,
    getResolvers: () => resolvers,
    hasSubscriptions: false,
    preserveDefinitionOrder: true,
  },
});
