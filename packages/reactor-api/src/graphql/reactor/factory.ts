import { getSdk } from "./gen/graphql.js";
import type { FetchLike } from "./requester.js";
import { createValidatingRequester } from "./requester.with-zod.js";

export function createReactorGraphQLClient(
  url: string,
  fetchImpl: FetchLike = fetch,
  headers?: Record<string, string>,
) {
  const requester = createValidatingRequester(url, fetchImpl, headers);
  return getSdk(requester);
}
