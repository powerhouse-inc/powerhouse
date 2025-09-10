import { getSdk } from "./generated/sdk.js";
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
