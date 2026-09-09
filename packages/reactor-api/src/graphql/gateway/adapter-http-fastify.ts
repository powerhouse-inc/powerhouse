import fastifyCors from "@fastify/cors";
import fastifyFormbody from "@fastify/formbody";
import fastifyMiddie from "@fastify/middie";
import type { CorsOptions } from "cors";
import devcert from "devcert";
import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import nodePath from "node:path";
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

/** Parses body-limit strings like "50mb" to bytes. */
function parseBodyLimit(limit: string): number {
  const m = /^(\d+(?:\.\d+)?)\s*(b|kb|mb|gb)?$/i.exec(limit.trim());
  if (!m) return 52_428_800; // 50 MB fallback
  const n = parseFloat(m[1]);
  const units: Record<string, number> = {
    b: 1,
    kb: 1_024,
    mb: 1_048_576,
    gb: 1_073_741_824,
  };
  return Math.round(n * (units[(m[2] ?? "b").toLowerCase()] ?? 1));
}

type FetchEntry = {
  path: string;
  handler: FetchHandler;
  matcher: MatchFunction<ParamData>;
  prefix: boolean;
};

type GetEntry = {
  path: string;
  handler: (r: Request) => Response | Promise<Response>;
  matcher: MatchFunction<ParamData>;
};

type NodeHandler = (
  req: http.IncomingMessage,
  res: http.ServerResponse,
  body?: unknown,
) => void;

type NodeEntry = {
  path: string;
  method: HttpMethod;
  matcher: MatchFunction<ParamData>;
  handler: NodeHandler;
  /** Claimed in the onRequest hook, before any body parsing. */
  rawBody: boolean;
};

// Pre-listen configuration ops (need the Fastify instance to apply).
type SetupOp =
  | { kind: "cors"; options?: CorsOptions; bodyLimit: number }
  | { kind: "middie"; middleware: unknown };

export class FastifyHttpAdapter implements IHttpAdapter {
  // Dispatch maps, keyed by route handle and iterated in registration
  // order — populated at any time (before or after listen). Mounting a
  // path that already holds a route of the same kind (and method, for
  // node routes) replaces the old entry, so re-mounting is last-write-
  // wins without accumulating; a handle's dispose() removes its own entry.
  readonly #fetchRoutes = new Map<number, FetchEntry>();
  readonly #getRoutes = new Map<number, GetEntry>();
  readonly #nodeRoutes = new Map<number, NodeEntry>();
  #nextHandle = 0;

  // Ops that need the Fastify instance (CORS config, Connect middleware).
  readonly #setupOps: SetupOp[] = [];

  #instance: FastifyInstance | undefined;

  get handle(): unknown {
    return this.#instance;
  }

  setupMiddleware({
    corsOptions,
    bodyLimit = "50mb",
  }: {
    corsOptions?: CorsOptions;
    bodyLimit?: string;
  }): void {
    this.#setupOps.push({
      kind: "cors",
      options: corsOptions,
      bodyLimit: parseBodyLimit(bodyLimit),
    });
  }

  mount(
    path: string,
    handler: FetchHandler,
    { prefix, exact }: { prefix?: boolean; exact?: boolean } = {},
  ): AdapterRouteHandle {
    // `exact` never meant exact: it selected prefix matching. Kept as an alias
    // so existing callers keep working while the name is retired.
    const asPrefix = prefix ?? exact ?? false;
    for (const [handle, entry] of this.#fetchRoutes) {
      if (entry.path === path) this.#fetchRoutes.delete(handle);
    }
    const handle = this.#nextHandle++;
    this.#fetchRoutes.set(handle, {
      path,
      handler,
      matcher: match(normalizePath(path), { end: !asPrefix }),
      prefix: asPrefix,
    });
    return { dispose: () => this.#fetchRoutes.delete(handle) };
  }

  getRoute(
    path: string,
    handler: (r: Request) => Response | Promise<Response>,
  ): AdapterRouteHandle {
    for (const [handle, entry] of this.#getRoutes) {
      if (entry.path === path) this.#getRoutes.delete(handle);
    }
    const handle = this.#nextHandle++;
    this.#getRoutes.set(handle, {
      path,
      handler,
      matcher: match(normalizePath(path)),
    });
    return { dispose: () => this.#getRoutes.delete(handle) };
  }

  mountNodeRoute(
    method: HttpMethod,
    path: string,
    handler: NodeHandler,
    { rawBody = false, prefix = false }: NodeRouteOptions = {},
  ): AdapterRouteHandle {
    for (const [handle, entry] of this.#nodeRoutes) {
      if (entry.path === path && entry.method === method) {
        this.#nodeRoutes.delete(handle);
      }
    }
    const handle = this.#nextHandle++;
    this.#nodeRoutes.set(handle, {
      path,
      method,
      matcher: match(normalizePath(path), { end: !prefix }),
      handler,
      rawBody,
    });
    return { dispose: () => this.#nodeRoutes.delete(handle) };
  }

  mountRawMiddleware(middleware: unknown): void {
    if (this.#instance) {
      // @fastify/middie is always registered, so .use() is available post-listen.
      (
        this.#instance as FastifyInstance & {
          use(middleware: unknown): FastifyInstance;
        }
      ).use(middleware);
    } else {
      this.#setupOps.push({ kind: "middie", middleware });
    }
  }

  setupSentryErrorHandler(sentry: object): void {
    if (!this.#instance) return;
    const s = sentry as {
      setupFastifyErrorHandler(app: FastifyInstance): void;
    };
    s.setupFastifyErrorHandler(this.#instance);
  }

  async listen(port: number, tls?: TlsOptions): Promise<http.Server> {
    let httpServer: http.Server;

    if (tls === true) {
      const { cert, key } = (await devcert.certificateFor("localhost")) as {
        cert: Buffer;
        key: Buffer;
      };
      if (!cert || !key) throw new Error("Invalid certificate generated");
      httpServer = https.createServer({ cert, key });
    } else if (tls && "keyPath" in tls) {
      const cwd = process.cwd();
      httpServer = https.createServer({
        key: fs.readFileSync(nodePath.join(cwd, tls.keyPath)),
        cert: fs.readFileSync(nodePath.join(cwd, tls.certPath)),
      });
    } else if (tls && "cert" in tls) {
      httpServer = https.createServer({ cert: tls.cert, key: tls.key });
    } else {
      httpServer = http.createServer();
    }

    const corsOp = this.#setupOps.find(
      (op): op is Extract<SetupOp, { kind: "cors" }> => op.kind === "cors",
    );
    const bodyLimit = corsOp?.bodyLimit ?? 52_428_800;

    const instance = Fastify({
      serverFactory: (handler) => {
        httpServer.on("request", handler);
        return httpServer;
      },
      bodyLimit,
      logger: false,
    });

    this.#instance = instance;

    // Always register middie first so .use() is available post-listen.
    await instance.register(fastifyMiddie);
    await instance.register(fastifyFormbody);

    for (const op of this.#setupOps) {
      if (op.kind === "cors") {
        await instance.register(
          fastifyCors,
          op.options as Parameters<typeof fastifyCors>[1],
        );
      } else {
        (
          instance as FastifyInstance & {
            use(middleware: unknown): FastifyInstance;
          }
        ).use(op.middleware);
      }
    }

    // Raw routes are claimed here, in the earliest hook there is: Fastify
    // parses the body before the handler runs, and it 415s an unknown content
    // type outright, so a route that needs the octets as sent cannot wait for
    // dispatch. `hijack()` takes the reply out of Fastify's lifecycle and the
    // handler owns the socket from here.
    instance.addHook("onRequest", (req, reply, done) => {
      const claimed = this.#matchNodeRoute(req, true);
      if (!claimed) {
        done();
        return;
      }
      (req.raw as http.IncomingMessage & { params?: ParamData }).params =
        claimed.params;
      reply.hijack();
      claimed.route.handler(req.raw, reply.raw, undefined);
    });

    // Single catch-all route — all dispatching is done via the Maps above so
    // that routes registered after listen() are picked up automatically.
    // OPTIONS is excluded because @fastify/cors registers its own OPTIONS /*
    // handler for preflight; including it here would cause a duplicate-route
    // conflict at startup.
    instance.route({
      method: ["DELETE", "GET", "HEAD", "PATCH", "POST", "PUT"],
      url: "/*",
      handler: (req, reply) => this.#dispatch(req, reply),
    });

    await instance.ready();

    return new Promise<http.Server>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, () => {
        httpServer.off("error", reject);
        resolve(httpServer);
      });
    });
  }

  /**
   * Finds a node route for this request. `raw` selects which half of the
   * registry to consider: raw routes are claimed in the onRequest hook, the
   * rest in the catch-all handler once the body is parsed.
   */
  #matchNodeRoute(
    req: FastifyRequest,
    raw: boolean,
  ): { route: NodeEntry; params: ParamData } | undefined {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const method = req.method.toUpperCase();
    for (const entry of this.#nodeRoutes.values()) {
      if (entry.rawBody !== raw) continue;
      if (entry.method !== method) continue;
      const result = entry.matcher(pathname);
      if (result) return { route: entry, params: result.params };
    }
    return undefined;
  }

  #dispatch(
    req: FastifyRequest,
    reply: FastifyReply,
  ): void | Promise<FastifyReply> {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const method = req.method.toUpperCase() as
      | "DELETE"
      | "GET"
      | "HEAD"
      | "PATCH"
      | "POST"
      | "PUT";

    // 1. Node routes — path-to-regexp match + method, handler manages raw
    // response. Attach decoded params onto `req.raw` so downstream handlers
    // can read them via the same `req.params` API the Express adapter exposes.
    const node = this.#matchNodeRoute(req, false);
    if (node) {
      (req.raw as http.IncomingMessage & { params?: ParamData }).params =
        node.params;
      reply.hijack();
      node.route.handler(req.raw, reply.raw, req.body);
      return;
    }

    // 2. GET-specific routes (health, explorer, etc.).
    if (method === "GET") {
      for (const entry of this.#getRoutes.values()) {
        if (entry.matcher(pathname)) {
          return this.#serveGetEntry(entry, req, reply);
        }
      }
    }

    // 3. Fetch routes (GraphQL handlers, SSE, etc.).
    // Iterate in reverse so that the last-mounted handler wins when the same
    // path is mounted more than once (e.g. supergraph remount after reload).
    for (const entry of [...this.#fetchRoutes.values()].reverse()) {
      if (entry.matcher(pathname)) {
        return serveFetchHandler(entry.handler, req, reply);
      }
    }

    void reply.status(404).send({
      message: `Route ${req.method}:${pathname} not found`,
      error: "Not Found",
      statusCode: 404,
    });
  }

  async #serveGetEntry(
    entry: GetEntry,
    req: FastifyRequest,
    reply: FastifyReply,
  ): Promise<FastifyReply> {
    const url = buildUrl(req);
    const headers = buildHeaders(req);
    const fetchReq = new Request(url, { method: "GET", headers });
    const response = await entry.handler(fetchReq);
    writeResponse(reply, response);
    if (response.body === null) {
      return reply.send(await response.text());
    }
    // Stream the body instead of awaiting .text(): a stream-backed body
    // (e.g. graphql-sse) only closes when the subscription completes, so
    // awaiting would hang the request. Fastify tears the source down on
    // client disconnect and routes pre-header stream errors to the
    // error handler.
    // `response.body` is typed against the global (lib) ReadableStream
    // declaration, while Readable.fromWeb wants node:stream/web's; at
    // runtime they are the same stream, so the cast is safe.
    const bodyStream = response.body as WebReadableStream;
    return reply.send(Readable.fromWeb(bodyStream));
  }
}

async function serveFetchHandler(
  handler: FetchHandler,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<FastifyReply> {
  const url = buildUrl(req);
  const headers = buildHeaders(req);
  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
    body = JSON.stringify(req.body);
  }
  const response = await handler(
    new Request(url, { method: req.method, headers, body }),
  );
  writeResponse(reply, response);
  if (response.body === null) {
    return reply.send(await response.text());
  }
  // Stream the body instead of awaiting .text(): a stream-backed body
  // (e.g. graphql-sse) only closes when the subscription completes, so
  // awaiting would hang the request. Fastify tears the source down on
  // client disconnect and routes pre-header stream errors to the
  // error handler.
  // `response.body` is typed against the global (lib) ReadableStream
  // declaration, while Readable.fromWeb wants node:stream/web's; at
  // runtime they are the same stream, so the cast is safe.
  const bodyStream = response.body as WebReadableStream;
  return reply.send(Readable.fromWeb(bodyStream));
}

function buildUrl(req: FastifyRequest): string {
  const protocol = req.protocol;
  const host = req.headers.host ?? "localhost";
  return `${protocol}://${host}${req.url}`;
}

function buildHeaders(req: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (typeof value === "string") {
      headers.set(key, value);
    } else if (Array.isArray(value)) {
      headers.set(key, value.join(", "));
    }
  }
  return headers;
}

function writeResponse(reply: FastifyReply, response: Response): void {
  reply.statusCode = response.status;
  response.headers.forEach((value, key) => {
    reply.header(key, value);
  });
}

export function createFastifyHttpAdapter(): { adapter: IHttpAdapter } {
  return { adapter: new FastifyHttpAdapter() };
}
