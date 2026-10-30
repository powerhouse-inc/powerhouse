// A piece that sets NODE_TLS_REJECT_UNAUTHORIZED=0 (old pieces-common does,
// on every request) must not switch certificate checks off for the worker:
// the guard makes every connection verify unless it explicitly asks not to.
import { readFileSync } from "node:fs";
import https from "node:https";
import type { AddressInfo } from "node:net";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { installTlsGuard } from "../../../src/pieces/activepieces/worker/tls-guard.js";

const fixture = (name: string) =>
  readFileSync(new URL(`../../fixtures/tls/${name}`, import.meta.url));

/** A server with a self-signed certificate (test-only, for localhost / 127.0.0.1). */
async function selfSigned(): Promise<{
  url: string;
  close: () => Promise<void>;
}> {
  const server = https.createServer(
    { key: fixture("localhost-key.pem"), cert: fixture("localhost-cert.pem") },
    (_req, res) => {
      res.writeHead(200, { "content-type": "text/plain", connection: "close" });
      res.end("ok");
    },
  );
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `https://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

function get(url: string, options: https.RequestOptions = {}): Promise<number> {
  return new Promise((resolve, reject) => {
    https
      .get(url, { ...options, agent: false }, (res) => {
        res.resume();
        resolve(res.statusCode ?? 0);
      })
      .on("error", reject);
  });
}

describe("the worker's TLS guard", () => {
  const before = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  let undo: (() => void) | undefined;
  const servers: { close: () => Promise<void> }[] = [];
  const server = async () => {
    const s = await selfSigned();
    servers.push(s);
    return s.url;
  };

  beforeAll(() => {
    // What an old pieces-common does before every request
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  });
  afterEach(() => {
    undo?.();
    undo = undefined;
  });
  afterAll(async () => {
    await Promise.all(servers.map((s) => s.close()));
    if (before === undefined) delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    else process.env.NODE_TLS_REJECT_UNAUTHORIZED = before;
  });

  it("without it, the variable lets an unverifiable certificate through (the hole)", async () => {
    expect(await get(await server())).toBe(200);
  });

  it("with it, https and fetch check the certificate whatever the variable says", async () => {
    undo = installTlsGuard();
    await expect(get(await server())).rejects.toThrow(/self[- ]signed/i);
    const url = await server();
    const failed = await fetch(url).then(
      () => null,
      (e: unknown) => e as { cause?: { code?: string } },
    );
    expect(failed?.cause?.code).toMatch(/SELF_SIGNED/);
  });

  it("still lets a caller that explicitly asks skip the check", async () => {
    undo = installTlsGuard();
    expect(await get(await server(), { rejectUnauthorized: false })).toBe(200);
  });

  it("comes off again", async () => {
    installTlsGuard()();
    expect(await get(await server())).toBe(200);
  });
});
