import type { ISyncManager } from "@powerhousedao/reactor";
import {
  touchChannel,
  pollSyncEnvelopes,
  pushSyncEnvelopes,
} from "../../src/graphql/reactor/resolvers.js";

type SyncManagerRegistry = Map<string, ISyncManager>;

type GraphQLRequest = {
  query: string;
  variables?: Record<string, unknown>;
};

function createMockResponse<T>(data: T): Response {
  const body = JSON.stringify({ data });
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function extractSyncManagerFromUrl(
  url: string,
  registry: SyncManagerRegistry,
): ISyncManager {
  const urlObj = new URL(url);
  const reactorName = urlObj.hostname.toLowerCase();

  const syncManager = registry.get(reactorName);
  if (!syncManager) {
    throw new Error(`SyncManager not found for reactor: ${reactorName}`);
  }

  return syncManager;
}

/**
 * Creates a mock fetch function that routes GraphQL sync operations
 * directly to the resolver functions, bypassing the network.
 *
 * This enables integration testing of GqlChannel without running
 * an actual GraphQL server.
 */
export function createResolverBridge(
  syncManagers: SyncManagerRegistry,
): typeof fetch {
  return async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    let url: string;
    if (typeof input === "string") {
      url = input;
    } else if (input instanceof URL) {
      url = input.href;
    } else {
      url = input.url;
    }

    if (!init?.body) {
      throw new Error("GraphQL request must have a body");
    }

    const body = JSON.parse(init.body as string) as GraphQLRequest;
    const syncManager = extractSyncManagerFromUrl(url, syncManagers);

    if (body.query.includes("pollSyncEnvelopes")) {
      const variables = body.variables as {
        channelId: string;
        outboxAck: number;
        outboxLatest: number;
      };

      const result = await pollSyncEnvelopes(syncManager, variables);

      return createMockResponse({ pollSyncEnvelopes: result });
    }

    if (body.query.includes("pushSyncEnvelopes")) {
      const variables = body.variables as {
        envelopes: Array<{
          type: string;
          channelMeta: { id: string };
          operations?: Array<{
            operation: unknown;
            context: {
              documentId: string;
              documentType: string;
              scope: string;
              branch: string;
            };
          }> | null;
          cursor?: {
            remoteName: string;
            cursorOrdinal: number;
            lastSyncedAtUtcMs?: string | null;
          } | null;
          key?: string;
          dependsOn?: string[];
        }>;
      };

      const result = await pushSyncEnvelopes(syncManager, variables);

      return createMockResponse({ pushSyncEnvelopes: result });
    }

    if (body.query.includes("touchChannel")) {
      const variables = body.variables as {
        input: {
          id: string;
          name: string;
          collectionId: string;
          filter: {
            documentId: readonly string[];
            scope: readonly string[];
            branch: string;
          };
          sinceTimestampUtcMs: string;
        };
      };

      const result = await touchChannel(syncManager, variables);

      return createMockResponse({ touchChannel: result });
    }

    throw new Error(`Unknown GraphQL operation in query: ${body.query}`);
  };
}
