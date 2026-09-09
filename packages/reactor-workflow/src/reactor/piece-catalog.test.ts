import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  fetchPieceCatalog,
  __resetCatalogCacheForTests,
} from "./piece-catalog.js";

// The catalog fetcher uses global fetch; stub it per test. The first-party
// merge must not depend on the cloud at all when the cloud is empty.
function stubCatalog(entries: unknown[]) {
  vi.stubGlobal(
    "fetch",
    (async (input: unknown) => {
      expect(String(input)).toContain("cloud.activepieces.com/api/v1/pieces");
      return new Response(JSON.stringify(entries), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as never,
  );
}

beforeEach(__resetCatalogCacheForTests);
afterEach(() => vi.unstubAllGlobals());

it("lists the first-party docling piece when the cloud catalog lacks it", async () => {
  stubCatalog([]);
  const catalog = await fetchPieceCatalog();
  const docling = catalog.find((p) => p.name === "@powerhousedao/piece-docling");
  expect(docling?.displayName).toBe("Docling");
  expect(docling?.actionCount).toBe(6);
  expect(docling?.triggerCount).toBe(0);
  expect(docling?.auth).toMatchObject({ type: "CUSTOM_AUTH" });
});

it("prefers the cloud entry when the same short name exists upstream", async () => {
  stubCatalog([
    {
      name: "@activepieces/piece-docling",
      version: "0.1.0",
      actions: 6,
      triggers: 0,
      auth: { type: "CUSTOM_AUTH" },
    },
  ]);
  const catalog = await fetchPieceCatalog();
  const matches = catalog.filter((p) => p.name.includes("piece-docling"));
  expect(matches).toHaveLength(1);
  expect(matches[0]?.name).toBe("@activepieces/piece-docling");
});

it("keeps server-only pieces filtered", async () => {
  stubCatalog([{ name: "@activepieces/piece-ai", version: "1.0.0", actions: 1 }]);
  const catalog = await fetchPieceCatalog();
  expect(catalog.find((p) => p.name === "@activepieces/piece-ai")).toBeUndefined();
});
