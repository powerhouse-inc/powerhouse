import { type BaseSubgraph } from "@powerhousedao/reactor-api";

export const getResolvers = (
  _subgraph: BaseSubgraph,
): Record<string, unknown> => {
  return {
    Query: {
      legacyStatus: () => ({}),
    },
    LegacyStatusQueries: {
      example: (_parent: unknown, _args: { driveId: string }) => "example",
    },
  };
};
