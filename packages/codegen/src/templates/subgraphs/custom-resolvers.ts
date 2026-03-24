import { ts } from "@tmpl/core";

export const customSubgraphResolversTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
}) =>
  ts`
import { type ISubgraph } from "@powerhousedao/reactor-api";

export const getResolvers = (subgraph: ISubgraph): Record<string, unknown> => {
  const reactor = subgraph.reactorClient;

  return ({
    Query: {
      ${v.camelCaseName}: () => ({}), // namespace resolver for nested queries
    },
    ${v.pascalCaseName}Queries: {
      example: async (parent: unknown, args: { driveId: string }) => {
        return "example";
      },
    },
  });
};
`.raw;
