import express from "express";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterEach, describe, expect, it } from "vitest";
import { ignoreLateContentLength } from "../src/late-header-guard.js";

let server: http.Server | undefined;

afterEach(() => new Promise<void>((resolve) => server?.close(() => resolve())));

// Serves `path` like Verdaccio's tarball route under the race: body first, size after
async function serveLateSize(path: string, guarded: boolean) {
  const app = express();
  if (guarded) app.use(ignoreLateContentLength);
  const errors: unknown[] = [];
  app.get(/.*/, (_req, res) => {
    res.write("tarball");
    try {
      res.header("content-length", "7");
    } catch (err) {
      errors.push(err);
    }
    res.end();
  });
  server = app.listen(0);
  await new Promise((resolve) => server!.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  const response = await fetch(`http://localhost:${port}${path}`);
  return { body: await response.text(), errors };
}

describe("ignoreLateContentLength", () => {
  it("skips a content-length set after a tarball's body started", async () => {
    const result = await serveLateSize("/pkg/-/pkg-1.0.0.tgz", true);
    expect(result).toEqual({ body: "tarball", errors: [] });
  });

  it("leaves other routes to throw as before", async () => {
    const result = await serveLateSize("/pkg", true);
    expect(result.errors).toHaveLength(1);
  });

  it("throws without the guard, as the unguarded route does", async () => {
    const result = await serveLateSize("/pkg/-/pkg-1.0.0.tgz", false);
    expect(result.errors).toMatchObject([{ code: "ERR_HTTP_HEADERS_SENT" }]);
  });
});
