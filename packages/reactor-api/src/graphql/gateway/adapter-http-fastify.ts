import fastifyCors from "@fastify/cors";
import fastifyFormbody from "@fastify/formbody";
import fastifyMiddie from "@fastify/middie";
import devcert from "devcert";
import Fastify from "fastify";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { CorsOptions } from "cors";
import fs from "node:fs";
import http from "node:http";
import https from "node:https";
import nodePath from "node:path";
import { match, type MatchFunction, type ParamData } from "path-to-regexp";
import type { FetchHandler, IHttpAdapter, TlsOptions } from "./types.js";

/**
 * Normalises a route path for path-to-regexp v8:
 * - Collapses duplicate slashes (e.g. "//explorer" → "/explorer")
 * - Converts legacy optional-param syntax ":param?" → "{/:param}?"
 */
function normalizePath(path: string): string {
  return path.replace(/\/+/g, "/").replace(/:(\w+)\?/g, "{/:$1}");
}

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
  handler: FetchHandler;
  matcher: MatchFunction<ParamData>;
  prefix: boolean;
};

type GetEntry = {
  handler: (r: Request) => Response | Promise<Response>;
  matcher: MatchFunction<ParamData>;
};

type NodeEntry = {
  method: "DELETE" | "GET" | "POST";
  handler: (
    req: http.IncomingMessage,
    res: http.ServerResponse,
    body?: unknown,
  ) => void;
};

// Pre-listen configuration ops (need the Fastify instance to apply).
type SetupOp =
  | { kind: "cors"; options?: CorsOptions; bodyLimit: number }
  | { kind: "middie"; middleware: unknown };

export class FastifyHttpAdapter implements IHttpAdapter {
  // Dispatch maps — populated at any time (before or after listen).
  readonly #fetchRoutes: FetchEntry[] = [];
  readonly #getRoutes: Map<string, GetEntry> = new Map();
  // path → method → handler
  readonly #nodeRoutes: Map<string, Map<string, NodeEntry["handler"]>> =
    new Map();

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
    { exact = false }: { exact?: boolean } = {},
  ): void {
    this.#fetchRoutes.push({
      handler,
      // exact=false → exact path match; exact=true → prefix match.
      matcher: match(normalizePath(path), { end: !exact }),
      prefix: exact,
    });
  }

  getRoute(
    path: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): void {
    this.#getRoutes.set(path, { handler, matcher: match(normalizePath(path)) });
  }

  mountNodeRoute(
    method: "DELETE" | "GET" | "POST",
    path: string,
    handler: (
      req: http.IncomingMessage,
      res: http.ServerResponse,
      body?: unknown,
    ) => void,
  ): void {
    if (!this.#nodeRoutes.has(path)) {
      this.#nodeRoutes.set(path, new Map());
    }
    this.#nodeRoutes.get(path)!.set(method, handler);
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

    // Single catch-all route — all dispatching is done via the Maps above so
    // that routes registered after listen() are picked up automatically.
    instance.all("/*", (req, reply) => this.#dispatch(req, reply));

    await instance.ready();

    return new Promise<http.Server>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, () => {
        httpServer.off("error", reject);
        resolve(httpServer);
      });
    });
  }

  #dispatch(req: FastifyRequest, reply: FastifyReply): void | Promise<void> {
    const pathname = new URL(req.url, "http://localhost").pathname;
    const method = req.method.toUpperCase() as "DELETE" | "GET" | "POST";

    // 1. Node routes — exact path + method, handler manages raw response.
    const nodeHandlers = this.#nodeRoutes.get(pathname);
    if (nodeHandlers) {
      const handler = nodeHandlers.get(method);
      if (handler) {
        reply.hijack();
        handler(req.raw, reply.raw, req.body);
        return;
      }
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
    for (const entry of this.#fetchRoutes) {
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
  ): Promise<void> {
    const url = buildUrl(req);
    const headers = buildHeaders(req);
    const fetchReq = new Request(url, { method: "GET", headers });
    const response = await entry.handler(fetchReq);
    writeResponse(reply, response);
    return reply.send(await response.text());
  }
}

async function serveFetchHandler(
  handler: FetchHandler,
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const url = buildUrl(req);
  const headers = buildHeaders(req);

  let body: string | undefined;
  if (req.method !== "GET" && req.method !== "HEAD" && req.body !== undefined) {
    body = JSON.stringify(req.body);
  }

  const fetchRequest = new Request(url, { method: req.method, headers, body });
  const response = await handler(fetchRequest);
  writeResponse(reply, response);
  return reply.send(await response.text());
}

function buildUrl(req: FastifyRequest): string {
  const host = req.headers.host ?? "localhost";
  return `${req.protocol}://${host}${req.url}`;
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
  void reply.status(response.status);
  response.headers.forEach((value, key) => {
    void reply.header(key, value);
  });
}

export function createFastifyHttpAdapter(): { adapter: IHttpAdapter } {
  return { adapter: new FastifyHttpAdapter() };
}
