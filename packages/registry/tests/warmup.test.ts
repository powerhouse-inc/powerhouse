import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { CdnCache } from "../src/cdn.js";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";
import type { RegistryConfig } from "../src/types.js";
import { createWarmer } from "../src/warmup.js";

const REGISTRY_PORT = 8282;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;

let authToken: string;

async function ensureTestUser(): Promise<void> {
  if (authToken) return;
  const res = await fetch(`${REGISTRY_URL}/-/user/org.couchdb.user:testuser`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: "testuser", password: "testpassword" }),
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

/** Publish a real npm-pack tarball to the running registry. */
async function publishPackage(name: string, version: string): Promise<void> {
  const tmpDir = path.join(import.meta.dirname, ".tmp-warmup-publish");
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"`);
  writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name, version, description: "warmup test" }),
  );
  writeFileSync(
    path.join(tmpDir, "index.js"),
    `export const v = "${version}";`,
  );
  const tarballName = execSync("npm pack --pack-destination .", {
    cwd: tmpDir,
    encoding: "utf-8",
  }).trim();
  const tarball = readFileSync(path.join(tmpDir, tarballName));
  execSync(`rm -rf "${tmpDir}"`);

  const shasum = createHash("sha1").update(tarball).digest("hex");
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
          dist: {
            tarball: `${REGISTRY_URL}/${name}/-/${shortName}-${version}.tgz`,
            shasum,
          },
        },
      },
      _attachments: {
        [`${shortName}-${version}.tgz`]: {
          content_type: "application/octet-stream",
          data: tarball.toString("base64"),
          length: tarball.length,
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Publish failed (${res.status}): ${await res.text()}`);
  }
}

describe("warmup", () => {
  const testDir = import.meta.dirname;
  const workDir = path.join(testDir, "./.test-output-warmup");
  const storagePath = path.join(workDir, DEFAULT_STORAGE_DIR_NAME);
  const cdnCachePath = path.join(workDir, DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME);
  let server: Awaited<ReturnType<typeof runRegistry>>;

  const config: RegistryConfig = {
    port: REGISTRY_PORT,
    storagePath,
    cdnCachePath,
  };
  const cdn = new CdnCache(REGISTRY_URL, cdnCachePath);

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    await mkdir(storagePath, { recursive: true });
    await mkdir(cdnCachePath, { recursive: true });

    server = await runRegistry({
      port: REGISTRY_PORT,
      storageDir: storagePath,
      cdnCacheDir: cdnCachePath,
      uplink: undefined,
      s3Bucket: undefined,
      s3Endpoint: undefined,
      s3Region: undefined,
      s3AccessKeyId: undefined,
      s3SecretAccessKey: undefined,
      s3KeyPrefix: undefined,
      s3ForcePathStyle: true,
      // Web API must be on for /-/verdaccio/data/packages to respond.
      webEnabled: true,
    });
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    await ensureTestUser();

    await publishPackage("warm-pkg-a", "1.0.0");
    await publishPackage("warm-pkg-a", "2.0.0");
    await publishPackage("warm-pkg-b", "0.1.0");
  }, 60000);

  afterAll(() => {
    server.close();
  });

  it("extracts only the latest version of each locally-published package", async () => {
    // Clear anything the publish hook already extracted so we observe the
    // warmer's own effect on an empty cache.
    cdn.invalidate("warm-pkg-a");
    cdn.invalidate("warm-pkg-b");
    expect(existsSync(path.join(cdnCachePath, "warm-pkg-a"))).toBe(false);

    const warm = createWarmer(config, cdn);
    await warm();

    // Latest version present for both packages.
    expect(
      existsSync(
        path.join(cdnCachePath, "warm-pkg-a", "2.0.0", "package.json"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        path.join(cdnCachePath, "warm-pkg-b", "0.1.0", "package.json"),
      ),
    ).toBe(true);

    // Older version is NOT warmed — it extracts lazily on demand instead.
    expect(existsSync(path.join(cdnCachePath, "warm-pkg-a", "1.0.0"))).toBe(
      false,
    );
  });

  it("is a no-op within the throttle interval", async () => {
    const warm = createWarmer(config, cdn);
    await warm();
    cdn.invalidate("warm-pkg-b");
    // Second call inside the 30s window must not re-extract.
    await warm();
    expect(existsSync(path.join(cdnCachePath, "warm-pkg-b"))).toBe(false);
  });
});
