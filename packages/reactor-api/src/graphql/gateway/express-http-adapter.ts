import bodyParser from "body-parser";
import cors from "cors";
import type { CorsOptions } from "cors";
import type express from "express";
import { match, type MatchFunction, type ParamData } from "path-to-regexp";
import type { FetchHandler, IHttpAdapter } from "./types.js";

export class ExpressHttpAdapter implements IHttpAdapter {
  readonly #router: express.Router;
  readonly #handlers = new Map<
    string,
    { handler: FetchHandler; matcher: MatchFunction<ParamData> }
  >();

  constructor(router: express.Router) {
    this.#router = router;
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

  get(
    path: string,
    handler: (
      params: Record<string, string>,
      req: unknown,
      res: unknown,
    ) => void | Promise<void>,
  ): void {
    this.#router.get(path, (req, res) => {
      void handler(req.params as Record<string, string>, req, res);
    });
  }

  use(middleware: unknown): void {
    this.#router.use(middleware as express.RequestHandler);
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
