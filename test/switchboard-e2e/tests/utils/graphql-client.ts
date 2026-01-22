import { GraphQLClient, gql } from "graphql-request";

/**
 * GraphQL endpoint for the switchboard
 */
export const GRAPHQL_ENDPOINT = "http://localhost:4001/graphql";

/**
 * Create a reusable GraphQL client instance
 */
export function createGraphQLClient(endpoint: string = GRAPHQL_ENDPOINT) {
  return new GraphQLClient(endpoint, {
    fetch,
  });
}

/**
 * Default client instance for convenience
 */
export const graphqlClient = createGraphQLClient();

/**
 * Helper function to execute GraphQL queries/mutations
 */
export async function executeGraphQL<T>(
  query: string,
  variables?: Record<string, any>,
  endpoint: string = GRAPHQL_ENDPOINT,
): Promise<T> {
  const client = createGraphQLClient(endpoint);
  return client.request<T>(query, variables);
}

// Export gql for convenience
export { gql };
