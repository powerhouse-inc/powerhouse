// What a published bundle has to clear: it carries its own code and loads as
// it is, or its declarations are installed beside it first.

// 739 of the 760 published pieces take the first path. This suite reaches the
// real CDN and the real npm registry rather than pretending to.
import { ensurePieceBundle } from "../../../src/pieces/activepieces/fetch.js";
import { buildDescriptor } from "../../../src/pieces/activepieces/descriptor.js";
import { loadPieceFromDir } from "../../../src/pieces/activepieces/loader.js";
import { getActions } from "../../../src/pieces/activepieces/types.js";
import { bundleCacheDir, fetchBundleForTest } from "./bundle-cache.js";

const online = Boolean(
  await fetchBundleForTest("@activepieces/piece-http", "0.11.19"),
);

describe.skipIf(!online)("a bundle that carries its own code", () => {
  it("loads straight from the cache directory, installing nothing", async () => {
    const bundle = await ensurePieceBundle({
      name: "@activepieces/piece-http",
      version: "0.11.19",
      cacheDir: bundleCacheDir,
    });
    expect(bundle.dir).not.toContain(".install");
    expect(bundle.installed).toBe(false);
    expect(bundle.dependencies).toEqual({});

    const { piece, check } = await loadPieceFromDir(bundle.dir);
    expect(check).toBe("constructor-name");
    const descriptor = buildDescriptor(piece, {
      packageName: "@activepieces/piece-http",
      version: "0.11.19",
    });
    expect(descriptor.actions.length).toBeGreaterThan(0);
    expect(Object.keys(getActions(piece)).length).toBe(
      descriptor.actions.length,
    );
  });
});

// text-helper is the case that motivated the install: every one of its 45
// releases declares jsdom, because their bundler externalises it.

// Deliberately not skipped when offline -- the point of this one is that a
// real dependency is really installed, so it has to fail if it cannot be.
describe("a published bundle that declares a dependency", () => {
  const PIECE = "@activepieces/piece-text-helper";
  const VERSION = "0.6.6";

  it("installs what it declares and loads the piece", async () => {
    const bundle = await ensurePieceBundle({
      name: PIECE,
      version: VERSION,
      cacheDir: bundleCacheDir,
    }).catch((error: unknown) => {
      throw new Error(
        `Could not install ${PIECE}@${VERSION}. This test reaches the CDN and ` +
          `the npm registry on purpose; a host with no egress is the cause ` +
          `rather than a regression. Underlying: ${String(error)}`,
      );
    });

    // Loaded out of the install, beside the jsdom it could not carry.
    expect(bundle.installed).toBe(true);
    expect(bundle.dependencies).toHaveProperty("jsdom");
    expect(bundle.dir).toContain(".install");

    const { piece } = await loadPieceFromDir(bundle.dir);
    const descriptor = buildDescriptor(piece, {
      packageName: PIECE,
      version: VERSION,
    });
    expect(descriptor.actions.length).toBeGreaterThan(0);
  }, 180_000);

  it("reuses the finished install rather than doing it again", async () => {
    const bundle = await ensurePieceBundle({
      name: PIECE,
      version: VERSION,
      cacheDir: bundleCacheDir,
    });

    expect(bundle.source).toBe("cache");
    expect(bundle.installed).toBe(true);
  }, 180_000);
});
