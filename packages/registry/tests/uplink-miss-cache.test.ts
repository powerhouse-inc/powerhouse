import { createHash } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";
import { packTarball } from "./pack.js";

const REGISTRY_PORT = 8185;
const UPSTREAM_PORT = 8186;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const MAXAGE_MS = 1000;
const LOCAL_PKG = "local-only-miss-cache";

// Upstream that knows no packages; counts packument requests per name
function createEmptyUpstream(hits: Map<string, number>) {
  return http.createServer((req, res) => {
    const name = decodeURIComponent((req.url ?? "").slice(1));
    if (!name.includes("/-/")) hits.set(name, (hits.get(name) ?? 0) + 1);
    res.writeHead(404);
    res.end();
  });
}

async function publish(token: string, name: string, version: string) {
  const tarball = packTarball(
    { name, version, description: "test" },
    { "powerhouse.manifest.json": JSON.stringify({ name }) },
  );
  const res = await fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      _id: name,
      name,
      "dist-tags": { latest: version },
      versions: {
        [version]: {
          name,
          version,
          dist: {
            tarball: `${REGISTRY_URL}/${name}/-/${name}-${version}.tgz`,
            shasum: createHash("sha1").update(tarball).digest("hex"),
          },
        },
      },
      _attachments: {
        [`${name}-${version}.tgz`]: {
          content_type: "application/octet-stream",
          data: tarball.toString("base64"),
          length: tarball.length,
        },
      },
    }),
  });
  if (!res.ok) throw new Error(`publish ${res.status}: ${await res.text()}`);
}

describe("uplink 404 caching", () => {
  const workDir = path.join(import.meta.dirname, ".test-output-miss-cache");
  const hits = new Map<string, number>();
  let server: Awaited<ReturnType<typeof runRegistry>>;
  let upstream: http.Server;

  const readPackument = async (name: string) => {
    const res = await fetch(`${REGISTRY_URL}/${name}`);
    expect(res.status).toBe(200);
    await res.arrayBuffer();
  };

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    await mkdir(path.join(workDir, DEFAULT_STORAGE_DIR_NAME), {
      recursive: true,
    });
    await mkdir(path.join(workDir, DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME), {
      recursive: true,
    });
    process.chdir(workDir);

    upstream = createEmptyUpstream(hits);
    await new Promise<void>((resolve) =>
      upstream.listen(UPSTREAM_PORT, resolve),
    );
    server = await runRegistry({
      port: REGISTRY_PORT,
      storageDir: DEFAULT_STORAGE_DIR_NAME,
      cdnCacheDir: DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
      uplink: `http://localhost:${UPSTREAM_PORT}`,
      uplinkMaxage: `${MAXAGE_MS}ms`,
      s3ForcePathStyle: true,
      webEnabled: false,
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });

    const user = await fetch(
      `${REGISTRY_URL}/-/user/org.couchdb.user:testuser`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "testuser", password: "testpassword" }),
      },
    );
    const { token } = (await user.json()) as { token: string };
    await publish(token, LOCAL_PKG, "1.0.0");
    // Let the worker finish its own packument reads first
    await vi.waitFor(
      async () => {
        const res = await fetch(`${REGISTRY_URL}/packages?name=${LOCAL_PKG}`);
        const page = (await res.json()) as { items: { name: string }[] };
        expect(page.items.map((p) => p.name)).toEqual([LOCAL_PKG]);
      },
      { timeout: 20000, interval: 100 },
    );
  }, 60000);

  afterAll(async () => {
    server.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it("asks the uplink once per maxage for a local-only package", async () => {
    await sleep(MAXAGE_MS + 200);
    const count = () => hits.get(LOCAL_PKG) ?? 0;

    const start = count();
    await readPackument(LOCAL_PKG);
    expect(count()).toBe(start + 1);

    await readPackument(LOCAL_PKG);
    await readPackument(LOCAL_PKG);
    expect(count()).toBe(start + 1);

    await sleep(MAXAGE_MS + 200);
    await readPackument(LOCAL_PKG);
    expect(count()).toBe(start + 2);
  });

  it("still 404s a package that exists nowhere", async () => {
    const res = await fetch(`${REGISTRY_URL}/nowhere-miss-cache`);
    expect(res.status).toBe(404);
    const again = await fetch(`${REGISTRY_URL}/nowhere-miss-cache`);
    expect(again.status).toBe(404);
    expect(hits.get("nowhere-miss-cache")).toBe(1);
  });
});
