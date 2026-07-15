import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { Pool } from "pg";
import { newDb, type IMemoryDb } from "pg-mem";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { AuthStore } from "../src/auth/auth-store.js";
import { createPgStore } from "../src/auth/pg-store.js";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";

// Verdaccio require()s the plugin from the BUILT dir; running from src, point
// it there. Requires a prior `pnpm build` (the GATE runs build+test).
const BUILT_PLUGINS_DIR = path.join(import.meta.dirname, "../dist/plugins");
if (!existsSync(path.join(BUILT_PLUGINS_DIR, "verdaccio-registry-auth.js"))) {
  throw new Error(
    "dist/plugins/verdaccio-registry-auth.js is missing — run `pnpm --filter @powerhousedao/registry build` first.",
  );
}

/** A store over a shared pg-mem database — two stores over the same db model
 *  two registry pods sharing one Postgres. */
function storeFromDb(db: IMemoryDb): AuthStore {
  const { Pool: PgMemPool } = db.adapters.createPg() as {
    Pool: new () => unknown;
  };
  return createPgStore(new PgMemPool() as unknown as Pool);
}

async function bootRegistry(port: number, workDir: string, store: AuthStore) {
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
    s3Bucket: undefined,
    s3Endpoint: undefined,
    s3Region: undefined,
    s3AccessKeyId: undefined,
    s3SecretAccessKey: undefined,
    s3KeyPrefix: undefined,
    s3ForcePathStyle: true,
    webEnabled: false,
    pluginsDir: BUILT_PLUGINS_DIR,
    authStore: store,
  });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", resolve);
    server.once("error", reject);
  });
  return server;
}

/** npm login/adduser with Basic auth so verdaccio takes its login branch for
 *  an existing user (returns a token) instead of always routing to add_user. */
async function putUser(url: string, name: string, password: string) {
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
  const tmpDir = path.join(
    import.meta.dirname,
    `.tmp-pgpub-${name}-${version}`,
  );
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

describe("registry auth plugin — accounts (integration, verdaccio + pg-mem)", () => {
  const PORT = 8293;
  const URL = `http://localhost:${PORT}`;
  const workDir = path.join(import.meta.dirname, "./.test-output-pgauth");
  let server: Awaited<ReturnType<typeof runRegistry>>;

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    server = await bootRegistry(PORT, workDir, storeFromDb(newDb()));
  }, 30000);

  afterAll(async () => {
    server.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it("adduser goes through the plugin (Postgres), then wrong-password re-register is rejected", async () => {
    const r = await putUser(URL, "alice", "pw-alice");
    expect(r.status).toBeLessThan(300);
    expect(r.token).toBeTruthy();

    const dup = await putUser(URL, "alice", "different-pw");
    expect(dup.status).toBeGreaterThanOrEqual(400);

    const relogin = await putUser(URL, "alice", "pw-alice");
    expect(relogin.status).toBeLessThan(300);
    expect(relogin.token).toBeTruthy();
  });
});

describe("registry auth plugin — ownership + persistence (integration, verdaccio + pg-mem)", () => {
  const PORT = 8294;
  const URL = `http://localhost:${PORT}`;
  const workDir = path.join(import.meta.dirname, "./.test-output-pgown");
  const db = newDb(); // shared Postgres for both "pods"
  const sharedStore = storeFromDb(db); // one pool over the shared db
  let server: Awaited<ReturnType<typeof runRegistry>>;

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    server = await bootRegistry(PORT, workDir, sharedStore);
  }, 30000);

  afterAll(async () => {
    server.close();
    await rm(workDir, { recursive: true, force: true });
  });

  it("first publisher claims a name; a different user gets 403; free names claimable", async () => {
    const alice = await putUser(URL, "alice", "pw-a");
    const bob = await putUser(URL, "bob", "pw-b");
    expect(alice.token && bob.token).toBeTruthy();

    expect(await publish(URL, alice.token!, "owned-pkg", "1.0.0")).toBeLessThan(
      300,
    );
    expect(await publish(URL, bob.token!, "owned-pkg", "1.0.1")).toBe(403);
    expect(await publish(URL, bob.token!, "bob-pkg", "1.0.0")).toBeLessThan(
      300,
    );
  });

  it("accounts + ownership survive a fresh registry instance on the same Postgres", async () => {
    const PORT2 = 8295;
    const URL2 = `http://localhost:${PORT2}`;
    const workDir2 = path.join(import.meta.dirname, "./.test-output-pgown2");
    await rm(workDir2, { recursive: true, force: true });
    // A brand-new registry process over the SAME Postgres (second pod). Reuse
    // the shared store: init() is memoized so tables aren't re-created (pg-mem
    // can't re-run CREATE TABLE IF NOT EXISTS; real Postgres no-ops it fine).
    const server2 = await bootRegistry(PORT2, workDir2, sharedStore);
    try {
      const relogin = await putUser(URL2, "alice", "pw-a");
      expect(relogin.status).toBeLessThan(300);
      expect(relogin.token).toBeTruthy();

      const bob = await putUser(URL2, "bob", "pw-b");
      expect(await publish(URL2, bob.token!, "owned-pkg", "2.0.0")).toBe(403);
    } finally {
      server2.close();
      await rm(workDir2, { recursive: true, force: true });
    }
  }, 30000);
});
