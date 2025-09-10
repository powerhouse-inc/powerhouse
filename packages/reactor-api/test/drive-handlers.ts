import type { IDocumentDriveServer } from "document-drive";
import type { GraphQLQuery } from "msw";
import { graphql, HttpResponse } from "msw";
import { DriveSubgraph } from "@powerhousedao/reactor-api";

export const createDriveHandlers = (
  reactor: IDocumentDriveServer,
  driveId: string,
): GraphQLHandler[] => {
  const driveSubgraph = new DriveSubgraph({
    reactor,
  } as unknown as SubgraphArgs);
  // eslint-disable-next-line
  const { Query, Mutation, Sync } = driveSubgraph.resolvers as unknown as {
    Query: any;
    Mutation: any;
    Sync: any;
  };
  const context = { driveId, isUser: () => true, isAdmin: () => true };

  return [
    graphql.query("getDrive", async ({ variables }) =>
      HttpResponse.json({
        // eslint-disable-next-line
        data: { drive: await Query.drive(undefined, variables, context) },
      }),
    ),
    graphql.mutation<GraphQLQuery, { strands: any[] }>(
      "pushUpdates",
      async ({ variables }) =>
        HttpResponse.json({
          data: {
            // eslint-disable-next-line
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
            // eslint-disable-next-line
            registerPullResponderListener:
              // eslint-disable-next-line
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
                // eslint-disable-next-line
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
            // eslint-disable-next-line
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
