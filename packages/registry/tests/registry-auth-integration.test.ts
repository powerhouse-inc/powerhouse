import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { AuthStore } from "../src/auth/auth-store.js";
import { createPgStore } from "../src/auth/pg-store.js";
import { createPGliteDatabase, type Database } from "../src/db/database.js";
import {
  DEFAULT_REGISTRY_CDN_CACHE_DIR_NAME,
  DEFAULT_STORAGE_DIR_NAME,
} from "../src/constants.js";
import { runRegistry } from "../src/run.js";
import { packTarball } from "./pack.js";

// Verdaccio require()s the plugin from the BUILT dir; running from src, point
// it there. Requires a prior `pnpm build` (the GATE runs build+test).
const BUILT_PLUGINS_DIR = path.join(import.meta.dirname, "../dist/plugins");
if (!existsSync(path.join(BUILT_PLUGINS_DIR, "verdaccio-registry-auth.js"))) {
  throw new Error(
    "dist/plugins/verdaccio-registry-auth.js is missing — run `pnpm --filter @powerhousedao/registry build` first.",
  );
}

// Two stores over one database model two registry pods sharing one Postgres
function storeFromDb(db: Database): AuthStore {
  return createPgStore(db);
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

/** npm login/adduser: registers a new user, or logs an existing one in. */
async function putUser(url: string, name: string, password: string) {
  const res = await fetch(`${url}/-/user/org.couchdb.user:${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
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
  withManifest = false,
): Promise<number> {
  const files: Record<string, string> = { "index.js": "module.exports = 1;" };
  // A manifest makes the package loadable via /packages/:pkg (loadPackage
  // returns null without one).
  if (withManifest) {
    files["powerhouse.manifest.json"] = JSON.stringify({
      name,
      description: "t",
    });
  }
  const tarball = packTarball({ name, version, description: "t" }, files);
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

describe("registry auth plugin — accounts (integration, verdaccio + PGlite)", () => {
  const PORT = 8293;
  const URL = `http://localhost:${PORT}`;
  const workDir = path.join(import.meta.dirname, "./.test-output-pgauth");
  let server: Awaited<ReturnType<typeof runRegistry>>;

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    server = await bootRegistry(
      PORT,
      workDir,
      storeFromDb(await createPGliteDatabase()),
    );
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

describe("registry auth plugin — ownership + persistence (integration, verdaccio + PGlite)", () => {
  const PORT = 8294;
  const URL = `http://localhost:${PORT}`;
  const workDir = path.join(import.meta.dirname, "./.test-output-pgown");
  let sharedStore: AuthStore; // one store over the shared db
  let server: Awaited<ReturnType<typeof runRegistry>>;

  beforeAll(async () => {
    await rm(workDir, { recursive: true, force: true });
    sharedStore = storeFromDb(await createPGliteDatabase());
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

  it("reports owners on /packages and /packages/:pkg", async () => {
    const carol = await putUser(URL, "carol", "pw-c");
    expect(carol.token).toBeTruthy();
    expect(
      await publish(URL, carol.token!, "carol-pkg", "1.0.0", true),
    ).toBeLessThan(300);

    // Poll the listing until the version is processed
    let listed: { name: string; owners?: string[] } | undefined;
    await vi.waitFor(
      async () => {
        const res = await fetch(`${URL}/packages?name=carol-pkg&detail=full`);
        const page = (await res.json()) as {
          items: { name: string; owners?: string[] }[];
        };
        listed = page.items[0];
        expect(listed).toBeTruthy();
      },
      { timeout: 15000, interval: 200 },
    );
    expect(listed!.owners).toEqual(["carol"]);

    const single = await fetch(`${URL}/packages/carol-pkg`);
    expect(single.status).toBe(200);
    const body = (await single.json()) as { owners?: string[] };
    expect(body.owners).toEqual(["carol"]);
  }, 30000);

  it("accounts + ownership survive a fresh registry instance on the same Postgres", async () => {
    const PORT2 = 8295;
    const URL2 = `http://localhost:${PORT2}`;
    const workDir2 = path.join(import.meta.dirname, "./.test-output-pgown2");
    await rm(workDir2, { recursive: true, force: true });
    // A brand-new registry process over the same database (a second pod)
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
