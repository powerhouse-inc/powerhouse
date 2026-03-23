---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/resolvers.ts"
unless_exists: true
---
import { type ISubgraph } from "@powerhousedao/reactor-api";

export const getResolvers = (subgraph: ISubgraph): Record<string, unknown> => {
  const reactor = subgraph.reactorClient;

  return ({
    Query: {
      <%= h.changeCase.camel(subgraph) %>: () => ({}), // namespace resolver for nested queries
    },
    <%= h.changeCase.pascal(subgraph) %>Queries: {
      example: async (parent: unknown, args: { driveId: string }) => {
        return "example";
      },
    },
  });
};
