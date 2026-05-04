import {
  callEventHandlerRegisterFunctions,
  commonGlobalEventHandlerFunctions,
  createClient,
  phDocumentFromQuery,
  setDocumentCache,
  setDrives,
  setSelectedDrive,
  setSelectedNode,
  type ReactorGraphQLClient,
} from "@powerhousedao/reactor-browser";
import type { DocumentDriveDocument } from "@powerhousedao/shared";
import { DriveDocumentSchema } from "@powerhousedao/shared/document-drive";
import { forEach } from "remeda";
import { Cache } from "./cache.js";
import { eventsToSyncDrive } from "./constants.js";

declare global {
  interface Window {
    reactorGraphQLClient: ReactorGraphQLClient | undefined;
  }
}

async function fetchDrive(
  client: ReactorGraphQLClient,
  identifier: string,
): Promise<DocumentDriveDocument> {
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

async function syncDrive(client: ReactorGraphQLClient, driveId: string) {
  const drive = await fetchDrive(client, driveId);
  setDrives([drive]);
  setSelectedDrive(drive);
}

export async function init(driveId: string) {
  if (!window.ph) {
    window.ph = {};
  }

  callEventHandlerRegisterFunctions(commonGlobalEventHandlerFunctions);

  const client = createClient(
    "http://localhost:4001/graphql",
    async (action, operationName, operationType, variables) => {
      console.log({ operationName, operationType, variables });
      const result = await action();
      window.dispatchEvent(
        new CustomEvent(operationName, {
          detail: variables,
        }),
      );
      return result;
    },
  );
  window.reactorGraphQLClient = client;
  await syncDrive(client, driveId);
  setSelectedNode(undefined);
  setDocumentCache(new Cache(client));

  forEach(eventsToSyncDrive, (name) => {
    window.addEventListener(name, () => {
      syncDrive(client, driveId).catch(console.error);
    });
  });
}
