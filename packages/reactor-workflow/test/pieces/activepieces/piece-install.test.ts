// Install step for non-self-contained bundles: deps declared in the bundle
// manifest are resolved by npm install (scripts ignored), then import() works.
import { existsSync } from "node:fs";
import path from "node:path";
import {
  ensurePieceBundle,
  fetchPieceBundle,
} from "../../../src/pieces/activepieces/fetch.js";
import { buildDescriptor } from "../../../src/pieces/activepieces/descriptor.js";
import { loadPieceFromDir } from "../../../src/pieces/activepieces/loader.js";
import { getActions } from "../../../src/pieces/activepieces/types.js";
import { bundleCacheDir, fetchBundleForTest } from "./bundle-cache.js";

const online = Boolean(
  await fetchBundleForTest("@activepieces/piece-http", "0.11.19"),
);

describe.skipIf(!online)("ensurePieceBundle", () => {
  it("skips the install for self-contained bundles", async () => {
    const bundle = await ensurePieceBundle({
      name: "@activepieces/piece-http",
      version: "0.11.19",
      cacheDir: bundleCacheDir,
    });
    expect(bundle.installed).toBe(false);
    expect(bundle.dependencies).toEqual({});
    expect(bundle.dir).not.toContain(".install");
  });

  it("installs a non-self-contained bundle so it becomes loadable", async () => {
    const fetched = await fetchPieceBundle({
      name: "@activepieces/piece-file-helper",
      version: "0.1.30",
      cacheDir: bundleCacheDir,
    });
    expect(fetched.dependencies).toEqual({ "@zip.js/zip.js": "2.8.15" });
    // The extracted-only bundle cannot be imported: its dep is unresolved.
    await expect(loadPieceFromDir(fetched.dir)).rejects.toThrow();

    const bundle = await ensurePieceBundle({
      name: "@activepieces/piece-file-helper",
      version: "0.1.30",
      cacheDir: bundleCacheDir,
    });
    expect(bundle.installed).toBe(true);
    expect(
      existsSync(path.join(bundle.dir, "..", "..", "@zip.js", "zip.js")),
    ).toBe(true);

    const { piece, check } = await loadPieceFromDir(bundle.dir);
    expect(check).toBe("constructor-name");
    expect(piece.displayName).toBe("Files Helper");
    const descriptor = buildDescriptor(piece, {
      packageName: "@activepieces/piece-file-helper",
      version: "0.1.30",
    });
    expect(descriptor.actions.length).toBeGreaterThan(0);
    expect(Object.keys(getActions(piece)).length).toBe(
      descriptor.actions.length,
    );
  }, 120_000);

  it("reuses a completed install from cache", async () => {
    const bundle = await ensurePieceBundle({
      name: "@activepieces/piece-file-helper",
      version: "0.1.30",
      cacheDir: bundleCacheDir,
    });
    expect(bundle.installed).toBe(true);
    expect(bundle.source).toBe("cache");
  });
});
