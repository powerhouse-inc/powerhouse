// Bundle fetching runs in the reactor process, so extraction must not block the
// event loop or inflate without a bound, and concurrent callers for the same
// bundle must not duplicate the work.
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { ensurePieceBundle } from "../../../src/pieces/activepieces/fetch.js";

// One ustar file entry, padded to the 512-byte block size.
function tarEntry(name: string, body: string): Buffer {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, "utf8");
  header.write("0000644\0", 100, 8, "utf8");
  header.write(body.length.toString(8).padStart(11, "0") + "\0", 124, 12);
  header.write("0", 156, 1, "utf8");
  header.write("ustar\0" + "00", 257, 8, "utf8");
  // Checksum over the header with the checksum field read as spaces.
  header.write("        ", 148, 8, "utf8");
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "utf8");
  const content = Buffer.alloc(Math.ceil(body.length / 512) * 512);
  content.write(body, 0, "utf8");
  return Buffer.concat([header, content]);
}

function tarball(files: Record<string, string>): Buffer {
  const entries = Object.entries(files).map(([name, body]) =>
    tarEntry(`package/${name}`, body),
  );
  return gzipSync(Buffer.concat([...entries, Buffer.alloc(1024)]));
}

const manifest = JSON.stringify({ name: "fixture", version: "1.0.0" });

describe("ensurePieceBundle hardening", () => {
  let cacheDir: string;
  let realFetch: typeof globalThis.fetch;
  let calls: number;

  beforeEach(async () => {
    cacheDir = await mkdtemp(path.join(tmpdir(), "ap-fetch-hardening-"));
    realFetch = globalThis.fetch;
    calls = 0;
  });

  afterEach(async () => {
    globalThis.fetch = realFetch;
    await rm(cacheDir, { recursive: true, force: true });
  });

  function serve(tgz: Buffer, delayMs = 0): void {
    globalThis.fetch = (async () => {
      calls += 1;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      return new Response(new Uint8Array(tgz), { status: 200 });
    }) as typeof globalThis.fetch;
  }

  it("extracts a bundle and reports the cached directory", async () => {
    serve(
      tarball({ "package.json": manifest, "index.js": "export default 1;" }),
    );
    const bundle = await ensurePieceBundle({
      name: "@scope/fixture",
      version: "1.0.0",
      cacheDir,
    });
    expect(bundle.dependencies).toEqual({});
    expect(bundle.installed).toBe(false);
    expect(bundle.dir).toContain("@scope-fixture-1.0.0");
  });

  it("shares one download between concurrent callers", async () => {
    serve(tarball({ "package.json": manifest }), 20);
    const [a, b, c] = await Promise.all([
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ]);
    expect(calls).toBe(1);
    expect(a.dir).toBe(b.dir);
    expect(b.dir).toBe(c.dir);
  });

  it("does not hold the shared promise past completion", async () => {
    serve(tarball({ "package.json": manifest }));
    const first = await ensurePieceBundle({
      name: "@scope/fixture",
      version: "1.0.0",
      cacheDir,
    });
    // Second call re-enters, but hits the on-disk cache rather than the network.
    const second = await ensurePieceBundle({
      name: "@scope/fixture",
      version: "1.0.0",
      cacheDir,
    });
    expect(calls).toBe(1);
    expect(second.source).toBe("cache");
    expect(second.dir).toBe(first.dir);
  });

  it("keys the shared promise per bundle, not globally", async () => {
    serve(tarball({ "package.json": manifest }), 20);
    await Promise.all([
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
      ensurePieceBundle({ name: "@scope/fixture", version: "2.0.0", cacheDir }),
    ]);
    expect(calls).toBe(2);
  });

  it("rejects a tarball that inflates past the cap", async () => {
    // 2 MB of zeros compresses to a few KB; the cap is lowered to 1 MB so the
    // test proves the ceiling without inflating 64 MB on a slow runner.
    const bomb = gzipSync(Buffer.alloc(2 * 1024 * 1024));
    serve(bomb);
    await expect(
      ensurePieceBundle({
        name: "@scope/fixture",
        version: "1.0.0",
        cacheDir,
        maxExtractedBytes: 1024 * 1024,
      }),
    ).rejects.toThrow(/Failed to decompress piece bundle/);
  });

  it("surfaces a fetch failure with the bundle coordinates", async () => {
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response("nope", { status: 404 }),
      )) as typeof globalThis.fetch;
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "9.9.9", cacheDir }),
    ).rejects.toThrow(/@scope\/fixture@9\.9\.9/);
  });

  // gunzip's maxOutputLength bounds decompression, but does nothing for the
  // raw transfer that runs before it — these cover that gap directly.
  function serveDeclaredContentLength(len: number): void {
    globalThis.fetch = (() => {
      calls += 1;
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-length" ? String(len) : null,
        },
        body: null,
        arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)),
      } as unknown as Response);
    }) as typeof globalThis.fetch;
  }

  // A liar Content-Length must not exempt the body from the streamed check.
  function serveStreamed(
    totalBytes: number,
    declaredContentLength?: number,
  ): void {
    globalThis.fetch = (() => {
      calls += 1;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          const chunkSize = 8 * 1024 * 1024;
          let remaining = totalBytes;
          while (remaining > 0) {
            const size = Math.min(chunkSize, remaining);
            controller.enqueue(new Uint8Array(size));
            remaining -= size;
          }
          controller.close();
        },
      });
      return Promise.resolve({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) =>
            name === "content-length" && declaredContentLength !== undefined
              ? String(declaredContentLength)
              : null,
        },
        body: stream,
      } as unknown as Response);
    }) as typeof globalThis.fetch;
  }

  it("rejects a response whose Content-Length exceeds the compressed-size cap", async () => {
    serveDeclaredContentLength(100 * 1024 * 1024);
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/exceeds the .* compressed size cap/);
  });

  it("rejects a streamed body over the cap even when Content-Length under-reports it", async () => {
    serveStreamed(64 * 1024 * 1024 + 1024, 1024);
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/exceeds the .* compressed size cap/);
  });

  it("rejects a package name that could escape the cache directory", async () => {
    await expect(
      ensurePieceBundle({ name: "../evil", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/Invalid piece package name/);
    expect(calls).toBe(0);
  });

  it("rejects a package version that could escape the cache directory", async () => {
    await expect(
      ensurePieceBundle({
        name: "@scope/fixture",
        version: "1.0.0/../../../../tmp/evil",
        cacheDir,
      }),
    ).rejects.toThrow(/Invalid piece package version/);
    expect(calls).toBe(0);
  });
});
