import {
  callEventHandlerRegisterFunctions,
  commonGlobalEventHandlerFunctions,
  createClient,
  setDocumentCache,
  setSelectedNode,
} from "@powerhousedao/reactor-browser";
import { forEach } from "remeda";
import { graphqlEventsToSyncDrive } from "./constants.js";
import { documentCacheClientMiddleware } from "./document-cache-client-middleware.js";
import { reactorGraphqlSyncDrive } from "./fetchers.js";
import { GraphQLClientDocumentCache } from "./graphql-client-document-cache.js";

export async function initGraphQLReactorClientWithDocumentCache(
  switchboardUrl: string,
  driveId: string,
) {
  if (!window.ph) {
    window.ph = {};
  }

  callEventHandlerRegisterFunctions(commonGlobalEventHandlerFunctions);

  const client = createClient(switchboardUrl, documentCacheClientMiddleware);
  window.ph.reactorGraphQLClient = client;
  await reactorGraphqlSyncDrive(driveId);
  setSelectedNode(undefined);
  setDocumentCache(new GraphQLClientDocumentCache());

  forEach(graphqlEventsToSyncDrive, (name) => {
    window.addEventListener(name, () => {
      reactorGraphqlSyncDrive(driveId).catch(console.error);
    });
  });
}
