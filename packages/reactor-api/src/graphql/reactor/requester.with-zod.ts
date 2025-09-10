import type { DocumentNode } from "graphql";
import type { Requester } from "./generated/sdk.js";
import { createFetchRequester, type FetchLike } from "./requester.js";

export function createValidatingRequester(
  url: string,
  fetchImpl: FetchLike,
  headers?: Record<string, string>,
): Requester {
  const base = createFetchRequester(url, fetchImpl, headers);
  return async <R, V>(
    document: DocumentNode,
    variables?: V,
    options?: any,
  ): Promise<R> => {
    const data = (await base(document, variables, options)) as R;

    // TODO: Phase 3 will implement validation logic here
    // For now, just pass through the data

    return data;
  };
}
