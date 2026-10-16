import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ConnectPreviewArgs } from "../src/types.js";
import {
  previewCacheControl,
  resolvePreviewBase,
  runConnectPreview,
} from "../src/services/connect-preview.js";

const PROJECT = resolve(__dirname, "../../../test/test-consumer-project");
const IMMUTABLE = "public, max-age=31536000, immutable";

function writeDist(dir: string, basePath?: string) {
  mkdirSync(join(dir, "__vendor__"), { recursive: true });
  mkdirSync(join(dir, "__reactor_worker__"), { recursive: true });
  writeFileSync(
    join(dir, "index.html"),
    "<!doctype html><html><body>shell</body></html>",
  );
  writeFileSync(join(dir, "__vendor__/zod-abc123.js"), "export {};");
  writeFileSync(join(dir, "__reactor_worker__/reactor.worker.js"), "");
  writeFileSync(
    join(dir, "powerhouse.config.json"),
    JSON.stringify(basePath ? { connect: { app: { basePath } } } : {}),
  );
}

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

let tmp: string;
beforeAll(() => {
  tmp = mkdtempSync(join(tmpdir(), "ph-preview-base-"));
});
afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
});

describe("resolvePreviewBase", () => {
  it("prefers an explicit --base", () => {
    const dist = join(tmp, "explicit");
    writeDist(dist, "/built/");
    expect(resolvePreviewBase("/cli", dist)).toBe("/cli/");
  });

  it("falls back to the basePath the dist was built with", () => {
    const dist = join(tmp, "built");
    writeDist(dist, "/connect");
    expect(resolvePreviewBase("/", dist)).toBe("/connect/");
    expect(resolvePreviewBase(undefined, dist)).toBe("/connect/");
  });

  it("leaves a root dist to the project config", () => {
    const dist = join(tmp, "root");
    writeDist(dist);
    expect(resolvePreviewBase("/", dist)).toBeUndefined();
  });
});

describe("previewCacheControl", () => {
  it("marks content-addressed files immutable and the rest revalidating", () => {
    expect(previewCacheControl("/__vendor__/zod-abc.js", "")).toBe(IMMUTABLE);
    expect(previewCacheControl("/__vendor__/chunks/x-1.js", "")).toBe(
      IMMUTABLE,
    );
    expect(previewCacheControl("/__vendor__/shared-deps.js", "")).toBe(
      "no-cache",
    );
    expect(previewCacheControl("/__react__/react-abc.js", "")).toBe(IMMUTABLE);
    expect(
      previewCacheControl("/__reactor_worker__/reactor.worker.js", "v=1"),
    ).toBe(IMMUTABLE);
    expect(
      previewCacheControl("/__reactor_worker__/reactor.worker.js", ""),
    ).toBe("no-cache");
    expect(previewCacheControl("/index.html", "")).toBeUndefined();
    for (const p of [
      "/assets/index-abc.js",
      "/fonts/inter-abc.woff2",
      "/__reactor_worker__/assets/pglite-abc.wasm",
    ]) {
      expect(previewCacheControl(p, "")).toBe(IMMUTABLE);
    }
  });
});

describe("runConnectPreview under a base path", () => {
  it("serves a dist built with a base under that base", async () => {
    const dist = join(tmp, "served");
    writeDist(dist, "/connect/");
    const port = await freePort();
    const server = await runConnectPreview(
      {
        outDir: dist,
        port,
        host: "127.0.0.1",
        strictPort: true,
        connectBasePath: "/",
      } as ConnectPreviewArgs,
      undefined,
      PROJECT,
    );
    try {
      const origin = `http://127.0.0.1:${port}`;
      const vendor = await fetch(`${origin}/connect/__vendor__/zod-abc123.js`);
      expect(vendor.status).toBe(200);
      expect(vendor.headers.get("content-type")).toContain("javascript");
      expect(vendor.headers.get("cache-control")).toBe(IMMUTABLE);

      const worker = await fetch(
        `${origin}/connect/__reactor_worker__/reactor.worker.js?v=abc`,
      );
      expect(worker.headers.get("cache-control")).toBe(IMMUTABLE);

      const page = await fetch(`${origin}/connect/d/some-drive`);
      expect(page.status).toBe(200);
      expect(await page.text()).toContain("shell");
    } finally {
      await server.close();
    }
  }, 60_000);
});
