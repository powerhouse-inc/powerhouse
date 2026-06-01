import { map } from "remeda";
import { phDocumentFromQuery } from "./adapters.js";
import type { TStateSchemaZodObject } from "./types.js";

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
  } catch {
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
