import { fileURLToPath } from "node:url";
import { fetchPieceBundle } from "../../src/activepieces/fetch.js";

// Under node_modules/.cache so lint/tsc/git all ignore it for free.
export const bundleCacheDir = fileURLToPath(
  new URL("../../node_modules/.cache/ap-bundles/", import.meta.url),
);

// Returns "" when the bundle can't be fetched (offline) so suites can skipIf.
export async function fetchBundleForTest(
  name: string,
  version: string,
): Promise<string> {
  try {
    const { dir } = await fetchPieceBundle({
      name,
      version,
      cacheDir: bundleCacheDir,
    });
    return dir;
  } catch {
    return "";
  }
}
