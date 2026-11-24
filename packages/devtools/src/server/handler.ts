import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  DEVTOOLS_API_PATH,
  DEVTOOLS_TOKEN_HEADER,
  type DevtoolsApiError,
  type DevtoolsApiErrorCode,
  type DevStackInfo,
  type ProjectReader,
} from "../api.js";
import { loopbackHost, sameOrigin, tokenMatches } from "./guards.js";

export type DevtoolsApiOptions = {
  /** What the served page sends back in the token header. */
  token: string;
  /** The dev server's base path, for example `/app/`. The API answers below
   * it and at the bare path, as the dev server's other routes do. */
  base?: string;
  /** Read at each request. */
  info: () => DevStackInfo | Promise<DevStackInfo>;
  /** Without it the `project` routes answer `not_found`. */
  project?: ProjectReader;
};

export type DevtoolsApiHandler = (
  req: IncomingMessage,
  res: ServerResponse,
  next: () => void,
) => void;

const STATUS: Record<DevtoolsApiErrorCode, number> = {
  bad_host: 403,
  bad_origin: 403,
  bad_token: 401,
  bad_method: 405,
  not_found: 404,
  internal: 500,
};

export function createDevtoolsToken(): string {
  return randomBytes(32).toString("base64url");
}

const etagOf = (revision: string) => `"${revision}"`;

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  revision?: string,
): void {
  res.statusCode = status;
  if (revision !== undefined) res.setHeader("ETag", etagOf(revision));
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function sendError(
  res: ServerResponse,
  code: DevtoolsApiErrorCode,
  message: string,
): void {
  const body: DevtoolsApiError = { error: { code, message } };
  sendJson(res, STATUS[code], body);
}

function apiPrefixes(base: string | undefined): string[] {
  const trimmed = (base ?? "/").replace(/\/+$/, "");
  return [...new Set([`${trimmed}${DEVTOOLS_API_PATH}`, DEVTOOLS_API_PATH])];
}

/**
 * Serves the DevTools API behind its guards. Every route needs a loopback
 * `Host`, the page's own origin and the page's token. Any other path goes to
 * `next`, the standalone page's included.
 */
export function createDevtoolsApiHandler(
  options: DevtoolsApiOptions,
): DevtoolsApiHandler {
  const token = Buffer.from(options.token);
  const prefixes = apiPrefixes(options.base);

  /** Routes that name one item by an escaped segment. */
  const ITEM_ROUTES: [
    string,
    (
      reader: ProjectReader,
      name: string,
    ) => Promise<{ revision: string } | undefined>,
  ][] = [
    ["project/document-models/", (reader, name) => reader.documentModel(name)],
    ["project/files/", (reader, name) => reader.file(name)],
  ];

  const readProject = (
    reader: ProjectReader,
    path: string,
  ): Promise<{ revision: string } | undefined> | undefined => {
    if (path === "project") return reader.snapshot();
    if (path === "project/files") return reader.fileList();
    for (const [prefix, read] of ITEM_ROUTES) {
      if (!path.startsWith(prefix)) continue;
      let name: string;
      try {
        name = decodeURIComponent(path.slice(prefix.length));
      } catch {
        // A malformed escape names nothing.
        return undefined;
      }
      return read(reader, name);
    }
    return undefined;
  };

  const route = async (
    req: IncomingMessage,
    res: ServerResponse,
    path: string,
  ): Promise<void> => {
    const reader =
      path === "project" || path.startsWith("project/")
        ? options.project
        : undefined;
    const notFound = () =>
      sendError(res, "not_found", `No DevTools route "${path}".`);
    if (path !== "info" && !reader) return notFound();
    if (req.method !== "GET") {
      res.setHeader("Allow", "GET");
      return sendError(res, "bad_method", "This route answers GET only.");
    }
    if (!reader) return sendJson(res, 200, await options.info());

    const notModified = (revision: string) => {
      if (req.headers["if-none-match"] !== etagOf(revision)) return false;
      res.statusCode = 304;
      res.setHeader("ETag", etagOf(revision));
      res.end();
      return true;
    };
    // The snapshot is the route the page polls: its revision is known before
    // the project is read. The others answer only for what they find.
    if (path === "project" && notModified(await reader.revision())) return;
    const answer = await readProject(reader, path);
    if (answer === undefined) return notFound();
    if (notModified(answer.revision)) return;
    sendJson(res, 200, answer, answer.revision);
  };

  return (req, res, next) => {
    let pathname: string;
    try {
      ({ pathname } = new URL(req.url ?? "/", "http://localhost"));
    } catch {
      // A request target that is no URL names no API path.
      return next();
    }
    const prefix = prefixes.find(
      (candidate) =>
        pathname === candidate || pathname.startsWith(`${candidate}/`),
    );
    if (prefix === undefined) return next();

    const host = loopbackHost(req);
    if (!host) return sendError(res, "bad_host", "Host is not loopback.");
    if (!sameOrigin(req, host)) {
      return sendError(res, "bad_origin", "Cross-origin requests are refused.");
    }
    if (!tokenMatches(req, token)) {
      return sendError(
        res,
        "bad_token",
        `Missing or wrong ${DEVTOOLS_TOKEN_HEADER}.`,
      );
    }
    route(req, res, pathname.slice(prefix.length + 1)).catch(
      (error: unknown) => {
        if (res.headersSent) return;
        sendError(
          res,
          "internal",
          error instanceof Error ? error.message : String(error),
        );
      },
    );
  };
}
