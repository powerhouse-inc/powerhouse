import { getSdk } from "./gen/graphql.js";
import { type FetchLike } from "./requester.js";
import { createValidatingRequester } from "./requester.with-zod.js";

export function createReactorClient(
  url: string,
  fetchImpl: FetchLike,
  headers?: Record<string, string>,
) {
  const requester = createValidatingRequester(url, fetchImpl, headers);
  return getSdk(requester);
}
