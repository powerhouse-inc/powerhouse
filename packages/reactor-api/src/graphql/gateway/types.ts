import type { CorsOptions } from "cors";
import type { DocumentNode, GraphQLSchema } from "graphql";
import type http from "node:http";
import type { WebSocketServer } from "ws";

export type TlsOptions =
  | { keyPath: string; certPath: string }
  | { cert: Buffer | string; key: Buffer | string }
  | true;

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

/**
 * Opaque identifier for a registered route. Returned by `mount()`,
 * `getRoute()`, and `mountNodeRoute()`; pass it to `unmount()` to remove
 * the route.
 */
export type RouteHandle = number;

/**
 * A framework-agnostic description of a federated subgraph service.
 * Used by IGatewayAdapter.createSupergraphHandler() to compose the supergraph SDL.
 */
export type SubgraphDefinition = {
  name: string;
  typeDefs: DocumentNode;
  url: string;
};

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

  /**
   * Create a federation gateway handler that composes all subgraphs into a supergraph.
   * getSubgraphs is called eagerly (during setup) and again on every updateSupergraph() call.
   */
  createSupergraphHandler(
    getSubgraphs: () => SubgraphDefinition[],
    httpServer: http.Server,
    contextFactory: GatewayContextFactory<TContext>,
  ): Promise<FetchHandler>;

  /**
   * Recompose the supergraph SDL from the current subgraph list and push the update
   * to the running federation gateway. No-op if createSupergraphHandler() has not
   * been called yet.
   */
  updateSupergraph(): Promise<void>;

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
   * Mount a Fetch API handler. Returns a handle for {@link unmount}.
   * - exact = false (default): exact path match.
   * - exact = true: prefix match - handler also receives all sub-paths.
   *
   * Mounting a path that already holds a fetch mount of the same kind
   * replaces the previous one (last write wins).
   */
  mount(
    path: string,
    handler: FetchHandler,
    options?: { exact?: boolean },
  ): RouteHandle;

  /**
   * Register a GET-only route that returns a Fetch Response (for health,
   * explorer, etc.). Returns a handle for {@link unmount}.
   */
  getRoute(
    path: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): RouteHandle;

  /**
   * Start listening on the given port. Returns the underlying http.Server
   * so callers can attach WebSocket servers.
   */
  listen(port: number, tls?: TlsOptions): Promise<http.Server>;

  /**
   * Mount a raw Connect/Express-compatible middleware function (e.g. Vite dev
   * server middleware). The implementation is adapter-specific; for Express this
   * is equivalent to `app.use(middleware)`.
   */
  mountRawMiddleware(middleware: unknown): void;

  /**
   * Register a method-specific route handler using Node.js core HTTP types.
   * Use this when a Fetch API FetchHandler is not possible (e.g. streaming
   * protocols that require direct access to IncomingMessage/ServerResponse).
   *
   * The req/res objects are `http.IncomingMessage`/`http.ServerResponse`
   * (Express Request/Response are compatible subtypes). Returns a handle
   * for {@link unmount}.
   */
  mountNodeRoute(
    method: "DELETE" | "GET" | "HEAD" | "POST" | "PUT",
    path: string,
    // Node route handlers may be synchronous or async; the adapter
    // fire-and-forgets the returned promise.
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      body?: unknown,
    ) => void | Promise<void>,
  ): RouteHandle;

  /**
   * Remove a route registered by `mount()`, `getRoute()`, or
   * `mountNodeRoute()`, identified by the handle that call returned.
   * No-op for unknown or already-removed handles.
   *
   * `mountRawMiddleware` is intentionally not removable: raw framework
   * middleware (e.g. a Vite dev server) is not a single route.
   */
  unmount(handle: RouteHandle): void;

  /**
   * Register framework-specific Sentry error-capturing middleware after all routes
   * are mounted. Each adapter calls the Sentry setup function appropriate for its
   * framework (e.g. setupExpressErrorHandler, setupFastifyErrorHandler).
   * No-op if Sentry is not relevant for the adapter.
   */
  setupSentryErrorHandler(sentry: object): void;

  /** The raw framework handle (e.g. Express app). Cast as needed at call sites. */
  readonly handle: unknown;
}
