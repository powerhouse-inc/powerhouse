import { REACTOR_API_PACKAGE } from "@powerhousedao/shared/clis";
import { ts } from "@tmpl/core";

export const customSubgraphResolversTemplate = (v: {
  pascalCaseName: string;
  camelCaseName: string;
}) =>
  ts`
import { type BaseSubgraph } from "${REACTOR_API_PACKAGE}";

export const getResolvers = (subgraph: BaseSubgraph): Record<string, unknown> => {
  // Reads go through the read client. Mutations take the write client from
  // the resolver context, \`ctx.clients.write\`, which a query never gets.
  // \`subgraph.reactorClient\` (the deprecated facade) still works meanwhile.
  const read = subgraph.readClient;

  return ({
    Query: {
      ${v.camelCaseName}: () => ({}), // namespace resolver for nested queries
    },
    ${v.pascalCaseName}SubgraphQueries: {
      example: async (parent: unknown, args: { driveId: string }) => {
        return "example";
      },
    },
  });
};
`.raw;
