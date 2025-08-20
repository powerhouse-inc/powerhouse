import { type IDocumentDriveServer } from "document-drive";
import { graphql, type GraphQLQuery, HttpResponse } from "msw";
import { DriveSubgraph } from "../src/graphql/drive/index.js";

export const createDriveHandlers = (
  reactor: IDocumentDriveServer,
  driveId: string,
) => {
  const driveSubgraph = new DriveSubgraph({ reactor } as any);
  const { Query, Mutation, Sync } = driveSubgraph.resolvers as any;
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
