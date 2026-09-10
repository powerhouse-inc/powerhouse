import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import {
  checkForNewerVersion,
  formatOutdatedNotice,
  type VersionCheckDeps,
} from "../version-check.js";

const REGISTRY = "https://registry.npmjs.org";

function makeDeps(overrides: Partial<VersionCheckDeps> = {}): {
  deps: VersionCheckDeps;
  fetchCalls: Array<{ url: string; signal?: AbortSignal }>;
  written: string[];
} {
  const fetchCalls: Array<{ url: string; signal?: AbortSignal }> = [];
  const written: string[] = [];
  const { cachePath = "", ...rest } = overrides;
  const deps: VersionCheckDeps = {
    fetch: (url, init) => {
      fetchCalls.push({ url: String(url), signal: init?.signal });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ version: "6.3.0" }),
      } as unknown as Response);
    },
    now: () => 1_000_000,
    readFile: () => Promise.reject(new Error("ENOENT")),
    writeFile: (_p, contents) => {
      written.push(String(contents));
      return Promise.resolve();
    },
    ...rest,
    cachePath,
  };
  return { deps, fetchCalls, written };
}

describe("checkForNewerVersion", () => {
  let dir: string;
  let cachePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "ph-cmd-check-"));
    cachePath = path.join(dir, "cache.json");
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("returns a fresh cache without fetching (TTL not expired)", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath,
      readFile: () =>
        Promise.resolve(
          JSON.stringify({
            checkedAt: new Date(999_000).toISOString(), // 1s before `now`
            stream: "latest",
            target: "6.3.0",
          }),
        ),
    });
    const result = await checkForNewerVersion({
      currentVersion: "6.2.2",
      deps,
    });
    expect(result?.stream).toBe("latest");
    expect(result?.target).toBe("6.3.0");
    expect(fetchCalls).toHaveLength(0);
  });

  it("fetches the stream endpoint when the cache is missing", async () => {
    const { deps, fetchCalls } = makeDeps({ cachePath });
    const result = await checkForNewerVersion({
      currentVersion: "6.2.2",
      deps,
    });
    expect(result?.stream).toBe("latest");
    expect(result?.target).toBe("6.3.0");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`${REGISTRY}/ph-cmd/latest`);
    expect(fetchCalls[0].signal).toBeInstanceOf(AbortSignal);
  });

  it("resolves the dev stream from a prerelease current version", async () => {
    const { deps, fetchCalls } = makeDeps({ cachePath });
    const result = await checkForNewerVersion({
      currentVersion: "6.2.3-dev.1",
      deps,
    });
    expect(result?.stream).toBe("dev");
    expect(fetchCalls[0].url).toBe(`${REGISTRY}/ph-cmd/dev`);
  });

  it("persists the cache after a successful fetch", async () => {
    const { deps, written } = makeDeps({ cachePath });
    await checkForNewerVersion({ currentVersion: "6.2.2", deps });
    expect(written).toHaveLength(1);
    const parsed = JSON.parse(written[0]) as {
      checkedAt: string;
      stream: string;
      target: string;
    };
    expect(parsed.checkedAt).toBe(new Date(1_000_000).toISOString());
    expect(parsed.stream).toBe("latest");
    expect(parsed.target).toBe("6.3.0");
  });

  it("refetches when the cache stream no longer matches the running build", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath,
      readFile: () =>
        Promise.resolve(
          JSON.stringify({
            checkedAt: new Date(999_000).toISOString(),
            stream: "dev",
            target: "6.3.0",
          }),
        ),
    });
    await checkForNewerVersion({ currentVersion: "6.2.2", deps });
    expect(fetchCalls).toHaveLength(1); // fresh timestamp but wrong stream
  });

  it("keeps a stale cache when the fetch fails (silent, no throw)", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath,
      // ~27.5 h after the epoch — beyond the 24 h TTL relative to checkedAt 0.
      now: () => 99_000_000,
      readFile: () =>
        Promise.resolve(
          JSON.stringify({
            checkedAt: new Date(0).toISOString(), // stale
            stream: "latest",
            target: "6.2.9",
          }),
        ),
      fetch: (url, init) => {
        fetchCalls.push({ url: String(url), signal: init?.signal });
        return Promise.reject(new Error("offline"));
      },
    });
    const result = await checkForNewerVersion({
      currentVersion: "6.2.2",
      deps,
    });
    expect(fetchCalls).toHaveLength(1);
    expect(result?.stream).toBe("latest");
    expect(result?.target).toBe("6.2.9");
  });

  it("returns no result when the fetch fails and there is no cache", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath,
      fetch: (url, init) => {
        fetchCalls.push({ url: String(url), signal: init?.signal });
        return Promise.reject(new Error("offline"));
      },
    });
    const result = await checkForNewerVersion({
      currentVersion: "6.2.2",
      deps,
    });
    expect(fetchCalls).toHaveLength(1);
    expect(result).toBeNull();
  });

  it("treats a corrupt cache file as missing (fetches, no throw)", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath,
      readFile: () => Promise.resolve("not-json{"),
    });
    const result = await checkForNewerVersion({
      currentVersion: "6.2.2",
      deps,
    });
    expect(fetchCalls).toHaveLength(1);
    expect(result?.target).toBe("6.3.0");
  });

  it("ignores a non-200 response (falls back like any fetch failure)", async () => {
    const { deps, fetchCalls } = makeDeps({
      cachePath,
      fetch: (url, init) => {
        fetchCalls.push({ url: String(url), signal: init?.signal });
        return Promise.resolve({
          ok: false,
          status: 404,
          json: () => Promise.resolve({}),
        } as unknown as Response);
      },
    });
    const result = await checkForNewerVersion({
      currentVersion: "6.2.2",
      deps,
    });
    expect(fetchCalls).toHaveLength(1);
    expect(result).toBeNull();
  });

  it("ignores a 200 response without a usable version", async () => {
    const { deps } = makeDeps({
      cachePath,
      fetch: () =>
        Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}),
        } as unknown as Response),
    });
    const result = await checkForNewerVersion({
      currentVersion: "6.2.2",
      deps,
    });
    expect(result).toBeNull();
  });
});

describe("formatOutdatedNotice", () => {
  it("produces the exact one-line notice", () => {
    expect(formatOutdatedNotice("6.2.2", "6.3.0", "latest")).toBe(
      "A new version of ph-cmd is available: 6.3.0 (you have 6.2.2 — latest stream). Run 'ph self-update' to update.",
    );
  });
});
