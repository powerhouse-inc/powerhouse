import type { DocumentDriveDocument } from "@powerhousedao/shared";
import { DriveDocumentSchema } from "@powerhousedao/shared/document-drive";
import { map } from "remeda";
import { setDrives } from "../connect.js";
import { setSelectedDrive } from "../hooks/selected-drive.js";
import { phDocumentFromQuery } from "./adapters.js";
import type { TStateSchemaZodObject } from "./types.js";

export async function reactorGraphqlFetchDrive(
  identifier: string,
): Promise<DocumentDriveDocument> {
  const client = window.ph?.reactorGraphQLClient;

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

export async function reactorGraphqlSyncDrive(driveId: string) {
  const client = window.ph?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }
  const drive = await reactorGraphqlFetchDrive(driveId);
  setDrives([drive]);
  setSelectedDrive(drive);
}

export async function reactorGraphqlFetchDocument<
  TDocumentSchema extends TStateSchemaZodObject,
>(identifier: string, documentSchema?: TDocumentSchema) {
  const client = window.ph?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }
  try {
    const result = await client.GetDocument({
      identifier,
    });
    const document = result.document?.document;
    if (!document) return undefined;
    return phDocumentFromQuery(document, documentSchema);
  } catch (error) {
    return undefined;
  }
}

export async function reactorGraphqlBatchFetchDocuments(
  identifiers: readonly string[],
) {
  const client = window.ph?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }
  const promises = map(identifiers, (identifier) =>
    reactorGraphqlFetchDocument(identifier),
  );
  return await Promise.all(promises);
}
