import type { Request as SSERequest } from "graphql-sse";
import { createHandler } from "graphql-sse/lib/use/express";
import type { Request as ExpressRequest } from "express";
import type { GraphQLSchema } from "graphql";
import type { Context } from "./types.js";

/**
 * Options for creating the GraphQL-over-SSE handler.
 */
export interface SSEHandlerOptions {
  schema: GraphQLSchema;
  /**
   * Build a GraphQL context from the incoming Express request.
   * Called once per subscription (not per event).
   *
   * Unlike WebSocket subscriptions (which need their own auth via
   * connectionParams because WS upgrades bypass Express middleware),
   * SSE requests are normal HTTP requests. The Express auth middleware
   * has already run by the time this handler is invoked, so `req.user`
   * is already populated on the request object. The context factory
   * just needs to assemble the Context the same way Apollo's
   * expressMiddleware does.
   */
  contextFactory: (req: ExpressRequest) => Promise<Context> | Context;
}

/**
 * Create an Express-compatible SSE handler for GraphQL subscriptions
 * using the graphql-sse library (graphql-sse protocol).
 *
 * This runs alongside the existing WebSocket (graphql-ws) transport
 * so clients can choose either protocol.
 *
 * Authentication:
 *   SSE subscriptions are plain HTTP requests, so the existing Express
 *   auth middleware (`AuthService.authenticate`) runs before this handler.
 *   The client sends `Authorization: Bearer <token>` as a normal HTTP
 *   header -- exactly the same as for queries and mutations. By the time
 *   graphql-sse processes the request, `req.user` is already set.
 *
 * Clients connect via "distinct connections mode" (POST with
 * `Accept: text/event-stream`). Single-connection mode is disabled
 * because it adds token-management complexity with no benefit here.
 */
export function createGraphQLSSEHandler(options: SSEHandlerOptions) {
  const { schema, contextFactory } = options;

  return createHandler<Context>({
    schema,
    // Returning null disables single-connection mode. All clients use
    // "distinct connections mode" (one POST per subscription).
    // Auth is already handled by the Express middleware layer.
    authenticate: () => null,
    context: (req: SSERequest<ExpressRequest>) => {
      return contextFactory(req.raw);
    },
  });
}
