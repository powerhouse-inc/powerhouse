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
import { match, type MatchFunction, type ParamData } from "path-to-regexp";
import type { FetchHandler, IHttpAdapter, TlsOptions } from "./types.js";

export class ExpressHttpAdapter implements IHttpAdapter {
  readonly #app: Express;
  readonly #router: IRouter;
  readonly #handlers = new Map<
    string,
    { handler: FetchHandler; matcher: MatchFunction<ParamData> }
  >();

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    this.#app.use(middleware as any);
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
    const m = method.toLowerCase() as "delete" | "get" | "post";
    this.#app[m](path, (req: express.Request, res: express.Response) =>
      handler(req, res, req.body as unknown),
    );
  }

  setupMiddleware({
    corsOptions,
    bodyLimit = "50mb",
  }: {
    corsOptions?: CorsOptions;
    bodyLimit?: string;
  }): void {
    this.#router.use(cors(corsOptions));
    this.#router.use(bodyParser.json({ limit: bodyLimit }));
    this.#router.use(
      bodyParser.urlencoded({ extended: true, limit: bodyLimit }),
    );

    // Dispatcher registered AFTER bodyParser so req.body is populated when it fires.
    this.#router.use((req, res, next) => {
      for (const { handler, matcher } of this.#handlers.values()) {
        if (matcher(req.path)) {
          this.#serveFetchHandler(handler, req, res, next);
          return;
        }
      }
      next();
    });
  }

  mount(
    path: string,
    handler: FetchHandler,
    { exact = false }: { exact?: boolean } = {},
  ): void {
    if (exact) {
      this.#router.use(path, (req, res, next) =>
        this.#serveFetchHandler(handler, req, res, next),
      );
    } else {
      // Exact match - stored in the internal dispatch map
      this.#handlers.set(path, {
        handler,
        matcher: match(path),
      });
    }
  }

  getRoute(
    routePath: string,
    handler: (request: Request) => Response | Promise<Response>,
  ): void {
    this.#app.get(routePath, (req, res) => {
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
      const fetchRequest = new Request(url, { method: "GET", headers });
      Promise.resolve(handler(fetchRequest))
        .then(async (response) => {
          res.status(response.status);
          response.headers.forEach((value, key) => {
            res.setHeader(key, value);
          });
          res.send(await response.text());
        })
        .catch((err: unknown) => {
          res.status(500).send(String(err));
        });
    });
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
        const responseBody = await response.text();
        res.send(responseBody);
      })
      .catch(next);
  }
}

export function createExpressHttpAdapter(existingApp?: Express): {
  adapter: IHttpAdapter;
} {
  return { adapter: new ExpressHttpAdapter(existingApp) };
}
