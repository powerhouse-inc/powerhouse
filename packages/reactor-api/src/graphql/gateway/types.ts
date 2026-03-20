import type { CorsOptions } from "cors";
import type { GraphQLSchema } from "graphql";
import type http from "node:http";
import type { WebSocketServer } from "ws";

// Framework-agnostic context factory - receives the Fetch API Request for the current operation
export type GatewayContextFactory<TContext = unknown> = (
  request: Request,
) => Promise<TContext>;

export type WsContextFactory<TContext = unknown> = (
  connectionParams: Record<string, unknown>,
) => Promise<TContext>;

export type WsDisposer = { dispose: () => void | Promise<void> };

// A Fetch API handler - framework agnostic
export type FetchHandler = (request: Request) => Promise<Response>;

export interface IGatewayAdapter<TContext = unknown> {
  /** One-time startup. */
  start(httpServer: http.Server): Promise<void>;

  /**
   * Returns a Fetch API handler for the given schema.
   * Caller (IHttpAdapter) is responsible for mounting it at a path.
   */
  createHandler(
    schema: GraphQLSchema,
    contextFactory: GatewayContextFactory<TContext>,
  ): Promise<FetchHandler>;

  /** Attach WebSocket subscriptions. Returns a disposer. */
  attachWebSocket(
    wsServer: WebSocketServer,
    schema: GraphQLSchema,
    contextFactory: WsContextFactory<TContext>,
  ): WsDisposer;

  stop(): Promise<void>;
}

export interface IHttpAdapter {
  /** Set up CORS and body-parser equivalent middleware. */
  setupMiddleware(config: {
    corsOptions?: CorsOptions;
    bodyLimit?: string;
  }): void;

  /**
   * Mount a Fetch API handler.
   * - exact = false (default): exact path match via internal dispatch map.
   * - exact = true: prefix match - handler also receives all sub-paths
   *   (uses framework router.use() semantics).
   */
  mount(
    path: string,
    handler: FetchHandler,
    options?: { exact?: boolean },
  ): void;

  /** Register a REST GET endpoint. Handler receives matched URL params. */
  get(
    path: string,
    handler: (
      params: Record<string, string>,
      req: unknown,
      res: unknown,
    ) => void | Promise<void>,
  ): void;

  /** Add a middleware that runs before all registered routes. */
  use(middleware: unknown): void;
}
