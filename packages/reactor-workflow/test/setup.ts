import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { stopRuntimes } from "./helpers/started-runtimes.js";

let bundleCache = "";

// Imported here, not at the top: a suite's vi.mock calls must load first.
beforeAll(async () => {
  const { setPublicPieceSources } =
    await import("../src/pieces/activepieces/fetch.js");
  const { setBundleCacheDir } = await import("../src/reactor/lib.js");
  // Offline by default: a suite that needs npm or the CDN points them somewhere.
  setPublicPieceSources({
    cdnUrl: "http://127.0.0.1:9",
    npmRegistryUrl: "http://127.0.0.1:9",
  });
  // Each suite fetches into its own cache, so fixtures of one name never alias.
  bundleCache = mkdtempSync(join(tmpdir(), "rw-bundles-"));
  setBundleCacheDir(bundleCache);
});

afterAll(async () => {
  await stopRuntimes();
  if (bundleCache) rmSync(bundleCache, { recursive: true, force: true });
});
