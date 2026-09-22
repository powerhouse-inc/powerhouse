// Bundle fetching runs in the reactor process, so extraction must not block the
// event loop or inflate without a bound, and concurrent callers for the same
// bundle must not duplicate the work.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
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

// A bundle that names code it does not carry. Age is incidental: their bundler
// still externalises what esbuild cannot trace, at any version.
const dependentManifest = JSON.stringify({
  name: "fixture",
  version: "1.0.0",
  dependencies: { "@zip.js/zip.js": "2.8.15" },
});

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
    expect(bundle.dir).toContain("@scope-fixture-1.0.0");
  });

  it("accepts a manifest that names no dependencies at all", async () => {
    serve(tarball({ "package.json": manifest }));
    const bundle = await ensurePieceBundle({
      name: "@scope/fixture",
      version: "1.0.0",
      cacheDir,
    });
    expect(bundle.source).toBe("cdn");
  });

  it("accepts a manifest whose dependencies are empty", async () => {
    serve(
      tarball({
        "package.json": JSON.stringify({
          name: "fixture",
          version: "1.0.0",
          dependencies: {},
        }),
      }),
    );
    const bundle = await ensurePieceBundle({
      name: "@scope/fixture",
      version: "1.0.0",
      cacheDir,
    });
    expect(bundle.source).toBe("cdn");
  });

  it("refuses a bundle that declares dependencies, and says why", async () => {
    serve(tarball({ "package.json": dependentManifest }));
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(
      /@scope\/fixture@1\.0\.0 is not self-contained: it declares a dependency \(@zip\.js\/zip\.js@2\.8\.15\)\..*declares no dependencies at all/s,
    );
  });

  it("asks for no pin, because the check compares no versions", async () => {
    serve(tarball({ "package.json": dependentManifest }));
    // The gate is zero declared dependencies or nothing, and a piece whose
    // bundler externalised one declares it at every release it has.
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/^(?!.*\bpin\b)(?=.*cannot run here at any version)/is);
  });

  // The number is their platform's, and has to read that way: piece semver
  // runs far behind it, and text-helper's newest release is 0.6.6.
  it("names the Activepieces release as their platform's, and only to them", async () => {
    serve(tarball({ "package.json": dependentManifest }));
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/^(?!.*0\.86\.0)/s);

    serve(tarball({ "package.json": dependentManifest }));
    await expect(
      ensurePieceBundle({
        name: "@activepieces/piece-fixture",
        version: "1.0.0",
        cacheDir,
      }),
    ).rejects.toThrow(
      /their platform 0\.86\.0 or later.*not this package's own version/s,
    );
  });

  it("caps the dependency list a refusal spells out", async () => {
    serve(
      tarball({
        "package.json": JSON.stringify({
          name: "fixture",
          version: "1.0.0",
          dependencies: Object.fromEntries(
            Array.from({ length: 7 }, (_, index) => [`dep-${index}`, "1.0.0"]),
          ),
        }),
      }),
    );
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(
      /it declares 7 dependencies \(dep-0@1\.0\.0, .*dep-4@1\.0\.0, and 2 more\)/,
    );
  });

  it("refuses a bundle already extracted into the cache directory", async () => {
    // A self-contained tarball is on offer; the cache hit must answer first.
    serve(tarball({ "package.json": manifest }));
    const dir = path.join(cacheDir, "@scope-fixture-1.0.0");
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "package.json"), dependentManifest);
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/is not self-contained/);
    expect(calls).toBe(0);
  });

  it("refuses the same bundle again rather than trusting the extraction", async () => {
    serve(tarball({ "package.json": dependentManifest }));
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/is not self-contained/);
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/is not self-contained/);
    expect(calls).toBe(1);
  });

  it("holds no refusal against the next fetch of the same bundle", async () => {
    serve(tarball({ "package.json": dependentManifest }));
    await expect(
      ensurePieceBundle({ name: "@scope/fixture", version: "1.0.0", cacheDir }),
    ).rejects.toThrow(/is not self-contained/);
    // Whoever republished it self-contained deserves an answer from the network.
    await rm(path.join(cacheDir, "@scope-fixture-1.0.0"), {
      recursive: true,
      force: true,
    });
    serve(tarball({ "package.json": manifest }));
    const bundle = await ensurePieceBundle({
      name: "@scope/fixture",
      version: "1.0.0",
      cacheDir,
    });
    expect(bundle.source).toBe("cdn");
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

  // Inflating to the 64 MB cap costs ~200ms on linux and macOS but 25-30s on
  // the Windows runner, which the package-wide 30s timeout cannot absorb.
  it("rejects a tarball that inflates past the cap", async () => {
    // 96 MB of zeros compresses to a few hundred KB; the cap is 64 MB.
    const bomb = gzipSync(Buffer.alloc(96 * 1024 * 1024));
    serve(bomb);
    await expect(
      ensurePieceBundle({
        name: "@scope/fixture",
        version: "1.0.0",
        cacheDir,
      }),
    ).rejects.toThrow(/Failed to decompress piece bundle/);
  }, 120_000);

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
