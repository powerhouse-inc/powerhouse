import fs from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { TOKEN_META_NAME } from "../controller/api.ts";

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".wasm": "application/wasm",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
};

function send(
  res: ServerResponse,
  status: number,
  type: string,
  body: string | Buffer,
  head: boolean,
): void {
  res.statusCode = status;
  res.setHeader("Content-Type", type);
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.end(head ? undefined : body);
}

function isInside(root: string, file: string): boolean {
  return file === root || file.startsWith(root + path.sep);
}

/** Serves `dist`, confined to it; index.html carries the token meta tag. */
export function createStaticHandler(options: {
  root: string;
  token: string;
}): (req: IncomingMessage, res: ServerResponse) => void {
  const root = fs.realpathSync(options.root);
  const index = fs
    .readFileSync(path.join(root, "index.html"), "utf8")
    .replace(
      "</head>",
      `<meta name="${TOKEN_META_NAME}" content="${options.token}"></head>`,
    );

  return (req, res) => {
    const head = req.method === "HEAD";
    if (req.method !== "GET" && !head) {
      return send(res, 405, "text/plain", "method not allowed", head);
    }
    let pathname: string;
    try {
      pathname = decodeURIComponent(
        new URL(req.url ?? "/", "http://localhost").pathname,
      );
    } catch {
      return send(res, 400, "text/plain", "bad path", head);
    }
    if (pathname.includes("\0")) {
      return send(res, 400, "text/plain", "bad path", head);
    }
    const sendIndex = () => {
      res.setHeader("Cache-Control", "no-store");
      send(res, 200, TYPES[".html"], index, head);
    };
    const file = path.resolve(root, `.${path.posix.normalize(pathname)}`);
    if (!isInside(root, file)) {
      return send(res, 404, "text/plain", "not found", head);
    }
    let real: string;
    try {
      real = fs.realpathSync(file);
    } catch {
      // Client-side routes have no extension; missing assets do.
      return path.extname(pathname)
        ? send(res, 404, "text/plain", "not found", head)
        : sendIndex();
    }
    if (!isInside(root, real)) {
      return send(res, 404, "text/plain", "not found", head);
    }
    if (
      real === path.join(root, "index.html") ||
      fs.statSync(real).isDirectory()
    ) {
      return sendIndex();
    }
    let body: Buffer;
    try {
      body = fs.readFileSync(real);
    } catch {
      return send(res, 404, "text/plain", "not found", head);
    }
    send(
      res,
      200,
      TYPES[path.extname(real).toLowerCase()] ?? "application/octet-stream",
      body,
      head,
    );
  };
}
