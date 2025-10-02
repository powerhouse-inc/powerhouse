---
to: "<%= rootDir %>/<%= h.changeCase.param(subgraph) %>/resolvers.ts"
unless_exists: true
---
import { type Subgraph } from "@powerhousedao/reactor-api";

export const getResolvers = (subgraph: Subgraph): Record<string, unknown> => {
  const reactor = subgraph.reactor;

  return ({
    Query: {
      example: async (parent: unknown, args: { driveId: string }) => {
        return "example";
      },
    },
  });
};
