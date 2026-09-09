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
 * Handle to a route registered directly on the adapter. Packages hot-reload,
 * so every registration is reversible; disposing a route that is already gone
 * is a no-op.
 *
 * The handle *is* the capability to remove that one route: holding it is the
 * only way to take the route back, and it cannot name any other. An opaque
 * integer would let any holder remove any route by arithmetic, and a caller
 * that disposed twice would eventually free somebody else's registration once
 * ids were reused.
 *
 * Distinct from the `ScopedRouteHandle` a package's HTTP scope hands back,
 * which also carries the public URL the route answers on — at this layer there
 * is no namespace to build one from and no knowledge of the host's origin.
 */
export interface AdapterRouteHandle {
  dispose(): void;
}

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

/**
 * Methods a node route may bind. OPTIONS is excluded: the framework's CORS
 * plugin owns preflight, and a duplicate registration conflicts at startup.
 */
export type HttpMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";

export interface NodeRouteOptions {
  /** Serve sub-paths too, not just an exact path match. */
  prefix?: boolean;

  /**
   * Deliver the request body as the client sent it: unparsed and byte-exact.
   * The handler reads `req` itself; the `body` argument stays undefined.
   *
   * Without this, the body has already been parsed by the time the handler
   * runs, so a signature computed over the raw payload cannot be verified —
   * re-encoding loses key order, whitespace and duplicate keys. This is the
   * one capability a webhook endpoint cannot do without, and the reason a
   * route needs to be dispatched ahead of the body parsers rather than behind
   * them.
   */
  rawBody?: boolean;
}

export interface IHttpAdapter {
  /** Set up CORS and body-parser equivalent middleware. */
  setupMiddleware(config: {
    corsOptions?: CorsOptions;
    bodyLimit?: string;
  }): void;

  /**
   * Mount a Fetch API handler. Returns a handle whose `dispose()` removes it.
   * - exact = false (default): exact path match.
   * - exact = true: prefix match - handler also receives all sub-paths.
   *
   * Mounting a path that already holds a fetch mount of the same kind
   * replaces the previous one (last write wins).
   */
  mount(
    path: string,
    handler: FetchHandler,
    options?: {
      prefix?: boolean;
      /** @deprecated Misleading name: this always meant *prefix*, not exact. */
      exact?: boolean;
    },
  ): AdapterRouteHandle;

  /**
   * Register a GET-only route that returns a Fetch Response (for health,
   * explorer, etc.). Returns a handle whose `dispose()` removes it.
   */
  getRoute(
    path: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): AdapterRouteHandle;

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
   * whose `dispose()` removes it.
   */
  mountNodeRoute(
    method: HttpMethod,
    path: string,
    // Node route handlers may be synchronous or async; the adapter
    // fire-and-forgets the returned promise.
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      body?: unknown,
    ) => void | Promise<void>,
    options?: NodeRouteOptions,
  ): AdapterRouteHandle;

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
