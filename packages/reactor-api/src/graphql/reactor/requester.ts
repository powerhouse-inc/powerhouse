import { print, type DocumentNode } from "graphql";
import type { Requester } from "./gen/graphql.js";

export type FetchLike = (
  input: URL | string,
  init: RequestInit,
) => Promise<Response>;

interface GraphQLResponse<T = unknown> {
  data?: T;
  errors?: Array<{ message: string; locations?: unknown; path?: unknown }>;
}

export function createFetchRequester(
  url: string,
  fetchImpl: FetchLike,
  baseHeaders: Record<string, string> = {},
): Requester {
  return async <R, V>(document: DocumentNode, variables?: V) => {
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

    const json = (await res.json()) as GraphQLResponse<R>;
    if (json.errors) {
      throw new Error(JSON.stringify(json.errors));
    }

    return json.data as R;
  };
}
