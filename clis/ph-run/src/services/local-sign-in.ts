import {
  checkSignInCode,
  LOCAL_SIGN_IN_ROUTES,
  type LocalSignInIssuer,
  type LocalSignInRefusal,
} from "@powerhousedao/shared/clis/local-sign-in";
import type { IncomingMessage, ServerResponse } from "node:http";
import net from "node:net";
import type { ConnectMiddleware } from "./connect-serve.js";

/**
 * The loopback endpoint of sign-in by link (F3d), served by the process that
 * serves Connect, under the app's base:
 *
 *   GET  __ph/sign-in   whether this server signs pages in: `{ available }`
 *   POST __ph/sign-in   `{ code, sessionDid, password? }`: a credential for
 *                       the page's session key, once per code
 *   POST __ph/renew     a bearer of that key: a new credential
 *   POST __ph/unlock    the bearer and `{ password, sessions }`: the declared
 *                       sessions' credentials
 *
 * Only for this computer: a loopback socket and no proxy, the Host one of its
 * own names with the port this server listens on, and on a POST an Origin
 * that is that host. No CORS header, so no other page reads an answer. The
 * credentials come from `issuer` (`@renown/sdk/local-sign-in`, loaded at the
 * first request); this module checks the request and the code.
 */

export interface LocalSignInOptions {
  /** The secret this start's codes are minted with. */
  secret: string;
  /** What issues the credentials; asked at the first request that needs one. */
  issuer: () => Promise<LocalSignInIssuer>;
  /** The port this server listens on: a Host naming another is refused. */
  port: () => number | undefined;
  /** The app's base path ("/" or "/<base>/"). */
  base?: string;
  now?: () => number;
  /** How often the declared sessions are renewed (default 12 hours). */
  renewEveryMs?: number;
}

export type LocalSignInStep = ConnectMiddleware & {
  /** Stops the renewal timer. */
  dispose(): void;
};

/** Wrong passwords that use a code up. */
const PASSWORD_TRIES = 5;
const MAX_BODY_BYTES = 16 * 1024;
const RENEW_EVERY_MS = 12 * 60 * 60_000;
const LOCAL_NAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const PROXY_HEADERS = ["x-forwarded-for", "x-forwarded-host", "forwarded"];

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const plain = address.replace(/^::ffff:/, "");
  return plain === "::1" || (net.isIPv4(plain) && plain.startsWith("127."));
}

function header(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name];
  return Array.isArray(value) ? value.join(",") : value;
}

function answer(res: ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  res.end(JSON.stringify(body));
}

function refused(res: ServerResponse, refusal: LocalSignInRefusal): void {
  const { ok: _ok, status, ...body } = refusal;
  answer(res, status, body);
}

/** Why this request is not this computer's own, if it is not. */
function notLocal(
  req: IncomingMessage,
  port: number | undefined,
): string | undefined {
  if (!isLoopbackAddress(req.socket.remoteAddress)) return "not-local";
  if (PROXY_HEADERS.some((name) => req.headers[name] !== undefined)) {
    return "not-local";
  }
  const host = header(req, "host")?.toLowerCase();
  const match = host && /^(\[[^\]]+\]|[^:]+):(\d+)$/.exec(host);
  if (!match || !LOCAL_NAMES.has(match[1]) || Number(match[2]) !== port) {
    return "bad-host";
  }
  const origin = header(req, "origin")?.toLowerCase();
  if (req.method === "POST" && origin !== `http://${host}`) {
    return "bad-origin";
  }
  if (
    req.method !== "POST" &&
    origin !== undefined &&
    origin !== `http://${host}`
  ) {
    return "bad-origin";
  }
  const site = header(req, "sec-fetch-site");
  if (site !== undefined && site !== "same-origin" && site !== "none") {
    return "bad-origin";
  }
  return undefined;
}

class BodyError extends Error {}

function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    if (!header(req, "content-type")?.startsWith("application/json")) {
      reject(new BodyError("a JSON body"));
      return;
    }
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new BodyError("a body under 16 KB"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("error", reject);
    req.on("end", () => {
      try {
        const value = JSON.parse(
          Buffer.concat(chunks).toString("utf8") || "{}",
        ) as unknown;
        if (
          typeof value !== "object" ||
          value === null ||
          Array.isArray(value)
        ) {
          reject(new BodyError("a JSON object"));
          return;
        }
        resolve(value as Record<string, unknown>);
      } catch {
        reject(new BodyError("a JSON object"));
      }
    });
  });
}

const stringOf = (value: unknown): string | undefined =>
  typeof value === "string" ? value : undefined;

function bearerOf(req: IncomingMessage): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header(req, "authorization") ?? "");
  return match?.[1];
}

export function localSignInStep(o: LocalSignInOptions): LocalSignInStep {
  const now = o.now ?? Date.now;
  const base = o.base ?? "/";
  const routes = {
    signIn: `${base}${LOCAL_SIGN_IN_ROUTES.signIn}`,
    renew: `${base}${LOCAL_SIGN_IN_ROUTES.renew}`,
    unlock: `${base}${LOCAL_SIGN_IN_ROUTES.unlock}`,
  };
  // Codes taken, and wrong passwords per code, until the code expires.
  const used = new Map<string, number>();
  const tries = new Map<string, number>();
  const sweep = () => {
    const at = now();
    for (const [nonce, expiresAt] of used) {
      if (expiresAt <= at) {
        used.delete(nonce);
        tries.delete(nonce);
      }
    }
  };

  let issuer: Promise<LocalSignInIssuer> | undefined;
  const issuerOf = () => {
    if (!issuer) {
      const loading = o.issuer();
      issuer = loading;
      // One that failed to load is loaded again at the next request.
      loading.catch(() => {
        if (issuer === loading) issuer = undefined;
      });
    }
    return issuer;
  };
  const timer = setInterval(() => {
    // Only an issuer a page has used holds an unlocked key.
    void issuer
      ?.then((loaded) => loaded.renewSessions())
      .catch(() => undefined);
  }, o.renewEveryMs ?? RENEW_EVERY_MS);
  timer.unref();

  async function signIn(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson(req);
    const code = stringOf(body.code);
    const sessionDid = stringOf(body.sessionDid);
    const password = stringOf(body.password);
    if (!code || !sessionDid) {
      answer(res, 400, {
        reason: "bad-request",
        error: "Send code and sessionDid.",
      });
      return;
    }
    const origin = `http://${header(req, "host")!.toLowerCase()}`;
    const check = checkSignInCode(o.secret, code, origin, now());
    if (!check.ok) {
      answer(res, 401, { reason: check.reason });
      return;
    }
    sweep();
    if (used.has(check.nonce)) {
      answer(res, 401, { reason: "used-code" });
      return;
    }
    const result = await (
      await issuerOf()
    ).signIn({
      sessionDid,
      ...(password === undefined ? {} : { password }),
    });
    if (result.ok) {
      used.set(check.nonce, check.expiresAt);
      answer(res, 200, result);
      return;
    }
    if (result.reason === "wrong-password") {
      const wrong = (tries.get(check.nonce) ?? 0) + 1;
      tries.set(check.nonce, wrong);
      if (wrong >= PASSWORD_TRIES) used.set(check.nonce, check.expiresAt);
      answer(res, 401, {
        reason: result.reason,
        triesLeft: Math.max(0, PASSWORD_TRIES - wrong),
      });
      return;
    }
    // A password asked for, or a malformed key: the code holds for the retry.
    if (result.status !== 423 && result.status !== 400) {
      used.set(check.nonce, check.expiresAt);
    }
    refused(res, result);
  }

  async function renew(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson(req);
    const bearer = bearerOf(req);
    if (!bearer) {
      answer(res, 401, { reason: "bad-bearer" });
      return;
    }
    const password = stringOf(body.password);
    const result = await (
      await issuerOf()
    ).renew({
      bearer,
      ...(password === undefined ? {} : { password }),
    });
    if (result.ok) answer(res, 200, result);
    else refused(res, result);
  }

  async function unlock(req: IncomingMessage, res: ServerResponse) {
    const body = await readJson(req);
    const bearer = bearerOf(req);
    const password = stringOf(body.password);
    const sessions = Array.isArray(body.sessions)
      ? body.sessions.filter((s): s is string => typeof s === "string")
      : undefined;
    if (!bearer) {
      answer(res, 401, { reason: "bad-bearer" });
      return;
    }
    if (password === undefined || !sessions || sessions.length === 0) {
      answer(res, 400, {
        reason: "bad-request",
        error: "Send password and sessions.",
      });
      return;
    }
    const result = await (
      await issuerOf()
    ).unlock({ bearer, password, sessions });
    if (result.ok) answer(res, 200, result);
    else refused(res, result);
  }

  const step = ((req, res, next) => {
    const pathname = (req.url ?? "/").split("?")[0];
    const route =
      pathname === routes.signIn
        ? "signIn"
        : pathname === routes.renew
          ? "renew"
          : pathname === routes.unlock
            ? "unlock"
            : undefined;
    if (!route) {
      next();
      return;
    }
    const why = notLocal(req, o.port());
    if (why) {
      answer(res, 403, { reason: why });
      return;
    }
    if (route === "signIn" && (req.method === "GET" || req.method === "HEAD")) {
      answer(res, 200, { available: true });
      return;
    }
    if (req.method !== "POST") {
      answer(res, 405, { reason: "bad-method" });
      return;
    }
    const handle = { signIn, renew, unlock }[route];
    handle(req, res).catch((error: unknown) => {
      if (res.headersSent) return;
      if (error instanceof BodyError) {
        answer(res, 400, {
          reason: "bad-request",
          error: `Send ${error.message}.`,
        });
        return;
      }
      answer(res, 500, {
        reason: "failed",
        error: error instanceof Error ? error.message : String(error),
      });
    });
  }) as LocalSignInStep;
  step.dispose = () => clearInterval(timer);
  return step;
}
