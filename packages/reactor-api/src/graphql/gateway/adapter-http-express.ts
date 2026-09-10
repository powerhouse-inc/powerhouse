import bodyParser from "body-parser";
import cors from "cors";
import type { CorsOptions } from "cors";
import devcert from "devcert";
import type express from "express";
import type { Express } from "express";
import { Router } from "express";
import expressLib from "express";
import type { IRouter } from "express";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import path from "node:path";
import { Readable } from "node:stream";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { match, type MatchFunction, type ParamData } from "path-to-regexp";
import type {
  FetchHandler,
  HttpMethod,
  IHttpAdapter,
  NodeRouteOptions,
  AdapterRouteHandle,
  TlsOptions,
} from "./types.js";
import { normalizePath } from "./path-normalize.js";

type GetHandler = (r: Request) => Response | Promise<Response>;

type NodeHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body?: unknown,
) => void | Promise<void>;

type RouteEntry =
  | {
      kind: "fetch";
      path: string;
      matcher: MatchFunction<ParamData>;
      prefix: boolean;
      handler: FetchHandler;
    }
  | {
      kind: "get";
      path: string;
      matcher: MatchFunction<ParamData>;
      handler: GetHandler;
    }
  | {
      kind: "node";
      method: string;
      path: string;
      matcher: MatchFunction<ParamData>;
      handler: NodeHandler;
      /** Dispatched ahead of the body parsers, with the stream unread. */
      rawBody: boolean;
    };

export class ExpressHttpAdapter implements IHttpAdapter {
  readonly #app: Express;
  readonly #router: IRouter;

  /**
   * Every route lives in this registry and is served by one
   * permanently-registered dispatcher (installed by setupMiddleware), because
   * Express 4 has no route-removal API: routes registered directly on the
   * app or router can never be taken back. Entries iterate in registration
   * order; mounting a path that already holds a route of the same kind (and
   * method, for node routes) replaces the old entry, so re-mounting is
   * last-write-wins without accumulating.
   */
  readonly #routes = new Map<number, RouteEntry>();
  #nextHandle = 0;

  constructor(existingApp?: Express) {
    this.#app = existingApp ?? expressLib();
    this.#router = Router();
    this.#app.use(this.#router);
  }

  setupSentryErrorHandler(sentry: object): void {
    const s = sentry as {
      setupExpressErrorHandler(app: Express): void;
    };
    s.setupExpressErrorHandler(this.#app);
  }

  get handle(): unknown {
    return this.#app;
  }

  mountRawMiddleware(middleware: unknown): void {
    // Connect/Express middleware shape; the caller owns its typing.
    this.#app.use(middleware as express.RequestHandler);
  }

  mountNodeRoute(
    method: HttpMethod,
    path: string,
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      body?: unknown,
    ) => void | Promise<void>,
    { rawBody = false, prefix = false }: NodeRouteOptions = {},
  ): AdapterRouteHandle {
    this.#replaceDuplicates("node", path, method.toUpperCase());
    const handle = this.#nextHandle++;
    this.#routes.set(handle, {
      kind: "node",
      method: method.toUpperCase(),
      path,
      matcher: match(normalizePath(path), { end: !prefix }),
      rawBody,
      handler,
    });
    return { dispose: () => this.#routes.delete(handle) };
  }

  setupMiddleware({
    corsOptions,
    bodyLimit = "50mb",
  }: {
    corsOptions?: CorsOptions;
    bodyLimit?: string;
  }): void {
    this.#router.use(cors(corsOptions));

    // Ahead of the parsers: a raw route's whole point is that nothing has read
    // the stream. Behind them, `req` is a consumed stream and only a
    // re-encoded `req.body` survives — which cannot carry a signature over the
    // octets the client actually sent.
    this.#router.use((req, res, next) => {
      this.#dispatchNodeRoute(req, res, next, true);
    });

    this.#router.use(bodyParser.json({ limit: bodyLimit }));
    this.#router.use(
      bodyParser.urlencoded({ extended: true, limit: bodyLimit }),
    );

    // The single dispatch point for every registered route, registered
    // AFTER the body parsers so node routes receive a parsed req.body.
    // A request matching no route falls through to app-level middleware
    // (mountRawMiddleware) and then Express's default 404.
    this.#router.use((req, res, next) => {
      const pathname = req.path;

      // Node routes first, then GET routes, then Fetch mounts — the same
      // order the Fastify adapter uses. A node route is the most specific
      // registration there is (method plus exact path), while a Fetch mount is
      // often a prefix; letting the prefix win would silently shadow an exact
      // route, and would do it in only one of the two adapters.
      if (this.#dispatchNodeRoute(req, res, () => undefined, false)) return;

      if (req.method === "GET" || req.method === "HEAD") {
        for (const entry of this.#routes.values()) {
          if (entry.kind !== "get" || !entry.matcher(pathname)) continue;
          this.#serveGetEntry(entry, req, res);
          return;
        }
      }

      for (const entry of this.#routes.values()) {
        if (entry.kind !== "fetch" || !entry.matcher(pathname)) continue;
        this.#serveFetchHandler(entry.handler, req, res, next);
        return;
      }

      next();
    });
  }

  /**
   * Serves the first node route matching this request, or calls `next()`.
   * `raw` selects which half of the registry to consider, so the two passes —
   * one before the body parsers, one after — never serve the same route twice.
   */
  #dispatchNodeRoute(
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    raw: boolean,
  ): boolean {
    const pathname = req.path;
    for (const entry of this.#routes.values()) {
      if (entry.kind !== "node") continue;
      if (entry.rawBody !== raw) continue;
      if (entry.method !== req.method) continue;
      const matched = entry.matcher(pathname);
      if (!matched) continue;
      req.params = matched.params as Record<string, string>;
      // Fire-and-forget, as before: the node handler manages its own response
      // and the adapter does not await its promise.
      void entry.handler(req, res, entry.rawBody ? undefined : req.body);
      return true;
    }
    next();
    return false;
  }

  mount(
    path: string,
    handler: FetchHandler,
    { prefix, exact }: { prefix?: boolean; exact?: boolean } = {},
  ): AdapterRouteHandle {
    // `exact` never meant exact: it selected prefix matching. Kept as an alias
    // so existing callers keep working while the name is retired.
    const asPrefix = prefix ?? exact ?? false;
    this.#replaceDuplicates("fetch", path);
    const handle = this.#nextHandle++;
    this.#routes.set(handle, {
      kind: "fetch",
      path,
      matcher: match(normalizePath(path), { end: !asPrefix }),
      prefix: asPrefix,
      handler,
    });
    return { dispose: () => this.#routes.delete(handle) };
  }

  getRoute(
    path: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): AdapterRouteHandle {
    this.#replaceDuplicates("get", path);
    const handle = this.#nextHandle++;
    this.#routes.set(handle, {
      kind: "get",
      path,
      matcher: match(normalizePath(path)),
      handler,
    });
    return { dispose: () => this.#routes.delete(handle) };
  }

  /**
   * Drop any existing entry the new registration would duplicate (same kind
   * and path, plus method for node routes) so a re-mount replaces instead of
   * shadowing. Map iteration tolerates concurrent deletion.
   */
  #replaceDuplicates(
    kind: RouteEntry["kind"],
    path: string,
    method?: string,
  ): void {
    for (const [handle, entry] of this.#routes) {
      if (entry.kind !== kind || entry.path !== path) continue;
      if (kind === "node" && entry.kind === "node" && entry.method !== method) {
        continue;
      }
      this.#routes.delete(handle);
    }
  }

  async listen(port: number, tls?: TlsOptions): Promise<http.Server> {
    let server: http.Server;

    if (tls === true) {
      const { cert, key } = (await devcert.certificateFor("localhost")) as {
        cert: Buffer;
        key: Buffer;
      };
      if (!cert || !key) {
        throw new Error("Invalid certificate generated");
      }
      server = https.createServer({ cert, key }, this.#app);
    } else if (tls && "keyPath" in tls) {
      const currentDir = process.cwd();
      server = https.createServer(
        {
          key: fs.readFileSync(path.join(currentDir, tls.keyPath)),
          cert: fs.readFileSync(path.join(currentDir, tls.certPath)),
        },
        this.#app,
      );
    } else if (tls && "cert" in tls) {
      server = https.createServer({ cert: tls.cert, key: tls.key }, this.#app);
    } else {
      server = http.createServer(this.#app);
    }

    return new Promise<http.Server>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, () => {
        server.off("error", reject);
        resolve(server);
      });
    });
  }

  #serveFetchHandler(
    handler: FetchHandler,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ): void {
    // Build the full URL for the Fetch Request
    const protocol = req.protocol;
    const host = req.get("host") ?? "localhost";
    const url = `${protocol}://${host}${req.originalUrl}`;

    // Convert Node.js incoming headers to Fetch Headers
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      }
    }

    // bodyParser has already run, so req.body is a parsed JS value.
    // Re-serialize it so the Fetch Request body stream is readable.
    let body: string | undefined;
    if (
      req.method !== "GET" &&
      req.method !== "HEAD" &&
      req.body !== undefined
    ) {
      body = JSON.stringify(req.body);
    }

    const fetchRequest = new Request(url, {
      method: req.method,
      headers,
      body,
    });

    Promise.resolve(handler(fetchRequest))
      .then(async (response) => {
        res.status(response.status);
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        if (response.body === null) {
          res.send(await response.text());
          return;
        }
        // Stream the body to the socket instead of awaiting .text(): a
        // stream-backed body (e.g. graphql-sse) only closes when the
        // subscription completes, so awaiting would hang the request.
        // `response.body` is typed against the global (lib) ReadableStream
        // declaration, while Readable.fromWeb wants node:stream/web's; at
        // runtime they are the same stream, so the cast is safe.
        const bodyStream = response.body as WebReadableStream;
        const nodeStream = Readable.fromWeb(bodyStream);
        req.on("close", () => {
          // The client went away mid-stream; stop pulling from the source.
          nodeStream.destroy();
        });
        nodeStream.on("error", (err) => {
          if (res.headersSent) {
            // The response has already started; nothing left to say.
            res.destroy();
          } else {
            next(err);
          }
        });
        nodeStream.pipe(res);
      })
      .catch(next);
  }

  #serveGetEntry(
    entry: Extract<RouteEntry, { kind: "get" }>,
    req: express.Request,
    res: express.Response,
  ): void {
    const protocol = req.protocol;
    const host = req.get("host") ?? "localhost";
    const url = `${protocol}://${host}${req.originalUrl}`;
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (typeof value === "string") {
        headers.set(key, value);
      } else if (Array.isArray(value)) {
        headers.set(key, value.join(", "));
      }
    }
    // GET is forced (matching the pre-refactor behavior, which also
    // normalized HEAD requests through the GET route handler).
    const fetchRequest = new Request(url, { method: "GET", headers });
    Promise.resolve(entry.handler(fetchRequest))
      .then(async (response) => {
        res.status(response.status);
        response.headers.forEach((value, key) => {
          res.setHeader(key, value);
        });
        if (response.body === null) {
          res.send(await response.text());
          return;
        }
        // Stream the body to the socket instead of awaiting .text(): a
        // stream-backed body (e.g. graphql-sse) only closes when the
        // subscription completes, so awaiting would hang the request.
        // `response.body` is typed against the global (lib) ReadableStream
        // declaration, while Readable.fromWeb wants node:stream/web's; at
        // runtime they are the same stream, so the cast is safe.
        const bodyStream = response.body as WebReadableStream;
        const nodeStream = Readable.fromWeb(bodyStream);
        req.on("close", () => {
          // The client went away mid-stream; stop pulling from the source.
          nodeStream.destroy();
        });
        nodeStream.on("error", (err) => {
          if (res.headersSent) {
            // The response has already started; nothing left to say.
            res.destroy();
          } else {
            res.status(500).send(String(err));
          }
        });
        nodeStream.pipe(res);
      })
      .catch((err: unknown) => {
        res.status(500).send(String(err));
      });
  }
}

export function createExpressHttpAdapter(existingApp?: Express): {
  adapter: IHttpAdapter;
} {
  return { adapter: new ExpressHttpAdapter(existingApp) };
}
