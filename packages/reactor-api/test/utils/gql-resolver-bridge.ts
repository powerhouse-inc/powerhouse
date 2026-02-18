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

type ResolverBridgeOptions = {
  log?: boolean;
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
  options: ResolverBridgeOptions = {},
): typeof fetch {
  const logEnabled = options.log ?? true;

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

      const result = pollSyncEnvelopes(syncManager, variables);

      if (logEnabled && result.envelopes.length > 0) {
        console.log(
          `[BRIDGE] pollSyncEnvelopes: ${result.envelopes.length} envelopes for channel ${variables.channelId}`,
        );
      }

      // Normalize envelopes for GqlRequestChannel compatibility:
      // 1. Lowercase type ("OPERATIONS" -> "operations")
      // 2. Filter empty dependency strings (outbox can have "" as initial prevJobId)
      const normalizedEnvelopes = result.envelopes.map(
        (env: Record<string, unknown>) => ({
          ...env,
          type: (env.type as string).toLowerCase(),
          dependsOn: Array.isArray(env.dependsOn)
            ? (env.dependsOn as string[]).filter(Boolean)
            : env.dependsOn,
        }),
      );

      return createMockResponse({
        pollSyncEnvelopes: {
          envelopes: normalizedEnvelopes,
          ackOrdinal: result.ackOrdinal,
        },
      });
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
              ordinal: number;
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

      const envelopeOps = variables.envelopes.flatMap((e) =>
        (e.operations ?? []).map((op) => op.context.documentId),
      );
      if (logEnabled) {
        console.log(
          `[BRIDGE] pushSyncEnvelopes: ${variables.envelopes.length} envelopes, docs: ${[...new Set(envelopeOps)].join(",")}`,
        );
      }

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

      if (logEnabled) {
        console.log(
          `[BRIDGE] touchChannel: id=${variables.input.id} collection=${variables.input.collectionId}`,
        );
      }

      const result = await touchChannel(syncManager, variables);

      if (logEnabled) {
        console.log(`[BRIDGE] touchChannel result: ${result}`);
      }

      return createMockResponse({ touchChannel: result });
    }

    throw new Error(`Unknown GraphQL operation in query: ${body.query}`);
  };
}
