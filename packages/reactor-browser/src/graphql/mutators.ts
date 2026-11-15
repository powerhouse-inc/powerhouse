import { getPHStore } from "../hooks/ph-store.js";
import type { PHDocument } from "document-model";
import { DEFAULT_DRIVE_ID } from "./constants.js";
import type { ActionInput } from "./gen/schema.js";

export async function reactorGraphqlCreateDocument<
  TDocument extends PHDocument,
>(document: TDocument, parentIdentifier = DEFAULT_DRIVE_ID) {
  const client = getPHStore()?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.CreateDocument({
    document,
    parentIdOrSlug: parentIdentifier,
  });

  return result;
}

export async function reactorGraphqlDeleteDocument(identifier: string) {
  const client = getPHStore()?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.DeleteDocument({
    idOrSlug: identifier,
  });

  return result;
}

export async function reactorGraphqlDeleteDocuments(identifiers: string[]) {
  const client = getPHStore()?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.DeleteDocuments({
    idsOrSlugs: identifiers,
  });

  return result;
}

export async function reactorGraphqlMutateDocument(
  documentIdentifier: string,
  ...actions: ReadonlyArray<ActionInput>
) {
  const client = getPHStore()?.reactorGraphQLClient;

  if (!client) {
    throw new Error(
      "Please call `useInitReactorGraphqlClient` to use its functions",
    );
  }

  const result = await client.MutateDocument({
    documentIdOrSlug: documentIdentifier,
    actions,
  });

  return result;
}
