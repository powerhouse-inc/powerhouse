import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { ensurePieceBundle } from "./fetch.js";
import { setPieceRegistryUrl } from "./registry-source.js";

// Every source refuses, so the attempt itself is what the test reads: the
// download never gets far enough to write anything into the cache directory.
function recordingFetch(): string[] {
  const urls: string[] = [];
  vi.stubGlobal("fetch", ((input: unknown) => {
    urls.push(String(input));
    return Promise.resolve(new Response("nope", { status: 404 }));
  }) as never);
  return urls;
}

const cacheDir = path.join(os.tmpdir(), "ph-workflow-fetch-test");

afterEach(() => {
  vi.unstubAllGlobals();
  setPieceRegistryUrl(undefined);
});

it("asks the Activepieces CDN and npm when no registry is configured", async () => {
  const urls = recordingFetch();
  await expect(
    ensurePieceBundle({ name: "piece-a", version: "1.0.0", cacheDir }),
  ).rejects.toThrow(/Failed to fetch piece bundle/);
  expect(urls).toEqual([
    "https://cdn.activepieces.com/pieces/bundled/piece-a-1.0.0.tgz",
    "https://registry.npmjs.org/piece-a/-/piece-a-1.0.0.tgz",
  ]);
});

it("asks the host's registry first, at the pinned version", async () => {
  setPieceRegistryUrl("https://registry.example.com");
  const urls = recordingFetch();
  await expect(
    ensurePieceBundle({ name: "piece-a", version: "1.0.0", cacheDir }),
  ).rejects.toThrow(/Failed to fetch piece bundle/);
  expect(urls[0]).toBe(
    "https://registry.example.com/-/pieces/bundled/piece-a-1.0.0.tgz",
  );
  expect(urls).toHaveLength(3);
});

it("falls through to the public sources when the registry does not have it", async () => {
  setPieceRegistryUrl("https://registry.example.com");
  const urls = recordingFetch();
  await expect(
    ensurePieceBundle({ name: "piece-a", version: "1.0.0", cacheDir }),
  ).rejects.toThrow(/Failed to fetch piece bundle/);
  // Registry, then their CDN, then npm — a 404 from ours is not the end.
  expect(urls).toEqual([
    "https://registry.example.com/-/pieces/bundled/piece-a-1.0.0.tgz",
    "https://cdn.activepieces.com/pieces/bundled/piece-a-1.0.0.tgz",
    "https://registry.npmjs.org/piece-a/-/piece-a-1.0.0.tgz",
  ]);
});
