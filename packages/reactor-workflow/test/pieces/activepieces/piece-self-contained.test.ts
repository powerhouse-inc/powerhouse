// The bar a published bundle has to clear now that nothing installs what it
// declares: it carries its own code, or the reactor refuses to run it.
import { ensurePieceBundle } from "../../../src/pieces/activepieces/fetch.js";
import { buildDescriptor } from "../../../src/pieces/activepieces/descriptor.js";
import { loadPieceFromDir } from "../../../src/pieces/activepieces/loader.js";
import { getActions } from "../../../src/pieces/activepieces/types.js";
import { bundleCacheDir, fetchBundleForTest } from "./bundle-cache.js";

const online = Boolean(
  await fetchBundleForTest("@activepieces/piece-http", "0.11.19"),
);

describe.skipIf(!online)("ensurePieceBundle", () => {
  it("loads a self-contained bundle straight from the cache directory", async () => {
    const bundle = await ensurePieceBundle({
      name: "@activepieces/piece-http",
      version: "0.11.19",
      cacheDir: bundleCacheDir,
    });
    expect(bundle.dir).not.toContain(".install");

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

  // Published before Activepieces inlined dependencies, so its code cannot
  // run without the install this engine no longer performs.
  it("refuses a published bundle that still declares dependencies", async () => {
    await expect(
      ensurePieceBundle({
        name: "@activepieces/piece-file-helper",
        version: "0.1.30",
        cacheDir: bundleCacheDir,
      }),
    ).rejects.toThrow(
      /@activepieces\/piece-file-helper@0\.1\.30 is not self-contained: it declares a dependency \(@zip\.js\/zip\.js@2\.8\.15\)/,
    );
  }, 120_000);
});
