import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { CdnCache, isExactVersion } from "../src/cdn.js";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";

const REGISTRY_PORT = 8281;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const PKG_NAME = "serve-test-pkg";
const PKG_VERSION = "1.0.0";
const POLL_TIMEOUT = 15000;
const POLL_INTERVAL = 200;

let authToken: string;

async function ensureTestUser(): Promise<void> {
  if (authToken) return;
  const res = await fetch(`${REGISTRY_URL}/-/user/org.couchdb.user:serveuser`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "serveuser", password: "servepassword" }),
  });
  if (!res.ok) {
    throw new Error(`Failed to create test user: ${res.status}`);
  }
  const body = (await res.json()) as { token?: string };
  if (!body.token) {
    throw new Error("Test user creation returned no token");
  }
  authToken = body.token;
}

/** Publish a package with a custom file so CDN streaming can be asserted. */
async function publishPackage(
  name: string,
  version: string,
  files: Record<string, string>,
): Promise<void> {
  const tmpDir = path.join(import.meta.dirname, ".tmp-serve-publish");
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"`);
  writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name, version, description: "test" }),
  );
  for (const [relPath, content] of Object.entries(files)) {
    const target = path.join(tmpDir, relPath);
    execSync(`mkdir -p "${path.dirname(target)}"`);
    writeFileSync(target, content);
  }

  const tarballName = execSync("npm pack --pack-destination .", {
    cwd: tmpDir,
    encoding: "utf-8",
  }).trim();
  const tarball = readFileSync(path.join(tmpDir, tarballName));
  execSync(`rm -rf "${tmpDir}"`);

  const shasum = createHash("sha1").update(tarball).digest("hex");
  const tarballBase64 = tarball.toString("base64");
  const shortName = name.startsWith("@") ? name.split("/")[1] : name;

  const res = await fetch(`${REGISTRY_URL}/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      _id: name,
      name,
      "dist-tags": { latest: version },
      versions: {
        [version]: {
          name,
          version,
          description: "test",
          dist: {
            tarball: `${REGISTRY_URL}/${name}/-/${shortName}-${version}.tgz`,
            shasum,
          },
        },
      },
      _attachments: {
        [`${shortName}-${version}.tgz`]: {
          content_type: "application/octet-stream",
          data: tarballBase64,
          length: tarball.length,
        },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Publish failed (${res.status}): ${body}`);
  }
}

describe("isExactVersion", () => {
  it("returns true for concrete semver", () => {
    expect(isExactVersion("1.0.0")).toBe(true);
    expect(isExactVersion("10.20.30")).toBe(true);
    expect(isExactVersion("1.2.3-dev.4")).toBe(true);
    expect(isExactVersion("1.2.3+build.5")).toBe(true);
  });

  it("returns false for dist-tags and undefined", () => {
    expect(isExactVersion("dev")).toBe(false);
    expect(isExactVersion("latest")).toBe(false);
    expect(isExactVersion("1.2")).toBe(false);
    expect(isExactVersion(undefined)).toBe(false);
    expect(isExactVersion("")).toBe(false);
  });
});

// Real CdnCache pointed at a dead registry port: no mocks. Verifies the
// resolveVersion contract the 503 fallback in middleware depends on — a
// network failure throws (distinct from a 404 not-found), and the cached
// fallback is found from disk.
describe("resolveVersion upstream failure (real, dead upstream)", () => {
  const testDir = import.meta.dirname;
  const cacheDir = path.join(testDir, "./.test-output-resolve");

  beforeAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
    await mkdir(cacheDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(cacheDir, { recursive: true, force: true });
  });

  it("throws on a network error rather than returning null", async () => {
    // Port 1 has nothing listening — fetch rejects.
    const cdn = new CdnCache("http://127.0.0.1:1", cacheDir);
    await expect(cdn.resolveVersion("any-pkg", "latest")).rejects.toThrow();
  });

  it("getLatestCachedVersion supplies the 503 fallback from disk", () => {
    const cdn = new CdnCache("http://127.0.0.1:1", cacheDir);
    expect(cdn.getLatestCachedVersion("cached-pkg")).toBeNull();
    mkdirSync(path.join(cacheDir, "cached-pkg", "2.0.0"), { recursive: true });
    mkdirSync(path.join(cacheDir, "cached-pkg", "1.0.0"), { recursive: true });
    expect(cdn.getLatestCachedVersion("cached-pkg")).toBe("2.0.0");
  });
});

describe("registry CDN serving", () => {
  const testDir = import.meta.dirname;
  const workDir = path.join(testDir, "./.test-output-serve");
  let server: Awaited<ReturnType<typeof runRegistry>>;

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    await mkdir(path.join(workDir, DEFAULT_STORAGE_DIR_NAME), {
      recursive: true,
    });
    await mkdir(path.join(workDir, DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME), {
      recursive: true,
    });

    server = await runRegistry({
      port: REGISTRY_PORT,
      storageDir: path.join(workDir, DEFAULT_STORAGE_DIR_NAME),
      cdnCacheDir: path.join(workDir, DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME),
      uplink: undefined,
      s3Bucket: undefined,
      s3Endpoint: undefined,
      s3Region: undefined,
      s3AccessKeyId: undefined,
      s3SecretAccessKey: undefined,
      s3KeyPrefix: undefined,
      s3ForcePathStyle: true,
      webEnabled: false,
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    await ensureTestUser();
    await publishPackage(PKG_NAME, PKG_VERSION, {
      "index.js": "export const hello = 'serve';",
      "data.wasm": "WASMBYTES",
    });

    // Wait for the CDN cache to be populated by the publish hook.
    await vi.waitFor(
      async () => {
        const res = await fetch(
          `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
        );
        expect(res.ok).toBe(true);
      },
      { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
    );
  }, 30000);

  afterAll(() => {
    server.close();
  });

  it("serves file bytes with the correct Content-Type", async () => {
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
    );
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toBe("application/javascript");
    expect(await res.text()).toBe("export const hello = 'serve';");
  });

  it("uses the MIME_TYPES map for .wasm", async () => {
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/data.wasm`,
    );
    expect(res.ok).toBe(true);
    expect(res.headers.get("content-type")).toBe("application/wasm");
    expect(await res.text()).toBe("WASMBYTES");
  });

  it("sets immutable Cache-Control for a version-pinned request", async () => {
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
    );
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=31536000, immutable",
    );
  });

  it("sets revalidating Cache-Control for a dist-tag request", async () => {
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@latest/index.js`,
    );
    expect(res.ok).toBe(true);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=60, must-revalidate",
    );
  });

  it("sets revalidating Cache-Control for an untagged request", async () => {
    const res = await fetch(`${REGISTRY_URL}/-/cdn/${PKG_NAME}/index.js`);
    expect(res.ok).toBe(true);
    expect(res.headers.get("cache-control")).toBe(
      "public, max-age=60, must-revalidate",
    );
  });

  it("returns 304 when If-None-Match matches the ETag", async () => {
    const first = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
    );
    const etag = first.headers.get("etag");
    expect(etag).toBeTruthy();
    await first.text();

    const second = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
      { headers: { "If-None-Match": etag! } },
    );
    expect(second.status).toBe(304);
    expect(await second.text()).toBe("");
  });

  it("returns 304 when If-None-Match is a list or wildcard", async () => {
    const first = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
    );
    const etag = first.headers.get("etag");
    await first.text();

    const list = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
      { headers: { "If-None-Match": `W/"other", ${etag!}` } },
    );
    expect(list.status).toBe(304);
    await list.text();

    const wildcard = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
      { headers: { "If-None-Match": "*" } },
    );
    expect(wildcard.status).toBe(304);
    await wildcard.text();
  });

  it("returns 404 for a genuinely missing package", async () => {
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/this-pkg-does-not-exist/index.js`,
    );
    expect(res.status).toBe(404);
  });
});
