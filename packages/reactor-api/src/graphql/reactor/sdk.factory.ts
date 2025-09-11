import { getSdk } from "./generated/graphql.js";
import { type FetchLike } from "./requester.js";
import { createValidatingRequester } from "./requester.with-zod.js";

export function createReactorSdk(
  url: string,
  fetchImpl: FetchLike,
  headers?: Record<string, string>,
) {
  const requester = createValidatingRequester(url, fetchImpl, headers);
  return getSdk(requester);
}
