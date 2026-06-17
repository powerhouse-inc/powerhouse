import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const customSubgraphResolversTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
}) =>
  ts`
import { type BaseSubgraph } from "${REACTOR_API_PACKAGE}";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, unknown> => {
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
