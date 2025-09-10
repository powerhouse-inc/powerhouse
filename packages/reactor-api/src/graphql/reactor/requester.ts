import { print } from "graphql";
import type { Requester } from "./generated/sdk.js";

export type FetchLike = (
  input: URL | string,
  init: RequestInit,
) => Promise<Response>;

export function createFetchRequester(
  url: string,
  fetchImpl: FetchLike,
  baseHeaders: Record<string, string> = {},
): Requester {
  return async (document, variables, _options) => {
    const res = await fetchImpl(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...baseHeaders,
      },
      body: JSON.stringify({ query: print(document), variables }),
    });

    if (!res.ok) {
      throw new Error(`GraphQL HTTP ${res.status}`);
    }

    const json = await res.json();
    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }

    return json.data;
  };
}
