import { APP_SHELLS_FILE, injectAppShell } from "@powerhousedao/builder-tools";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runConnectPreview } from "../src/services/connect-preview.js";
import type { ConnectPreviewArgs } from "../src/types.js";

const PROJECT = resolve(__dirname, "../../../test/test-consumer-project");

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const srv = createServer();
    srv.once("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      const port = typeof address === "object" && address ? address.port : 0;
      srv.close(() => done(port));
    });
  });
}

let dist: string;
let switchboard: Server;
let switchboardOrigin: string;

beforeAll(async () => {
  dist = mkdtempSync(join(tmpdir(), "ph-preview-proxy-"));
  mkdirSync(dist, { recursive: true });
  const page = `<!doctype html><html><head></head><body><div id="root"></div></body></html>`;
  const shell = { body: `<div data-ph-shell="core"></div>`, head: "" };
  writeFileSync(join(dist, "index.html"), injectAppShell(page, shell));
  writeFileSync(join(dist, APP_SHELLS_FILE), JSON.stringify({ core: shell }));
  writeFileSync(join(dist, "powerhouse.config.json"), "{}");
  // Stands in for the switchboard: says which path reached it
  switchboard = createHttpServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ switchboard: req.url, method: req.method }));
  });
  const port = await freePort();
  await new Promise<void>((done) =>
    switchboard.listen(port, "127.0.0.1", done),
  );
  switchboardOrigin = `http://127.0.0.1:${port}`;
});
afterAll(async () => {
  await new Promise<void>((done) => switchboard.close(() => done()));
  rmSync(dist, { recursive: true, force: true });
});

describe("ph connect preview with a proxied switchboard", () => {
  it("leaves the switchboard's paths to the proxy, even while it swaps the shell", async () => {
    const port = await freePort();
    // A composition turns the shell swap on, which answers extensionless paths
    const server = await runConnectPreview(
      {
        outDir: dist,
        port,
        host: "127.0.0.1",
        strictPort: true,
      } as ConnectPreviewArgs,
      { connect: { composition: [] } },
      PROJECT,
      { proxy: switchboardOrigin },
    );
    const at = (path: string, init?: RequestInit) =>
      fetch(`http://127.0.0.1:${port}${path}`, init);
    try {
      const graphql = await at("/graphql", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      expect(await graphql.json()).toEqual({
        switchboard: "/graphql",
        method: "POST",
      });
      expect(await (await at("/api/pkg/oauth/callback")).json()).toMatchObject({
        switchboard: "/api/pkg/oauth/callback",
      });
      // A drive's endpoint is the switchboard's, its page Connect's
      const endpoint = await at("/d/sektar", {
        headers: { accept: "application/json" },
      });
      expect(await endpoint.json()).toMatchObject({ switchboard: "/d/sektar" });
      const page = await at("/d/sektar", { headers: { accept: "text/html" } });
      expect(await page.text()).toContain('data-ph-shell="core"');
      // Connect's own routes keep the shell
      expect(await (await at("/settings")).text()).toContain(
        'data-ph-shell="core"',
      );
    } finally {
      await server.close();
    }
  }, 60_000);
});
