import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";

const REGISTRY_PORT = 8181;
const UPSTREAM_PORT = 8182;
const REGISTRY_URL = `http://localhost:${REGISTRY_PORT}`;
const UPSTREAM_URL = `http://localhost:${UPSTREAM_PORT}`;

interface UpstreamPackage {
  version: string;
  tarball: Buffer;
  shasum: string;
}

/**
 * Build a tarball for a package with a given set of files, mirroring the
 * layout `npm pack` would produce (files nested under `package/`).
 */
function buildTarball(
  name: string,
  version: string,
  files: Record<string, string>,
): UpstreamPackage {
  const tmpDir = path.join(import.meta.dirname, ".tmp-upstream-pack");
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"`);
  const pkgJson = { name, version, description: "upstream test package" };
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify(pkgJson));
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
  return {
    version,
    tarball,
    shasum: createHash("sha1").update(tarball).digest("hex"),
  };
}

interface UpstreamStats {
  metadataRequests: number;
  tarballRequests: number;
}

/**
 * Minimal HTTP server that impersonates an npm registry — serves metadata
 * and tarballs for a fixed set of packages. Records request counts so tests
 * can assert cache behavior.
 */
function createUpstream(
  packages: Record<string, UpstreamPackage>,
  stats: UpstreamStats,
) {
  return http.createServer((req, res) => {
    const url = req.url ?? "";

    const tarballMatch = /^\/((?:@[^/]+\/)?[^/]+)\/-\/(.+\.tgz)$/.exec(url);
    if (tarballMatch) {
      stats.tarballRequests++;
      const name = decodeURIComponent(tarballMatch[1]);
      const pkg = packages[name];
      if (!pkg) {
        res.writeHead(404);
        res.end();
        return;
      }
      res.writeHead(200, { "Content-Type": "application/octet-stream" });
      res.end(pkg.tarball);
      return;
    }

    const metaMatch = /^\/((?:@[^/]+\/)?[^/]+)$/.exec(url);
    if (metaMatch) {
      stats.metadataRequests++;
      const name = decodeURIComponent(metaMatch[1]);
      const pkg = packages[name];
      if (!pkg) {
        res.writeHead(404);
        res.end();
        return;
      }
      const shortName = name.startsWith("@") ? name.split("/")[1] : name;
      const body = {
        name,
        "dist-tags": { latest: pkg.version },
        versions: {
          [pkg.version]: {
            name,
            version: pkg.version,
            dist: {
              tarball: `${UPSTREAM_URL}/${name}/-/${shortName}-${pkg.version}.tgz`,
              shasum: pkg.shasum,
            },
          },
        },
      };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
      return;
    }

    res.writeHead(404);
    res.end();
  });
}

describe("registry npm uplink fallback", () => {
  const testDir = import.meta.dirname;
  const workDir = path.join(testDir, "./.test-output-uplink");
  let server: Awaited<ReturnType<typeof runRegistry>>;
  let upstream: http.Server;
  const stats: UpstreamStats = { metadataRequests: 0, tarballRequests: 0 };

  const UPSTREAM_ONLY_PKG = "uplink-only-pkg";
  const UPSTREAM_ONLY_VERSION = "1.2.3";
  const upstreamPackages: Record<string, UpstreamPackage> = {
    [UPSTREAM_ONLY_PKG]: buildTarball(
      UPSTREAM_ONLY_PKG,
      UPSTREAM_ONLY_VERSION,
      {
        "browser/index.js": "export const hello = 'from upstream';",
      },
    ),
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

    upstream = createUpstream(upstreamPackages, stats);
    await new Promise<void>((resolve) =>
      upstream.listen(UPSTREAM_PORT, resolve),
    );

    server = await runRegistry({
      port: REGISTRY_PORT,
      storageDir: DEFAULT_STORAGE_DIR_NAME,
      cdnCacheDir: DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
      uplink: UPSTREAM_URL,
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
  }, 30000);

  afterAll(async () => {
    server.close();
    await new Promise<void>((resolve) => upstream.close(() => resolve()));
  });

  it("serves an upstream-only package through the CDN", async () => {
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/${UPSTREAM_ONLY_PKG}/browser/index.js`,
    );
    expect(res.ok).toBe(true);
    const body = await res.text();
    expect(body).toContain("from upstream");
    expect(stats.tarballRequests).toBeGreaterThanOrEqual(1);
  });

  it("extracts the tarball into the CDN cache", () => {
    const cachedFile = path.join(
      workDir,
      DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
      UPSTREAM_ONLY_PKG,
      UPSTREAM_ONLY_VERSION,
      "browser",
      "index.js",
    );
    expect(existsSync(cachedFile)).toBe(true);
  });

  it("serves subsequent requests from the CDN cache without re-fetching the tarball", async () => {
    const before = stats.tarballRequests;
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/${UPSTREAM_ONLY_PKG}/browser/index.js`,
    );
    expect(res.ok).toBe(true);
    expect(stats.tarballRequests).toBe(before);
  });

  it("returns 404 for a package that exists neither locally nor upstream", async () => {
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/this-pkg-does-not-exist-anywhere/package.json`,
    );
    expect(res.status).toBe(404);
  });
});
