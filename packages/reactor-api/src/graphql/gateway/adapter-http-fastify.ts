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
import type { FetchHandler, IHttpAdapter, TlsOptions } from "./types.js";

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

type PendingOp =
  | { kind: "cors"; options?: CorsOptions; bodyLimit: number }
  | { kind: "mount"; path: string; handler: FetchHandler; exact: boolean }
  | {
      kind: "get";
      path: string;
      handler: (r: Request) => Response | Promise<Response>;
    }
  | {
      kind: "node-route";
      method: "DELETE" | "GET" | "POST";
      path: string;
      handler: (
        req: http.IncomingMessage,
        res: http.ServerResponse,
        body?: unknown,
      ) => void;
    }
  | { kind: "middie"; middleware: unknown };

export class FastifyHttpAdapter implements IHttpAdapter {
  readonly #pending: PendingOp[] = [];
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
    this.#pending.push({
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
    this.#pending.push({ kind: "mount", path, handler, exact });
  }

  getRoute(
    path: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): void {
    this.#pending.push({ kind: "get", path, handler });
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
    this.#pending.push({ kind: "node-route", method, path, handler });
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
      this.#pending.push({ kind: "middie", middleware });
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

    // Extract body limit from the queued cors/middleware op (if any).
    const corsOp = this.#pending.find(
      (op): op is Extract<PendingOp, { kind: "cors" }> => op.kind === "cors",
    );
    const bodyLimit = corsOp?.bodyLimit ?? 52_428_800;

    // Inject the pre-built HTTP server so Fastify uses it as-is (supports TLS).
    const instance = Fastify({
      serverFactory: (handler) => {
        httpServer.on("request", handler);
        return httpServer;
      },
      bodyLimit,
      logger: false,
    });

    this.#instance = instance;

    // Always register middie so mountRawMiddleware works after listen() too.
    await instance.register(fastifyMiddie);
    // URL-encoded body support (mirrors Express body-parser urlencoded).
    await instance.register(fastifyFormbody);

    for (const op of this.#pending) {
      await applyOp(instance, op);
    }

    await instance.ready();

    return new Promise<http.Server>((resolve, reject) => {
      httpServer.once("error", reject);
      httpServer.listen(port, () => {
        httpServer.off("error", reject);
        resolve(httpServer);
      });
    });
  }
}

async function applyOp(
  instance: FastifyInstance,
  op: PendingOp,
): Promise<void> {
  switch (op.kind) {
    case "cors":
      await instance.register(
        fastifyCors,
        // CorsOptions is structurally compatible with FastifyCorsOptions for
        // the common subset (origin, methods, allowedHeaders, credentials, …).
        op.options as Parameters<typeof fastifyCors>[1],
      );
      break;

    case "mount":
      if (op.exact) {
        // Prefix-match: route handles the path itself and all sub-paths.
        instance.all(op.path, (req, reply) =>
          serveFetchHandler(op.handler, req, reply),
        );
        instance.all(`${op.path}/*`, (req, reply) =>
          serveFetchHandler(op.handler, req, reply),
        );
      } else {
        // Exact-match.
        instance.all(op.path, (req, reply) =>
          serveFetchHandler(op.handler, req, reply),
        );
      }
      break;

    case "get":
      instance.get(op.path, async (req, reply) => {
        const url = buildUrl(req);
        const headers = buildHeaders(req);
        const fetchReq = new Request(url, { method: "GET", headers });
        const response = await op.handler(fetchReq);
        writeResponse(reply, response);
        return reply.send(await response.text());
      });
      break;

    case "node-route":
      instance.route({
        method: op.method,
        url: op.path,
        handler: (req, reply) => {
          // Hijack the raw response so the handler manages it directly,
          // bypassing Fastify's serialisation layer.
          reply.hijack();
          op.handler(req.raw, reply.raw, req.body);
        },
      });
      break;

    case "middie":
      (
        instance as FastifyInstance & {
          use(middleware: unknown): FastifyInstance;
        }
      ).use(op.middleware);
      break;
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
