import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import {
  CONTROLLER_PREFIX,
  hostRequestSchema,
  TOKEN_HEADER,
  type ErrorCode,
  type ErrorResponse,
} from "../controller/api.ts";
import { ControllerError, type MonitorController } from "./controller.ts";

const MAX_BODY_BYTES = 64 * 1024;

const STATUS: Record<ErrorCode, number> = {
  bad_host: 403,
  bad_origin: 403,
  bad_token: 401,
  bad_request: 400,
  not_found: 404,
  unknown_project: 403,
  unknown_host: 404,
  env_denied: 400,
  check_failed: 422,
  instance_limit: 409,
  shutting_down: 503,
  matrix_invalid: 400,
  matrix_limit: 409,
  run_not_found: 404,
  internal: 500,
};

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?$/;

export function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  return v4.startsWith("127.") || address === "::1";
}

/** The Host header when it names loopback on the port this socket accepted on. */
export function loopbackHost(req: IncomingMessage): string | undefined {
  // The socket, not the config: a server that also listens beyond loopback.
  if (!isLoopbackAddress(req.socket.localAddress)) return undefined;
  const host = req.headers.host?.toLowerCase() ?? "";
  const match = LOOPBACK_HOST.exec(host);
  if (!match) return undefined;
  const port = Number(match.at(2) ?? 80);
  return port === req.socket.localPort ? host : undefined;
}

function sameOrigin(req: IncomingMessage, host: string): boolean {
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return false;
  const site = req.headers["sec-fetch-site"];
  return site === undefined || site === "same-origin" || site === "none";
}

function tokenMatches(req: IncomingMessage, token: Buffer): boolean {
  const sent = req.headers[TOKEN_HEADER];
  if (typeof sent !== "string") return false;
  const given = Buffer.from(sent);
  return given.length === token.length && timingSafeEqual(given, token);
}

export function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.end(JSON.stringify(body));
}

function sendError(
  res: ServerResponse,
  code: ErrorCode,
  message: string,
  extra: Pick<ErrorResponse["error"], "issues"> = {},
): void {
  sendJson(res, STATUS[code], { error: { code, message, ...extra } });
}

class BadRequest extends Error {}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new BadRequest("request body too large");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new BadRequest("request body is not JSON");
  }
}

const sinceSchema = z.coerce.number().int().min(0).default(0);

/** Serves the controller prefix behind its guards; other paths go to `next`. */
export function createControllerHandler(options: {
  controller: MonitorController;
  token: string;
}): (req: IncomingMessage, res: ServerResponse, next: () => void) => void {
  const { controller } = options;
  const token = Buffer.from(options.token);

  const route = async (
    req: IncomingMessage,
    res: ServerResponse,
    url: URL,
  ): Promise<void> => {
    const parts = url.pathname.slice(CONTROLLER_PREFIX.length).split("/");
    const method = req.method ?? "GET";
    const [resource, id, sub] = parts;

    if (resource === "projects" && parts.length === 1 && method === "GET") {
      return sendJson(res, 200, { projects: controller.listProjects() });
    }
    if (resource === "hosts" && parts.length === 1 && method === "GET") {
      const project = url.searchParams.get("project");
      if (!project) throw new BadRequest("project is required");
      return sendJson(res, 200, { hosts: controller.hosts(project) });
    }
    if (resource === "check" && parts.length === 1 && method === "POST") {
      const request = hostRequestSchema.parse(await readJson(req));
      return sendJson(res, 200, { issues: await controller.check(request) });
    }
    if (resource !== "instances") {
      return sendError(res, "not_found", `No route ${method} ${url.pathname}`);
    }
    if (parts.length === 1) {
      if (method === "GET") {
        return sendJson(res, 200, { instances: controller.list() });
      }
      if (method === "POST") {
        const request = hostRequestSchema.parse(await readJson(req));
        return sendJson(res, 202, await controller.start(request));
      }
      if (method === "DELETE") {
        return sendJson(res, 200, { instances: await controller.stopAll() });
      }
    }
    if (id && parts.length === 2) {
      if (method === "GET") return sendJson(res, 200, controller.get(id));
      if (method === "DELETE") {
        return sendJson(res, 200, await controller.stop(id));
      }
    }
    if (id && sub === "logs" && parts.length === 3 && method === "GET") {
      const since = sinceSchema.parse(url.searchParams.get("since") ?? 0);
      return sendJson(res, 200, controller.logs(id, since));
    }
    sendError(res, "not_found", `No route ${method} ${url.pathname}`);
  };

  return (req, res, next) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (!url.pathname.startsWith(CONTROLLER_PREFIX)) return next();
    const host = loopbackHost(req);
    if (!host) return sendError(res, "bad_host", "Host is not loopback.");
    if (!sameOrigin(req, host)) {
      return sendError(res, "bad_origin", "Cross-origin requests are refused.");
    }
    if (!tokenMatches(req, token)) {
      return sendError(res, "bad_token", `Missing or wrong ${TOKEN_HEADER}.`);
    }
    route(req, res, url).catch((error: unknown) => {
      if (res.headersSent) return;
      if (error instanceof ControllerError) {
        sendError(
          res,
          error.code,
          error.message,
          error.issues ? { issues: error.issues } : {},
        );
      } else if (error instanceof z.ZodError || error instanceof BadRequest) {
        sendError(res, "bad_request", error.message);
      } else {
        sendError(
          res,
          "internal",
          error instanceof Error ? error.message : String(error),
        );
      }
    });
  };
}

/** The built app's server: index.html carries the token, so every path is Host-checked. */
export function createAppHandler(
  api: ReturnType<typeof createControllerHandler>,
  files: (req: IncomingMessage, res: ServerResponse) => void,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    if (!loopbackHost(req)) {
      return sendError(res, "bad_host", "Host is not loopback.");
    }
    api(req, res, () => files(req, res));
  };
}
