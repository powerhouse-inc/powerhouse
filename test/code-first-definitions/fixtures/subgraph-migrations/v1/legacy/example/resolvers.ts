import type { BaseSubgraph } from "@powerhousedao/reactor-api";

/** Reads the bound instance, which the candidate must pass through unchanged. */
export const getResolvers = (
  subgraph: BaseSubgraph,
): Record<string, unknown> => ({
  Query: {
    example: () => ({}),
  },
  ExampleQueries: {
    zebra: (_parent: unknown, args: { driveId: string }) =>
      `${subgraph.name}:${args.driveId}`,
    alpha: () => 1,
  },
});
