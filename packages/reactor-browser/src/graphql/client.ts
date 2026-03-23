import { GraphQLClient } from "graphql-request";
import {
  buildBatchDocumentWithOperationsQuery,
  buildBatchOperationsQuery,
} from "./batch-queries.js";
import {
  getSdk,
  type GetDocumentOperationsQuery,
  type GetDocumentQuery,
  type OperationsFilterInput,
  type PagingInput,
  type SdkFunctionWrapper,
  type ViewFilterInput,
} from "./gen/schema.js";
import type { ReactorGraphQLClient } from "./types.js";

export type { ReactorGraphQLClient } from "./types.js";

type DocumentOperationsPage = GetDocumentOperationsQuery["documentOperations"];

type DocumentResult = NonNullable<GetDocumentQuery["document"]>;

/**
 * Creates a GraphQL client for the Reactor Subgraph API.
 * @param urlOrGQLClient The URL of the GraphQL API or a GraphQL client instance.
 * @param middleware An optional middleware function to wrap the GraphQL client calls.
 * @returns A GraphQL client for the Reactor Subgraph API.
 */
export function createClient(
  urlOrGQLClient: string | GraphQLClient,
  middleware?: SdkFunctionWrapper,
): ReactorGraphQLClient {
  const client =
    typeof urlOrGQLClient === "string"
      ? new GraphQLClient(urlOrGQLClient)
      : urlOrGQLClient;
  return {
    ...getSdk(client, middleware),

    /**
     * Fetch documentOperations for multiple filters in a single HTTP request
     * using GraphQL aliases. Each filter has its own paging parameters.
     * Returns one result page per filter, in order.
     */
    async BatchGetDocumentOperations(
      filters: OperationsFilterInput[],
      pagings: (PagingInput | undefined | null)[],
    ): Promise<DocumentOperationsPage[]> {
      const { query, variables } = buildBatchOperationsQuery(filters, pagings);
      const data = await client.request<Record<string, DocumentOperationsPage>>(
        query,
        variables,
      );
      return filters.map((_, i) => data[`scope_${i}`]);
    },

    /**
     * Fetch a document AND documentOperations for multiple filters
     * in a single HTTP request. Combines GetDocument + BatchGetDocumentOperations.
     */
    async BatchGetDocumentWithOperations(
      identifier: string,
      view: ViewFilterInput | undefined,
      filters: OperationsFilterInput[],
      pagings: (PagingInput | undefined)[],
    ): Promise<{
      document: DocumentResult | null;
      operations: DocumentOperationsPage[];
    }> {
      const { query, variables } = buildBatchDocumentWithOperationsQuery(
        identifier,
        view,
        filters,
        pagings,
      );
      const data = await client.request<
        Record<string, unknown> & { document?: DocumentResult }
      >(query, variables);
      return {
        document: data.document ?? null,
        operations: filters.map(
          (_, i) => data[`scope_${i}`] as DocumentOperationsPage,
        ),
      };
    },
  };
}
