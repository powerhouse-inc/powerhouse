import type { SubgraphArgs } from "@powerhousedao/reactor-api";
import { DriveSubgraph } from "@powerhousedao/reactor-api";
import type { IDocumentDriveServer } from "document-drive";
import type { GraphQLHandler, GraphQLQuery } from "msw";
import { graphql, HttpResponse } from "msw";

export const createDriveHandlers = (
  reactor: IDocumentDriveServer,
  driveId: string,
): GraphQLHandler[] => {
  const driveSubgraph = new DriveSubgraph({
    reactor,
  } as unknown as SubgraphArgs);

  const { Query, Mutation, Sync } = driveSubgraph.resolvers as unknown as {
    Query: any;
    Mutation: any;
    Sync: any;
  };
  const context = { driveId, isUser: () => true, isAdmin: () => true };

  return [
    graphql.query("getDrive", async ({ variables }) =>
      HttpResponse.json({
        data: { drive: await Query.drive(undefined, variables, context) },
      }),
    ),
    graphql.mutation<GraphQLQuery, { strands: any[] }>(
      "pushUpdates",
      async ({ variables }) =>
        HttpResponse.json({
          data: {
            pushUpdates: await Mutation.pushUpdates(
              undefined,
              variables,
              context,
            ),
          },
        }),
    ),
    graphql.mutation<GraphQLQuery, { filter: any }>(
      "registerPullResponderListener",
      async ({ variables }) =>
        HttpResponse.json({
          data: {
            registerPullResponderListener:
              await Mutation.registerPullResponderListener(
                undefined,
                variables,
                context,
              ),
          },
        }),
    ),
    graphql.query<GraphQLQuery, { listenerId: string }>(
      "strands",
      async ({ variables }) =>
        HttpResponse.json({
          data: {
            system: {
              sync: {
                strands: await Sync.strands(undefined, variables, context),
              },
            },
          },
        }),
    ),
    graphql.mutation<GraphQLQuery, { listenerId: string; revisions: any[] }>(
      "acknowledge",
      async ({ variables }) =>
        HttpResponse.json({
          data: {
            acknowledge: await Mutation.acknowledge(
              undefined,
              variables,
              context,
            ),
          },
        }),
    ),
  ];
};
