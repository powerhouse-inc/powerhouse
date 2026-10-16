import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createServer } from "node:net";
import type { PreviewServer } from "vite";
import { runConnectPreview } from "../src/services/connect-preview.js";
import type { ConnectPreviewArgs } from "../src/types.js";
import { precompressAssets } from "../src/utils/precompress.js";

const WASM = Buffer.from("\0asm wasm body ".repeat(20_000));
const DATA = Buffer.from("pglite fs bundle ".repeat(20_000));

type Res = { status: number; headers: Record<string, unknown>; body: Buffer };

function get(port: number, path: string, headers: Record<string, string> = {}) {
  return new Promise<Res>((resolve, reject) => {
    request({ host: "127.0.0.1", port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        }),
      );
    })
      .on("error", reject)
      .end();
  });
}

function freePort(): Promise<number> {
  return new Promise((done, fail) => {
    const srv = createServer();
    srv.once("error", fail);
    srv.listen(0, "127.0.0.1", () => {
      const address = srv.address();
      srv.close(() =>
        done(typeof address === "object" && address ? address.port : 0),
      );
    });
  });
}

async function startPreview(dir: string, port: number, base = "/") {
  return runConnectPreview(
    {
      outDir: dir,
      port,
      host: "127.0.0.1",
      strictPort: true,
      connectBasePath: base,
    } as ConnectPreviewArgs,
    undefined,
    dir,
  );
}

const IMMUTABLE = "public, max-age=31536000, immutable";

describe("ph connect preview serving precompressed wasm/data", () => {
  let dir: string;
  let server: PreviewServer;
  let subServer: PreviewServer;
  let port: number;
  let subPort: number;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "ph-preview-precompressed-"));
    mkdirSync(join(dir, "assets"));
    mkdirSync(join(dir, "plain"));
    mkdirSync(join(dir, "__reactor_worker__/assets"), { recursive: true });
    mkdirSync(join(dir, "__vendor__/assets"), { recursive: true });
    writeFileSync(join(dir, "index.html"), "<html></html>");
    writeFileSync(join(dir, "assets/pglite.wasm"), WASM);
    writeFileSync(join(dir, "assets/pglite.data"), DATA);
    writeFileSync(join(dir, "assets/app.js"), "console.log(1)");
    writeFileSync(join(dir, "__reactor_worker__/assets/pglite-abc.wasm"), WASM);
    writeFileSync(join(dir, "__vendor__/assets/pglite-abc.data"), DATA);
    await precompressAssets(dir);
    // A wasm with no siblings still serves identity bytes via Vite.
    writeFileSync(join(dir, "plain/raw.wasm"), WASM);
    port = await freePort();
    subPort = await freePort();
    server = await startPreview(dir, port);
    subServer = await startPreview(dir, subPort, "/sub/");
  });

  afterAll(async () => {
    await server.close();
    await subServer.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it("serves gzip with the wasm MIME type and Vary even when br is preferred", async () => {
    const r = await get(port, "/assets/pglite.wasm", {
      "accept-encoding": "br, gzip, deflate",
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBe("gzip");
    expect(r.headers["content-type"]).toBe("application/wasm");
    expect(r.headers.vary).toContain("Accept-Encoding");
    expect(r.headers["cache-control"]).toBe(IMMUTABLE);
    expect(r.body.length).toBeLessThan(WASM.length / 10);
    expect(gunzipSync(r.body)).toEqual(WASM);
  });

  it("serves identity bytes when only br is accepted", async () => {
    const r = await get(port, "/assets/pglite.wasm", {
      "accept-encoding": "br",
    });
    expect(r.status).toBe(200);
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.body).toEqual(WASM);
  });

  it("serves gzip for .data", async () => {
    const r = await get(port, "/assets/pglite.data?v=1", {
      "accept-encoding": "gzip",
    });
    expect(r.headers["content-encoding"]).toBe("gzip");
    expect(r.headers["content-type"]).toBe("application/octet-stream");
    expect(gunzipSync(r.body)).toEqual(DATA);
  });

  it("serves identity bytes without Accept-Encoding", async () => {
    const r = await get(port, "/assets/pglite.wasm");
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.headers["content-type"]).toBe("application/wasm");
    expect(r.body).toEqual(WASM);
  });

  it("falls through to Vite for files without siblings and other types", async () => {
    const raw = await get(port, "/plain/raw.wasm", {
      "accept-encoding": "gzip",
    });
    expect(raw.status).toBe(200);
    expect(raw.headers["content-type"]).toBe("application/wasm");
    expect(raw.body).toEqual(WASM);

    const js = await get(port, "/assets/app.js", { "accept-encoding": "gzip" });
    expect(js.status).toBe(200);
    expect(js.headers["content-type"]).toMatch(/javascript/);
  });

  it("leaves range requests to Vite", async () => {
    const r = await get(port, "/assets/pglite.wasm", {
      "accept-encoding": "gzip",
      range: "bytes=0-9",
    });
    expect(r.status).toBe(206);
    expect(r.headers["content-encoding"]).toBeUndefined();
    expect(r.body).toEqual(WASM.subarray(0, 10));
  });

  it("honors a non-root base, including the worker and vendor dirs", async () => {
    for (const [path, body, type] of [
      ["/sub/assets/pglite.wasm", WASM, "application/wasm"],
      [
        "/sub/__reactor_worker__/assets/pglite-abc.wasm",
        WASM,
        "application/wasm",
      ],
      [
        "/sub/__vendor__/assets/pglite-abc.data",
        DATA,
        "application/octet-stream",
      ],
    ] as const) {
      const r = await get(subPort, path, { "accept-encoding": "gzip, br" });
      expect(r.status, path).toBe(200);
      expect(r.headers["content-encoding"], path).toBe("gzip");
      expect(r.headers["content-type"], path).toBe(type);
      expect(r.headers.vary, path).toContain("Accept-Encoding");
      expect(r.headers["cache-control"], path).toBe(IMMUTABLE);
      expect(gunzipSync(r.body)).toEqual(body);
    }
  });

  it("does not mark a missing hashed asset immutable", async () => {
    // Vite's SPA fallback answers with index.html, which must not stick.
    const r = await get(port, "/assets/missing-abc.js");
    expect(r.headers["cache-control"]).not.toBe(IMMUTABLE);
  });
});
