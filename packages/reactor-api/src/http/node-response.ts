import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { RouteTransport } from "./types.js";

/** Converts Node incoming headers to Fetch Headers. */
export function fetchHeaders(req: IncomingMessage): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value === undefined) continue;
    headers.set(key, Array.isArray(value) ? value.join(", ") : value);
  }
  return headers;
}

/**
 * Where the request reached the host. `trustProxy` says whether the
 * `x-forwarded-*` headers may be believed: they are client-written, so with no
 * proxy in front a caller could pick the origin a route advertises. The `host`
 * header is always read, being the request's own target.
 */
export function resolveTransport(
  req: IncomingMessage,
  trustProxy = false,
): RouteTransport {
  const header = (name: string): string | undefined => {
    const value = req.headers[name];
    const first = Array.isArray(value) ? value[0] : value;
    return first?.split(",")[0]?.trim() || undefined;
  };
  const forwarded = (name: string): string | undefined =>
    trustProxy ? header(name) : undefined;

  const encrypted = (req.socket as { encrypted?: boolean }).encrypted === true;
  const proto =
    forwarded("x-forwarded-proto") ?? (encrypted ? "https" : "http");
  const host = forwarded("x-forwarded-host") ?? header("host") ?? "localhost";
  const prefix = forwarded("x-forwarded-prefix") ?? "";

  return { proto, host, prefix, baseUrl: `${proto}://${host}${prefix}` };
}

export class BodyTooLargeError extends Error {}

/**
 * Buffers the request body, refusing anything past `maxBytes`.
 *
 * Written with events rather than `for await`, because an async iterator
 * destroys the stream when the loop exits early — which tears down the socket
 * before a 413 can be written to it. The stream is left paused instead, so the
 * caller can answer and then close the connection deliberately.
 */
export function readBody(
  req: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;

    const settle = (error?: Error): void => {
      if (settled) return;
      settled = true;
      req.off("data", onData);
      req.off("end", onEnd);
      req.off("error", onError);
      req.pause();
      if (error) reject(error);
      else resolve(Buffer.concat(chunks));
    };

    const onData = (chunk: Buffer): void => {
      size += chunk.length;
      if (size > maxBytes) {
        settle(new BodyTooLargeError(`Body exceeds ${maxBytes} bytes`));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = (): void => settle();
    const onError = (error: Error): void => settle(error);

    req.on("data", onData);
    req.once("end", onEnd);
    req.once("error", onError);
  });
}

/**
 * Copies a Fetch Response onto a Node response, streaming the body. A HEAD
 * response carries headers only, however the handler filled the body.
 */
export async function writeResponse(
  res: ServerResponse,
  response: Response,
  method: string,
): Promise<void> {
  if (res.writableEnded || res.headersSent) return;

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });

  if (!response.body || method.toUpperCase() === "HEAD") {
    res.end();
    return;
  }

  const source = Readable.fromWeb(response.body as never);
  res.on("close", () => source.destroy());
  await pipeline(source, res);
}

/** Answers with a JSON error, unless the response is already underway. */
export function writeError(
  res: ServerResponse,
  status: number,
  message: string,
): void {
  if (res.writableEnded || res.headersSent) {
    res.destroy();
    return;
  }
  const body = JSON.stringify({ error: message });
  res.statusCode = status;
  res.setHeader("content-type", "application/json");
  res.setHeader("content-length", Buffer.byteLength(body));
  res.end(body);
}
