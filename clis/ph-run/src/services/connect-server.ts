import { DEFAULT_CONNECT_OUTDIR } from "@powerhousedao/shared/clis";
import { isHtmlNavigation } from "@powerhousedao/shared/connect/origin-placeholder";
import { existsSync } from "node:fs";
import {
  createServer,
  request as httpRequest,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import { request as httpsRequest } from "node:https";
import net, { type Socket } from "node:net";
import path from "node:path";
import type { Duplex } from "node:stream";
import tls from "node:tls";
import sirv from "sirv";
import type { ConnectPreviewArgs } from "./classic-args.js";
import {
  cacheHeaders,
  connectBaseOf,
  isProxiedRequest,
  overrideFromEnv,
  precompressedAssets,
  serveOverrideStep,
  shellSwapFor,
  type ConnectMiddleware,
  type ConnectServeOverride,
} from "./connect-serve.js";

/**
 * Serves a built Connect with what a running app has anyway. The other way to
 * serve it is `vite preview`, which brings a bundler, Tailwind and Babel to a
 * job that reads files from a folder. This does what that does for a build,
 * step for step, apart from compressing responses: this server's traffic stays
 * on the computer, where compressing is only slower.
 */

export interface ConnectServer {
  resolvedUrls: { local: string[]; network: string[] };
  close(): Promise<void>;
}

/** The hosts a browser may reach this by: a rebinding attack needs a name. */
export function isAllowedHost(hostHeader: string | undefined): boolean {
  if (!hostHeader) return false;
  const name = hostHeader.replace(/:\d+$/, "").replace(/^\[|\]$/g, "");
  return (
    name === "localhost" || name.endsWith(".localhost") || net.isIP(name) !== 0
  );
}

const hostCheck: ConnectMiddleware = (req, res, next) => {
  if (isAllowedHost(req.headers.host)) {
    next();
    return;
  }
  res.writeHead(403, { "content-type": "text/plain" });
  res.end(`This host (${req.headers.host}) is not allowed.`);
};

const openCors: ConnectMiddleware = (req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method !== "OPTIONS") {
    next();
    return;
  }
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,PUT,PATCH,POST,DELETE",
  );
  const asked = req.headers["access-control-request-headers"];
  if (asked) {
    res.setHeader("Access-Control-Allow-Headers", asked);
    res.setHeader("Vary", "Access-Control-Request-Headers");
  }
  res.writeHead(204, { "Content-Length": "0" });
  res.end();
};

/** Requests outside the base: the root goes to it, anything else is a 404. */
function baseStep(base: string): ConnectMiddleware {
  return (req, res, next) => {
    if (base === "/") {
      next();
      return;
    }
    const url = req.url ?? "/";
    const pathname = url.split("?")[0];
    if (pathname.startsWith(base)) {
      req.url = `/${url.slice(base.length)}`;
      next();
      return;
    }
    if (pathname === "/" || pathname === "/index.html") {
      res.writeHead(302, { Location: base + url.slice(pathname.length) });
      res.end();
      return;
    }
    res.writeHead(404, { "content-type": "text/plain" });
    res.end(`This server's base is ${base}.`);
  };
}

/** Sends the switchboard's paths to it, leaving the Host header as the browser
 * sent it: the switchboard builds the URLs it hands out from that. */
function proxyStep(target: URL): ConnectMiddleware {
  const request = target.protocol === "https:" ? httpsRequest : httpRequest;
  return (req, res, next) => {
    const url = req.url ?? "/";
    if (!isProxiedRequest(url.split("?")[0], req.headers.accept)) {
      next();
      return;
    }
    const upstream = request(
      {
        hostname: target.hostname,
        port: target.port,
        method: req.method,
        path: url,
        headers: req.headers,
      },
      (answer) => {
        res.writeHead(answer.statusCode ?? 502, answer.headers);
        answer.pipe(res);
      },
    );
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502);
      res.end();
    });
    // A subscription stream ends when its reader leaves.
    res.on("close", () => upstream.destroy());
    req.pipe(upstream);
  };
}

function upgradeRequestOf(req: IncomingMessage): string {
  const headers: string[] = [];
  for (let i = 0; i < req.rawHeaders.length; i += 2) {
    headers.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
  }
  return `${req.method} ${req.url} HTTP/${req.httpVersion}\r\n${headers.join("\r\n")}\r\n\r\n`;
}

/** GraphQL's subscriptions. Its one websocket path, as a socket joined to the
 * same socket at the switchboard: everything past the handshake is theirs. */
function proxyUpgrade(
  target: URL,
  req: IncomingMessage,
  socket: Duplex,
  head: Buffer,
) {
  const pathname = (req.url ?? "/").split("?")[0];
  const isGraphql = pathname === "/graphql" || pathname.startsWith("/graphql/");
  if (!isGraphql || !isAllowedHost(req.headers.host)) {
    socket.destroy();
    return;
  }
  const secure = target.protocol === "https:";
  const port = Number(target.port || (secure ? 443 : 80));
  const upstream: Socket = secure
    ? tls.connect(port, target.hostname, { servername: target.hostname })
    : net.connect(port, target.hostname);
  const drop = () => {
    upstream.destroy();
    socket.destroy();
  };
  upstream.once(secure ? "secureConnect" : "connect", () => {
    upstream.write(upgradeRequestOf(req));
    if (head.length > 0) upstream.write(head);
    upstream.pipe(socket);
    socket.pipe(upstream);
  });
  upstream.on("error", drop);
  upstream.on("close", drop);
  socket.on("error", drop);
  socket.on("close", drop);
}

/** The file for a request: as it is, or for a page, the app that routes it. */
function assetsStep(outDir: string): ConnectMiddleware {
  const serve = sirv(outDir, { dev: true, etag: true, extensions: [] });
  return (req, res, next) => {
    serve(req, res, () => {
      const accept = req.headers.accept;
      const wantsPage =
        (req.method === "GET" || req.method === "HEAD") &&
        (!accept || isHtmlNavigation(accept) || accept.includes("*/*"));
      if (!wantsPage || !existsSync(path.join(outDir, "index.html"))) {
        next();
        return;
      }
      req.url = "/index.html";
      serve(req, res, next);
    });
  };
}

function inOrder(steps: readonly ConnectMiddleware[]) {
  return (req: IncomingMessage, res: ServerResponse) => {
    const run = (index: number) => {
      const step = steps.at(index);
      if (index >= steps.length || !step) {
        res.writeHead(404);
        res.end();
        return;
      }
      step(req, res, () => run(index + 1));
    };
    run(0);
  };
}

/** Binds `port`, or under no `strictPort` the next one free. */
function listen(
  server: Server,
  port: number,
  host: string | undefined,
  strictPort: boolean | undefined,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const attempt = (candidate: number) => {
      const onError = (error: NodeJS.ErrnoException) => {
        server.off("listening", onListening);
        if (error.code !== "EADDRINUSE") reject(error);
        else if (strictPort) {
          reject(new Error(`Port ${candidate} is already in use`));
        } else attempt(candidate + 1);
      };
      const onListening = () => {
        server.off("error", onError);
        resolve(candidate);
      };
      server.once("error", onError);
      server.once("listening", onListening);
      server.listen(candidate, host);
    };
    attempt(port);
  });
}

function noBuildMessage(
  outDirArg: string,
  outDir: string,
  dirname: string,
): string {
  const shown = path.relative(dirname, outDir) || ".";
  const build =
    path.resolve(dirname, DEFAULT_CONNECT_OUTDIR) === outDir
      ? "ph connect build"
      : `ph connect build --outDir ${outDirArg}`;
  return `No Connect build to serve: ${path.join(shown, "index.html")} is missing. Build it first with \`${build}\`.`;
}

export async function runConnectServer(
  args: ConnectPreviewArgs,
  serveOverride?: ConnectServeOverride,
  dirname = process.cwd(),
  {
    proxy,
  }: {
    /** The switchboard origin whose paths this server proxies (runner.proxy). */
    proxy?: string;
  } = {},
): Promise<ConnectServer> {
  serveOverride ??= overrideFromEnv();
  const outDir = path.resolve(dirname, args.outDir);
  if (!existsSync(path.join(outDir, "index.html"))) {
    throw new Error(noBuildMessage(args.outDir, outDir, dirname));
  }
  const base = connectBaseOf(args, outDir, dirname);
  const target = proxy ? new URL(new URL(proxy).origin) : undefined;

  const server = createServer(
    inOrder([
      cacheHeaders(outDir, base),
      precompressedAssets(outDir, base),
      ...(serveOverride
        ? [
            serveOverrideStep(
              outDir,
              serveOverride,
              base,
              shellSwapFor(outDir, serveOverride, base),
              target !== undefined,
            ),
          ]
        : []),
      openCors,
      hostCheck,
      ...(target ? [proxyStep(target)] : []),
      baseStep(base),
      assetsStep(outDir),
    ]),
  );

  // Past an upgrade Node stops tracking the socket, so this has to.
  const upgraded = new Set<Duplex>();
  if (target) {
    server.on("upgrade", (req, socket, head) => {
      upgraded.add(socket);
      socket.once("close", () => upgraded.delete(socket));
      proxyUpgrade(target, req, socket, head);
    });
  }

  const port = await listen(server, args.port, args.host, args.strictPort);
  const shown = args.host?.includes(":") ? `[${args.host}]` : args.host;
  const url = `http://${shown ?? "localhost"}:${port}${base}`;
  if (args.printUrls) console.log(`  ➜  Local:   ${url}`);
  return {
    resolvedUrls: { local: [url], network: [] },
    close: () =>
      new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
        for (const socket of upgraded) socket.destroy();
      }),
  };
}
