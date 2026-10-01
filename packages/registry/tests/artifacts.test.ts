import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { buffer } from "node:stream/consumers";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createFsArtifactStore,
  withMemoryCache,
  type ArtifactStore,
} from "../src/artifacts.js";

describe("withMemoryCache", () => {
  let dir: string;
  let store: ArtifactStore;
  let reads: string[];

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "registry-artifacts-"));
    const fsStore = createFsArtifactStore(dir);
    reads = [];
    // The file store, noting which keys reach it
    store = {
      ...fsStore,
      get: (key) => {
        reads.push(key);
        return fsStore.get(key);
      },
    };
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const put = (key: string, bytes: number) =>
    store.put(key, Buffer.alloc(bytes, key.length), "text/plain");

  it("reads a key from the store once, then from memory", async () => {
    const cache = withMemoryCache(store, {
      maxBytes: 1024,
      maxEntryBytes: 512,
    });
    await put("pkg/1.0.0/files/a.js", 100);

    const first = await cache.get("pkg/1.0.0/files/a.js");
    const second = await cache.get("pkg/1.0.0/files/a.js");
    expect(second?.body?.length).toBe(100);
    expect(await buffer(second!.stream)).toEqual(first?.body);
    expect(reads).toEqual(["pkg/1.0.0/files/a.js"]);
  });

  it("streams files larger than an entry may be", async () => {
    const cache = withMemoryCache(store, { maxBytes: 1024, maxEntryBytes: 50 });
    await put("pkg/1.0.0/files/big.js", 100);

    const big = await cache.get("pkg/1.0.0/files/big.js");
    expect(big?.body).toBeUndefined();
    expect((await buffer(big!.stream)).length).toBe(100);
    await cache.get("pkg/1.0.0/files/big.js");
    expect(reads).toHaveLength(2);
  });

  it("evicts the least recently used entries past its byte budget", async () => {
    const cache = withMemoryCache(store, { maxBytes: 250, maxEntryBytes: 200 });
    for (const name of ["a", "b", "c"]) await put(`pkg/1.0.0/${name}`, 100);

    await cache.get("pkg/1.0.0/a");
    await cache.get("pkg/1.0.0/b");
    await cache.get("pkg/1.0.0/a");
    // c pushes past 250 bytes: b is the least recently used
    await cache.get("pkg/1.0.0/c");
    reads.length = 0;
    await cache.get("pkg/1.0.0/a");
    await cache.get("pkg/1.0.0/b");
    expect(reads).toEqual(["pkg/1.0.0/b"]);
  });

  it("forgets a removed version's files", async () => {
    const cache = withMemoryCache(store, {
      maxBytes: 1024,
      maxEntryBytes: 512,
    });
    await put("pkg/1.0.0/files/a.js", 10);
    await put("pkg-b/1.0.0/files/a.js", 10);
    await cache.get("pkg/1.0.0/files/a.js");
    await cache.get("pkg-b/1.0.0/files/a.js");

    cache.evictPrefix("pkg/");
    reads.length = 0;
    await cache.get("pkg/1.0.0/files/a.js");
    await cache.get("pkg-b/1.0.0/files/a.js");
    expect(reads).toEqual(["pkg/1.0.0/files/a.js"]);
  });
});
