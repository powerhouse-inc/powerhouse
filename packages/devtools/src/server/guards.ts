import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage } from "node:http";
import { DEVTOOLS_TOKEN_HEADER } from "../api.js";

const LOOPBACK_HOST = /^(localhost|127\.0\.0\.1|\[::1\])(?::(\d+))?$/;

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const v4 = address.startsWith("::ffff:") ? address.slice(7) : address;
  return v4.startsWith("127.") || address === "::1";
}

/** Whether the server accepted this request on a loopback address: a client
 * on another machine arrives on one that is not. */
export const onLoopbackSocket = (req: IncomingMessage) =>
  isLoopbackAddress(req.socket.localAddress);

/** Headers a proxy or a tunnel adds. One that runs on this machine reaches
 * the server on loopback, for a client that may be anywhere. */
const FORWARDED_HEADERS = [
  "forwarded",
  "x-forwarded-for",
  "x-forwarded-host",
  "x-real-ip",
  "via",
];

/** The name the client asked for. HTTP/2 sends it as `:authority`. */
function requestedHost(req: IncomingMessage): string {
  const authority = req.headers[":authority"];
  const host = typeof authority === "string" ? authority : req.headers.host;
  return host?.toLowerCase() ?? "";
}

const isEncrypted = (req: IncomingMessage) =>
  "encrypted" in req.socket && req.socket.encrypted === true;

/**
 * The host the client asked for, when it names loopback on the port this
 * socket accepted on and nothing forwarded the request. A page on another
 * site whose name resolves to 127.0.0.1 (DNS rebinding) sends that site's
 * name, and a server that also listens beyond loopback (`--host`) accepts a
 * LAN client on a socket whose address is not loopback.
 */
export function loopbackHost(req: IncomingMessage): string | undefined {
  if (!onLoopbackSocket(req)) return undefined;
  if (FORWARDED_HEADERS.some((name) => req.headers[name] !== undefined)) {
    return undefined;
  }
  const host = requestedHost(req);
  const match = LOOPBACK_HOST.exec(host);
  if (!match) return undefined;
  const port = Number(match.at(2) ?? (isEncrypted(req) ? 443 : 80));
  return port === req.socket.localPort ? host : undefined;
}

/** Whether a browser sent this request from the page `host` served: another
 * origin's script, even one on another loopback port, is refused. */
export function sameOrigin(req: IncomingMessage, host: string): boolean {
  const origin = req.headers.origin;
  const own = `${isEncrypted(req) ? "https" : "http"}://${host}`;
  if (origin !== undefined && origin !== own) return false;
  const site = req.headers["sec-fetch-site"];
  return site === undefined || site === "same-origin" || site === "none";
}

export function tokenMatches(req: IncomingMessage, token: Buffer): boolean {
  const sent = req.headers[DEVTOOLS_TOKEN_HEADER];
  if (typeof sent !== "string") return false;
  const given = Buffer.from(sent);
  return given.length === token.length && timingSafeEqual(given, token);
}
