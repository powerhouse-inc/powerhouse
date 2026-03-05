import { GraphQLClient } from "graphql-request";
import { getSdk, type SdkFunctionWrapper } from "./gen/schema.js";

/**
 * Creates a GraphQL client for the Reactor Subgraph API.
 * @param urlOrGQLClient The URL of the GraphQL API or a GraphQL client instance.
 * @param middleware An optional middleware function to wrap the GraphQL client calls.
 * @returns A GraphQL client for the Reactor Subgraph API.
 */
export function createClient(
  urlOrGQLClient: string | GraphQLClient,
  middleware?: SdkFunctionWrapper,
) {
  const client =
    typeof urlOrGQLClient === "string"
      ? new GraphQLClient(urlOrGQLClient)
      : urlOrGQLClient;
  return getSdk(client, middleware);
}
