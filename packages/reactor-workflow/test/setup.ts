import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll } from "vitest";
import { stopRuntimes } from "./helpers/started-runtimes.js";

let bundleCache = "";

// Retention is ON by default in production (30 days). The suites journal runs
// at fixed historical dates, so a default sweep would delete the fixtures out
// from under them. Off here, at module scope so no runtime is constructed
// before it; the suites that are ABOUT retention stub it back on
// (`run-retention.test.ts`), and `runRetentionMs` takes its env explicitly, so
// the default itself is still pinned.
process.env.PH_WORKFLOWS_RUN_RETENTION_DAYS ??= "off";

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
