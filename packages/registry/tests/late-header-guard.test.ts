import express from "express";
import type { AddressInfo } from "node:net";
import type http from "node:http";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  abortTarballOnClose,
  ignoreLateContentLength,
} from "../src/late-header-guard.js";

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

// Serves `path` like Verdaccio's tarball route: a slow body, stopped on "abort"
async function serveSlowBody(path: string) {
  const app = express();
  app.use(abortTarballOnClose);
  let aborted = false;
  let finish: (() => void) | undefined;
  app.get(/.*/, (req, res) => {
    req.on("abort", () => {
      aborted = true;
    });
    res.write("part");
    finish = () => res.end();
  });
  server = app.listen(0);
  await new Promise((resolve) => server!.once("listening", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://localhost:${port}${path}`,
    aborted: () => aborted,
    finish: () => finish?.(),
  };
}

describe("abortTarballOnClose", () => {
  it("signals abort when the client leaves a tarball download", async () => {
    const served = await serveSlowBody("/pkg/-/pkg-1.0.0.tgz");
    const controller = new AbortController();
    const response = await fetch(served.url, { signal: controller.signal });
    controller.abort();
    await response.text().catch(() => undefined);
    await vi.waitFor(() => expect(served.aborted()).toBe(true));
  });

  it("leaves a completed download alone", async () => {
    const served = await serveSlowBody("/pkg/-/pkg-1.0.0.tgz");
    const response = await fetch(served.url);
    served.finish();
    expect(await response.text()).toBe("part");
    expect(served.aborted()).toBe(false);
  });
});
