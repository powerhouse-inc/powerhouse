import type { GraphQLSchema } from "graphql";
import type { Request as SSERequest } from "graphql-sse";
import { createHandler } from "graphql-sse/lib/use/fetch";
import type { Context } from "./types.js";

/**
 * Options for creating the GraphQL-over-SSE handler.
 */
export interface SSEHandlerOptions {
  schema: GraphQLSchema;
  /**
   * Build a GraphQL context from the incoming Fetch API Request.
   * Called once per subscription (not per event).
   *
   * The request has already passed through auth middleware by the time
   * this is invoked, so getAuthContext(request) will return the populated
   * AuthContext from the WeakMap.
   */
  contextFactory: (req: Request) => Promise<Context> | Context;
}

/**
 * Create a Fetch-API-compatible SSE handler for GraphQL subscriptions
 * using the graphql-sse library (graphql-sse protocol).
 *
 * This runs alongside the existing WebSocket (graphql-ws) transport
 * so clients can choose either protocol.
 *
 * The returned handler is a standard FetchHandler: (req: Request) => Promise<Response>.
 * It can be mounted via httpAdapter.mount() like any other handler, and auth
 * flows through the WeakMap pattern (authFetchMiddleware populates the context
 * before this handler is called).
 *
 * Clients connect via "distinct connections mode" (POST with
 * `Accept: text/event-stream`). Single-connection mode is disabled
 * because it adds token-management complexity with no benefit here.
 */
export function createGraphQLSSEHandler(
  options: SSEHandlerOptions,
): (req: Request) => Promise<Response> {
  const { schema, contextFactory } = options;

  return createHandler<Context>({
    schema,
    // Returning null disables single-connection mode. All clients use
    // "distinct connections mode" (one POST per subscription).
    // Auth is handled upstream by authFetchMiddleware.
    authenticate: () => null,
    context: (req: SSERequest<Request>) => contextFactory(req.raw),
  });
}
