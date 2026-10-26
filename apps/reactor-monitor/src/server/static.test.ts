import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isLoopbackListen, projectRootsFromEnv } from "./hosting.ts";
import { createStaticHandler } from "./static.ts";

describe("createStaticHandler", () => {
  let base: string;
  let server: http.Server;
  let port: number;

  beforeEach(async () => {
    base = realpathSync(mkdtempSync(path.join(tmpdir(), "ph-monitor-static-")));
    const dist = path.join(base, "dist");
    mkdirSync(path.join(dist, "assets"), { recursive: true });
    writeFileSync(
      path.join(dist, "index.html"),
      "<html><head></head><body></body></html>",
    );
    writeFileSync(path.join(dist, "assets", "app.js"), "export {};");
    writeFileSync(path.join(base, "secret.txt"), "secret");
    symlinkSync(path.join(base, "secret.txt"), path.join(dist, "leak.txt"));
    const files = createStaticHandler({ root: dist, token: "t0k" });
    server = http.createServer(files);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });

  afterEach(async () => {
    await new Promise((r) => server.close(r));
    rmSync(base, { recursive: true, force: true });
  });

  const get = (route: string, method = "GET") =>
    new Promise<{ status: number; body: string; type?: string }>(
      (resolve, reject) => {
        const req = http.request(
          { host: "127.0.0.1", port, method, path: route },
          (res) => {
            let body = "";
            res.setEncoding("utf8");
            res.on("data", (chunk: string) => (body += chunk));
            res.on("end", () =>
              resolve({
                status: res.statusCode ?? 0,
                body,
                type: res.headers["content-type"],
              }),
            );
          },
        );
        req.on("error", reject);
        req.end();
      },
    );

  it("injects the token into index.html, for client routes too", async () => {
    for (const route of ["/", "/index.html", "/some/route"]) {
      const reply = await get(route);
      expect(reply.status).toBe(200);
      expect(reply.body).toContain(
        '<meta name="ph-monitor-controller" content="t0k"></head>',
      );
    }
  });

  it("serves assets with their type", async () => {
    const reply = await get("/assets/app.js");
    expect(reply).toMatchObject({ status: 200, body: "export {};" });
    expect(reply.type).toMatch(/^text\/javascript/);
    expect((await get("/assets/missing.js")).status).toBe(404);
  });

  it("stays inside dist", async () => {
    for (const route of [
      "/../secret.txt",
      "/%2e%2e/secret.txt",
      "/assets/..%2f..%2fsecret.txt",
      "/leak.txt",
      "/%00",
    ]) {
      const reply = await get(route);
      expect(reply.status).toBeGreaterThanOrEqual(400);
      expect(reply.body).not.toContain("secret");
    }
    expect((await get("/", "POST")).status).toBe(405);
  });
});

describe("hosting helpers", () => {
  it("accepts loopback listen hosts only", () => {
    for (const host of [undefined, "localhost", "127.0.0.1", "::1"]) {
      expect(isLoopbackListen(host)).toBe(true);
    }
    for (const host of [true, "0.0.0.0", "::", "192.168.1.2"]) {
      expect(isLoopbackListen(host)).toBe(false);
    }
  });

  it("reads project roots from the env", () => {
    expect(
      projectRootsFromEnv({
        PH_MONITOR_PROJECT_ROOTS: ["/a", " ", "/b/"].join(path.delimiter),
      }),
    ).toEqual([path.resolve("/a"), path.resolve("/b")]);
    expect(projectRootsFromEnv({})).toEqual([]);
  });
});
