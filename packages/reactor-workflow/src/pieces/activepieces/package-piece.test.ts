// A piece an installed reactor package ships, resolved for the two ways that
// package can arrive: unpacked on this disk, or loaded from a registry.

// The disk case must never become a network round-trip. A developer editing
// pieces/ has to see the change without publishing anything.
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensurePieceBundle } from "./fetch.js";
import { localFirstResolver } from "./resolver.js";
import type { LocalPiece } from "./resolver.js";

const PIECE = "@powerhousedao/piece-umh";
const VERSION = "0.1.0";

let cacheDir: string;
let fetched: string[];
let realFetch: typeof globalThis.fetch;

// The CDN, as it serves a built piece: the manifest, then the file it names.
const served: Record<string, string> = {
  "package.json": JSON.stringify({
    name: PIECE,
    version: VERSION,
    type: "module",
    main: "index.mjs",
    dependencies: {},
  }),
  "index.mjs": "export const piece = { displayName: 'UMH' };",
};

const BASE = `https://registry.example.com/-/cdn/umh@0.0.9/node/pieces/umh/`;

beforeEach(async () => {
  cacheDir = await mkdtemp(join(tmpdir(), "package-piece-"));
  fetched = [];
  realFetch = globalThis.fetch;
  globalThis.fetch = ((input: unknown) => {
    const url = String(input);
    fetched.push(url);
    const body = served[url.slice(BASE.length)];
    return Promise.resolve(
      body === undefined
        ? new Response("no", { status: 404 })
        : new Response(body, { status: 200 }),
    );
  }) as typeof globalThis.fetch;
});

afterEach(async () => {
  globalThis.fetch = realFetch;
  await rm(cacheDir, { recursive: true, force: true });
});

describe("a package piece served by a registry", () => {
  it("fetches the manifest and the module it names", async () => {
    const bundle = await ensurePieceBundle({
      name: PIECE,
      version: VERSION,
      cacheDir,
      entryUrl: `${BASE}index.mjs`,
    });

    expect(bundle.source).toBe("package");
    expect(fetched).toEqual([`${BASE}package.json`, `${BASE}index.mjs`]);
    // Cached in the shape the worker loads from, like any other bundle.
    expect(
      JSON.parse(await readFile(join(bundle.dir, "package.json"), "utf8")),
    ).toMatchObject({ name: PIECE, main: "index.mjs" });
    expect(await readFile(join(bundle.dir, "index.mjs"), "utf8")).toContain(
      "UMH",
    );
  });

  it("takes the fast path, because ph build inlines the framework", async () => {
    const bundle = await ensurePieceBundle({
      name: PIECE,
      version: VERSION,
      cacheDir,
      entryUrl: `${BASE}index.mjs`,
    });

    // First-party output declares nothing, so nothing is installed for it.
    expect(bundle.dependencies).toEqual({});
    expect(bundle.installed).toBe(false);
  });

  it("serves the cached copy rather than fetching again", async () => {
    const options = {
      name: PIECE,
      version: VERSION,
      cacheDir,
      entryUrl: `${BASE}index.mjs`,
    };
    await ensurePieceBundle(options);
    fetched.length = 0;

    const again = await ensurePieceBundle(options);

    expect(again.source).toBe("cache");
    expect(fetched).toEqual([]);
  });

  it("refuses a manifest pointing outside the piece it serves", async () => {
    served["package.json"] = JSON.stringify({
      name: PIECE,
      version: VERSION,
      main: "../../../etc/passwd",
    });

    await expect(
      ensurePieceBundle({
        name: PIECE,
        version: VERSION,
        cacheDir,
        entryUrl: `${BASE}index.mjs`,
      }),
    ).rejects.toThrow(/unusable main/);

    served["package.json"] = JSON.stringify({
      name: PIECE,
      version: VERSION,
      main: "index.mjs",
      dependencies: {},
    });
  });
});

describe("a package piece already on this disk", () => {
  const fallback = {
    resolve: vi.fn(() =>
      Promise.resolve({
        name: PIECE,
        version: VERSION,
        bundleDir: "/fetched",
        local: false,
      }),
    ),
  };

  const resolverFor = (piece: LocalPiece) =>
    localFirstResolver(() => piece, fallback);

  beforeEach(() => fallback.resolve.mockClear());

  it("runs from its own build, without asking the network", async () => {
    // What a checkout's VitePackageLoader reports: a real path.
    const resolved = await resolverFor({
      name: PIECE,
      version: VERSION,
      entryPath: "/checkout/dist/node/pieces/umh/index.mjs",
    }).resolve(PIECE, VERSION);

    expect(resolved.entryPath).toBe("/checkout/dist/node/pieces/umh/index.mjs");
    expect(resolved.local).toBe(true);
    // The whole point: a developer editing pieces/ sees the change without
    // publishing, so nothing may go to a registry for it.
    expect(fallback.resolve).not.toHaveBeenCalled();
    expect(fetched).toEqual([]);
  });

  it("runs a bundle directory from disk the same way", async () => {
    const resolved = await resolverFor({
      name: PIECE,
      version: VERSION,
      bundleDir: "/checkout/dist/node/pieces/umh",
    }).resolve(PIECE, VERSION);

    expect(resolved.bundleDir).toBe("/checkout/dist/node/pieces/umh");
    expect(fallback.resolve).not.toHaveBeenCalled();
  });

  it("fetches only when the declaration carries no path", async () => {
    await resolverFor({
      name: PIECE,
      version: VERSION,
      entryUrl: `${BASE}index.mjs`,
    }).resolve(PIECE, VERSION);

    expect(fallback.resolve).toHaveBeenCalledWith(
      PIECE,
      VERSION,
      `${BASE}index.mjs`,
    );
  });
});

describe("what ph build actually emits", () => {
  it("declares no dependencies, so the install never runs for it", async () => {
    // Read from this repo's own build output rather than asserted about.
    const manifest = join(
      import.meta.dirname,
      "../../../../workflow/dist/node/pieces/reactor/package.json",
    );
    const built = JSON.parse(await readFile(manifest, "utf8")) as {
      main?: string;
      dependencies?: Record<string, string>;
    };

    expect(built.dependencies ?? {}).toEqual({});
    expect(built.main).toBe("index.mjs");
  });
});
