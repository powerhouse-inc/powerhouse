import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";
import { startMockS3, type MockS3 } from "./helpers/mock-s3.js";

const BUCKET = "powerhouse-registry";
const KEY_PREFIX = "vetra/";

// Verdaccio require()s the plugin from the BUILT dir; running from src, point
// it at dist/plugins. Requires a prior `pnpm build` (the GATE runs build+test).
const BUILT_PLUGINS_DIR = path.join(import.meta.dirname, "../dist/plugins");

// Fail fast at collection time if the plugin isn't built (the GATE runs
// build+test); this keeps setup/teardown simple below.
if (!existsSync(path.join(BUILT_PLUGINS_DIR, "verdaccio-s3-auth.js"))) {
  throw new Error(
    "dist/plugins/verdaccio-s3-auth.js is missing — run `pnpm --filter @powerhousedao/registry build` before this integration test.",
  );
}

async function bootRegistry(port: number, endpoint: string, workDir: string) {
  await mkdir(path.join(workDir, DEFAULT_STORAGE_DIR_NAME), {
    recursive: true,
  });
  await mkdir(path.join(workDir, DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME), {
    recursive: true,
  });
  const server = await runRegistry({
    port,
    storageDir: path.join(workDir, DEFAULT_STORAGE_DIR_NAME),
    cdnCacheDir: path.join(workDir, DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME),
    uplink: undefined,
    s3Bucket: BUCKET,
    s3Endpoint: endpoint,
    s3Region: "test",
    s3AccessKeyId: "test",
    s3SecretAccessKey: "test",
    s3KeyPrefix: KEY_PREFIX,
    s3ForcePathStyle: true,
    webEnabled: false,
    pluginsDir: BUILT_PLUGINS_DIR,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}

/**
 * npm adduser/login flow. Sends Basic auth so verdaccio takes its login branch
 * for an already-registered user (returns a token) instead of always routing to
 * add_user (which 409s on an existing name). New users fall through to add_user
 * and are created. Returns { status, token }.
 */
async function putUser(
  url: string,
  name: string,
  password: string,
): Promise<{ status: number; token?: string }> {
  const basic = Buffer.from(`${name}:${password}`).toString("base64");
  const res = await fetch(`${url}/-/user/org.couchdb.user:${name}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basic}`,
    },
    body: JSON.stringify({ name, password }),
  });
  let token: string | undefined;
  try {
    token = ((await res.json()) as { token?: string }).token;
  } catch {
    /* no body */
  }
  return { status: res.status, token };
}

async function publish(
  url: string,
  token: string,
  name: string,
  version: string,
): Promise<number> {
  const tmpDir = path.join(import.meta.dirname, `.tmp-pub-${name}-${version}`);
  execSync(`rm -rf "${tmpDir}" && mkdir -p "${tmpDir}"`);
  writeFileSync(
    path.join(tmpDir, "package.json"),
    JSON.stringify({ name, version, description: "t" }),
  );
  writeFileSync(path.join(tmpDir, "index.js"), "module.exports = 1;");
  const tgz = execSync("npm pack --pack-destination .", {
    cwd: tmpDir,
    encoding: "utf-8",
  }).trim();
  const tarball = readFileSync(path.join(tmpDir, tgz));
  execSync(`rm -rf "${tmpDir}"`);
  const shasum = createHash("sha1").update(tarball).digest("hex");
  const shortName = name.startsWith("@") ? name.split("/")[1] : name;

  const res = await fetch(`${url}/${encodeURIComponent(name)}`, {
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
            tarball: `${url}/${name}/-/${shortName}-${version}.tgz`,
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
  return res.status;
}

describe("s3 auth plugin — loads + accounts (integration, mock S3)", () => {
  const PORT = 8283;
  const URL = `http://localhost:${PORT}`;
  const workDir = path.join(import.meta.dirname, "./.test-output-s3auth");
  let mock: MockS3;
  let server: Awaited<ReturnType<typeof runRegistry>>;

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    mock = await startMockS3(BUCKET);
    server = await bootRegistry(PORT, mock.endpoint, workDir);
  }, 30000);

  afterAll(async () => {
    server.close();
    await mock.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it("adduser goes through the plugin and writes the account to S3 (not htpasswd)", async () => {
    const r = await putUser(URL, "alice", "pw-alice");
    expect(r.status).toBeLessThan(300);
    expect(r.token).toBeTruthy();
    // The load-bearing proof the plugin is in effect: the account object lives
    // in the S3 mock. htpasswd would have written a local file instead.
    expect(mock.has(`${KEY_PREFIX}auth/users/alice.json`)).toBe(true);
  });

  it("registering an existing username with a different password is rejected", async () => {
    const r = await putUser(URL, "alice", "different-pw");
    expect(r.status).toBeGreaterThanOrEqual(400);
    // And the original credentials still work — the account was not hijacked.
    const relogin = await putUser(URL, "alice", "pw-alice");
    expect(relogin.status).toBeLessThan(300);
    expect(relogin.token).toBeTruthy();
  });
});

describe("s3 auth plugin — ownership + persistence (integration, mock S3)", () => {
  const PORT = 8284;
  const URL = `http://localhost:${PORT}`;
  const workDir = path.join(import.meta.dirname, "./.test-output-s3own");
  let mock: MockS3;
  let server: Awaited<ReturnType<typeof runRegistry>>;

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    mock = await startMockS3(BUCKET);
    server = await bootRegistry(PORT, mock.endpoint, workDir);
  }, 30000);

  afterAll(async () => {
    server.close();
    await mock.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it("first publisher claims a name; a different user gets 403", async () => {
    const alice = await putUser(URL, "alice", "pw-a");
    const bob = await putUser(URL, "bob", "pw-b");
    expect(alice.token && bob.token).toBeTruthy();

    const claim = await publish(URL, alice.token!, "owned-pkg", "1.0.0");
    expect(claim).toBeLessThan(300);
    expect(mock.has(`${KEY_PREFIX}auth/owners/owned-pkg.json`)).toBe(true);

    const foreign = await publish(URL, bob.token!, "owned-pkg", "1.0.1");
    expect(foreign).toBe(403);

    // A free name is still claimable by bob.
    const free = await publish(URL, bob.token!, "bob-pkg", "1.0.0");
    expect(free).toBeLessThan(300);
  });

  it("accounts + ownership survive a fresh registry instance on the same S3", async () => {
    // Simulate a pod redeploy / a second replica: a brand-new registry
    // process pointed at the same S3 state.
    const PORT2 = 8285;
    const URL2 = `http://localhost:${PORT2}`;
    const workDir2 = path.join(import.meta.dirname, "./.test-output-s3own2");
    await rm(workDir2, { recursive: true, force: true });
    const server2 = await bootRegistry(PORT2, mock.endpoint, workDir2);
    try {
      // alice authenticates against the new instance (account persisted).
      const relogin = await putUser(URL2, "alice", "pw-a");
      expect(relogin.status).toBeLessThan(300);
      expect(relogin.token).toBeTruthy();
      // bob still can't take alice's package (ownership persisted).
      const bob = await putUser(URL2, "bob", "pw-b");
      const foreign = await publish(URL2, bob.token!, "owned-pkg", "2.0.0");
      expect(foreign).toBe(403);
    } finally {
      server2.close();
      await rm(workDir2, { recursive: true, force: true });
    }
  }, 30000);
});
