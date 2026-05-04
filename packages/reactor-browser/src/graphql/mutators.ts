import type { PHDocument } from "document-model";
import { DEFAULT_DRIVE_ID } from "./constants.js";
import type { Scalars } from "./gen/schema.js";

export async function reactorGraphqlCreateDocument<
  TDocument extends PHDocument,
>(document: TDocument, parentIdentifier = DEFAULT_DRIVE_ID) {
  const client = window.ph?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.CreateDocument({
    document,
    parentIdentifier,
  });

  return result;
}

export async function reactorGraphqlDeleteDocument(identifier: string) {
  const client = window.ph?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.DeleteDocument({
    identifier,
  });

  return result;
}

export async function reactorGraphqlDeleteDocuments(identifiers: string[]) {
  const client = window.ph?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.DeleteDocuments({
    identifiers,
  });

  return result;
}

export async function reactorGraphqlMutateDocument(
  documentIdentifier: string,
  ...actions: ReadonlyArray<Scalars["JSONObject"]["input"]>
) {
  const client = window.ph?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.MutateDocumentAsync({
    documentIdentifier,
    actions,
  });

  return result;
}
