import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { isExactVersion } from "../src/cdn.js";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";
import { packTarball } from "./pack.js";

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
  const tarball = packTarball({ name, version, description: "test" }, files);
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

// Unpublish one version the way npm does when others remain: fetch the
// packument, drop the version, PUT the rewrite to /<pkg>/-rev/<rev>.
async function unpublishVersion(name: string, version: string): Promise<void> {
  const encoded = encodeURIComponent(name);
  const res = await fetch(`${REGISTRY_URL}/${encoded}?write=true`, {
    headers: {
      Authorization: `Bearer ${authToken}`,
      Accept: "application/json",
    },
  });
  if (!res.ok) throw new Error(`fetch packument failed: ${res.status}`);
  const doc = (await res.json()) as {
    _rev: string;
    versions: Record<string, unknown>;
    "dist-tags"?: Record<string, string>;
    _attachments?: Record<string, unknown>;
    readme?: string;
  };

  delete doc.versions[version];
  // Verdaccio 7 accepts the rewrite only with the fields npm sends
  doc.readme ??= "";
  const remaining = Object.keys(doc.versions);
  for (const [tag, v] of Object.entries(doc["dist-tags"] ?? {})) {
    if (v === version) doc["dist-tags"]![tag] = remaining[remaining.length - 1];
  }
  // npm sends the rewrite without attachments
  delete doc._attachments;

  const put = await fetch(`${REGISTRY_URL}/${encoded}/-rev/${doc._rev}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${authToken}`,
    },
    body: JSON.stringify(doc),
  });
  if (!put.ok) {
    throw new Error(`unpublish PUT failed: ${put.status} ${await put.text()}`);
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

  it("rejects non-semver characters that could reach the ETag header", () => {
    expect(isExactVersion('1.2.3-"evil"')).toBe(false);
    expect(isExactVersion("1.2.3-a b")).toBe(false);
    expect(isExactVersion("1.2.3-x\r\ny")).toBe(false);
    expect(isExactVersion("1.2.3+x;y")).toBe(false);
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

  it("reports jobs, requests and the process at /-/metrics", async () => {
    const res = await fetch(`${REGISTRY_URL}/-/metrics`);
    expect(res.headers.get("content-type")).toMatch(
      /^text\/plain; version=0\.0\.4/,
    );
    const body = await res.text();
    expect(body).toMatch(
      /registry_job_duration_seconds_count\{kind="process",outcome="done"\} [1-9]/,
    );
    expect(body).toMatch(
      /registry_http_requests_total\{route="cdn",method="GET",status="2xx"\} [1-9]/,
    );
    expect(body).toContain("registry_listen_connected 1");
    expect(body).toContain("# TYPE registry_jobs gauge");
    expect(body).toMatch(/nodejs_eventloop_delay_seconds\{quantile="0.99"\} /);
    expect(body).toMatch(/process_resident_memory_bytes \d+/);
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

    // RFC 9110 weak comparison: the strong form of a weak ETag still matches.
    const strong = await fetch(
      `${REGISTRY_URL}/-/cdn/${PKG_NAME}@${PKG_VERSION}/index.js`,
      { headers: { "If-None-Match": etag!.replace(/^W\//, "") } },
    );
    expect(strong.status).toBe(304);
    await strong.text();
  });

  it("returns 404 for a genuinely missing package", async () => {
    const res = await fetch(
      `${REGISTRY_URL}/-/cdn/this-pkg-does-not-exist/index.js`,
    );
    expect(res.status).toBe(404);
  });

  // Single-version unpublish is a manifest rewrite, not a tarball DELETE, so
  // the removed version's artifacts must go or it keeps serving.
  it("drops a single unpublished version", async () => {
    const pkg = "unpub-test-pkg";
    await publishPackage(pkg, "1.0.0", { "index.js": "// v1" });
    await publishPackage(pkg, "2.0.0", { "index.js": "// v2" });

    for (const v of ["1.0.0", "2.0.0"]) {
      await vi.waitFor(
        async () => {
          const res = await fetch(`${REGISTRY_URL}/-/cdn/${pkg}@${v}/index.js`);
          expect(res.ok).toBe(true);
        },
        { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
      );
    }

    await unpublishVersion(pkg, "1.0.0");

    const artifacts = path.join(
      workDir,
      DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
      "artifacts",
      pkg,
    );
    await vi.waitFor(
      () => expect(existsSync(path.join(artifacts, "1.0.0"))).toBe(false),
      { timeout: POLL_TIMEOUT, interval: POLL_INTERVAL },
    );
    const gone = await fetch(`${REGISTRY_URL}/-/cdn/${pkg}@1.0.0/index.js`);
    expect(gone.status).toBe(404);

    expect(existsSync(path.join(artifacts, "2.0.0"))).toBe(true);
    const kept = await fetch(`${REGISTRY_URL}/-/cdn/${pkg}@2.0.0/index.js`);
    expect(kept.ok).toBe(true);
    expect(await kept.text()).toBe("// v2");

    // Caches keep the old bytes under the same URL, so the version stays retired
    await expect(
      publishPackage(pkg, "1.0.0", { "index.js": "// v1 again" }),
    ).rejects.toThrow(/409.*unpublished/);
    await publishPackage(pkg, "3.0.0", { "index.js": "// v3" });
  }, 30000);
});
