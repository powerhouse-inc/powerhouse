import { getPHStore } from "./ph-store.js";
import type { DocumentDriveDocument } from "@powerhousedao/shared";
import { DriveDocumentSchema } from "@powerhousedao/shared/document-drive";
import { useEffect, useState } from "react";
import { forEach } from "remeda";
import { phDocumentFromQuery } from "../graphql/adapters.js";
import { createClient } from "../graphql/client.js";
import {
  DEFAULT_DRIVE_ID,
  DEFAULT_SWITCHBOARD_URL,
  graphqlEventsToSyncDrive,
} from "../graphql/constants.js";
import { documentCacheClientMiddleware } from "../graphql/document-cache-client-middleware.js";
import { GraphQLClientDocumentCache } from "../graphql/graphql-client-document-cache.js";
import {
  callEventHandlerRegisterFunctions,
  commonGlobalEventHandlerFunctions,
} from "./add-ph-event-handlers.js";
import { setDocumentCache } from "./document-cache.js";
import { setDrives } from "./drives.js";
import { setGraphQLReactorClient } from "./graphql-reactor-client.js";
import { selectDrive } from "./selected-drive.js";
import { selectNode } from "./set-selected-node.js";

export function useInitReactorGraphqlClient(
  switchboardUrl = DEFAULT_SWITCHBOARD_URL,
  driveId = DEFAULT_DRIVE_ID,
) {
  const [hasInit, setHasInit] = useState(false);

  useEffect(() => {
    if (hasInit) return;

    initGraphQLReactorClientWithDocumentCache(switchboardUrl, driveId)
      .then(() => setHasInit(true))
      .catch(console.error);
  }, [hasInit]);

  return hasInit;
}

async function reactorGraphqlFetchDrive(
  identifier: string,
): Promise<DocumentDriveDocument> {
  const client = getPHStore()?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.GetDocument({ identifier });

  if (!result.document?.document) {
    throw new Error("Could not fetch drive with id: " + identifier);
  }

  const drive = phDocumentFromQuery(
    result.document.document,
    DriveDocumentSchema,
  ) as DocumentDriveDocument;
  return drive;
}

async function reactorGraphqlSyncDrive(driveId: string) {
  const client = getPHStore()?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }
  const drive = await reactorGraphqlFetchDrive(driveId);
  setDrives([drive]);
  selectDrive(drive);
}

async function initGraphQLReactorClientWithDocumentCache(
  switchboardUrl: string,
  driveId: string,
) {
  callEventHandlerRegisterFunctions(commonGlobalEventHandlerFunctions);

  const client = createClient(switchboardUrl, documentCacheClientMiddleware);
  setGraphQLReactorClient(client);
  await reactorGraphqlSyncDrive(driveId);
  selectNode(undefined);
  setDocumentCache(new GraphQLClientDocumentCache());

  forEach(graphqlEventsToSyncDrive, (name) => {
    window.addEventListener(name, () => {
      reactorGraphqlSyncDrive(driveId).catch(console.error);
    });
  });
}
