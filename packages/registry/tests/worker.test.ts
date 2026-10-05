import { mkdtemp, readFile, rm } from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFsArtifactStore } from "../src/artifacts.js";
import { Catalog } from "../src/catalog.js";
import {
  createPGliteDatabase,
  createPostgresDatabase,
  type Database,
} from "../src/db/database.js";
import { migrate } from "../src/db/migrations.js";
import { EventBus } from "../src/events.js";
import {
  BACKGROUND_PRIORITY,
  claim,
  enqueue,
  MAX_ATTEMPTS,
  retry,
  type Job,
} from "../src/jobs.js";
import {
  processVersion,
  syncPackage,
  type ProcessorContext,
} from "../src/processor.js";
import {
  pruneCachedPackages,
  reconcile,
  startWorker,
  type RunningWorker,
} from "../src/worker.js";
import { packTarball } from "./pack.js";

// Set to also run against a real server, e.g. postgres://postgres:postgres@localhost:5432/registry
const PG_URL = process.env.REGISTRY_TEST_PG_URL;

const TABLES = [
  "verdaccio_manifests",
  "verdaccio_packages",
  "registry_jobs",
  "registry_unpublished",
  "registry_pieces",
  "registry_piece_owners",
  "registry_versions",
  "registry_packages",
  "registry_webhooks",
  "registry_migrations",
];

interface FakePackage {
  distTags: Record<string, string>;
  versions: Record<string, Buffer>;
  modified?: string;
}

// Impersonates a registry replica's npm endpoint
function fakeRegistry(packages: Map<string, FakePackage>) {
  return http.createServer((req, res) => {
    const url = decodeURIComponent(req.url ?? "");
    const tarball = /^\/(.+)\/-\/.+-(\d+\.\d+\.\d+[^/]*)\.tgz$/.exec(url);
    if (tarball) {
      const body = packages.get(tarball[1])?.versions[tarball[2]];
      res.writeHead(body ? 200 : 404);
      res.end(body);
      return;
    }
    const pkg = packages.get(url.slice(1));
    if (!pkg) {
      res.writeHead(404);
      res.end();
      return;
    }
    const versions = Object.fromEntries(
      Object.keys(pkg.versions).map((v) => [v, { version: v }]),
    );
    const time = {
      ...Object.fromEntries(
        Object.keys(pkg.versions).map((v) => [v, "2026-09-30T10:00:00.000Z"]),
      ),
      modified: pkg.modified ?? "2026-09-30T10:00:00.000Z",
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ "dist-tags": pkg.distTags, versions, time }));
  });
}

function pieceTarball(pkg: string, version: string, pieceId: string): Buffer {
  const bundle = "dist/node/pieces/p";
  return packTarball(
    { name: pkg, version },
    {
      "powerhouse.manifest.json": JSON.stringify({
        name: pkg,
        description: `${pkg} ${version}`,
        pieces: [{ id: pieceId, name: `Piece ${version}`, bundle }],
      }),
      [`${bundle}/package.json`]: JSON.stringify({ name: pieceId }),
      [`${bundle}/index.mjs`]: `export default "${pkg}@${version}";`,
      [`${bundle}/descriptor.json`]: JSON.stringify({
        displayName: `Piece ${version}`,
        actions: { a: {} },
      }),
    },
  );
}

type Backend = [string, () => Promise<Database>];
const backends: Backend[] = [["pglite", () => createPGliteDatabase()]];
if (PG_URL) {
  backends.push([
    "postgres",
    async () => {
      const db = createPostgresDatabase(PG_URL);
      await db.query(`DROP TABLE IF EXISTS ${TABLES.join(", ")}`);
      return db;
    },
  ]);
}

describe.each(backends)("registry worker (%s)", (_, createDb) => {
  let db: Database;
  let dir: string;
  let server: http.Server;
  let ctx: ProcessorContext;
  let catalog: Catalog;
  const packages = new Map<string, FakePackage>();
  const workers: RunningWorker[] = [];

  beforeEach(async () => {
    db = await createDb();
    await migrate(db);
    dir = await mkdtemp(path.join(os.tmpdir(), "registry-worker-"));
    packages.clear();
    server = fakeRegistry(packages);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const url = `http://localhost:${(server.address() as AddressInfo).port}`;
    const events = new EventBus(db);
    await events.start();
    ctx = {
      db,
      artifacts: createFsArtifactStore(dir),
      events,
      registryUrl: url,
    };
    catalog = new Catalog(db, events, () => url);
  });

  afterEach(async () => {
    await Promise.all(workers.splice(0).map((w) => w.stop()));
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await db.close();
    await rm(dir, { recursive: true, force: true });
  });

  const job = (kind: Job["kind"], pkg: string, version = ""): Job => ({
    id: "0",
    kind,
    package: pkg,
    version,
    payload: { local: true },
    attempts: 1,
    priority: 0,
  });
  const noFinish = () => Promise.resolve();
  const versionRow = async (pkg: string, version: string) =>
    (
      await db.query<{ status: string; error: string | null }>(
        "SELECT status, error FROM registry_versions WHERE package = $1 AND version = $2",
        [pkg, version],
      )
    ).rows[0];

  it("turns a published version into files, a piece bundle and rows", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    workers.push(await startWorker(ctx, { concurrency: 1 }));
    await enqueue(db, "process", "pkg-a", "1.0.0", { local: true });

    await vi.waitFor(
      async () =>
        expect((await versionRow("pkg-a", "1.0.0"))?.status).toBe("ready"),
      { timeout: 10_000, interval: 100 },
    );
    const manifest = await readFile(
      path.join(dir, "pkg-a/1.0.0/files/powerhouse.manifest.json"),
      "utf-8",
    );
    expect((JSON.parse(manifest) as { name: string }).name).toBe("pkg-a");
    const bundle = await ctx.artifacts.get(
      "pkg-a/1.0.0/pieces/@t-piece-1.0.0.tgz",
    );
    expect(bundle).not.toBeNull();
    bundle?.stream.destroy();
    expect((await catalog.packages()).map((p) => p.name)).toEqual(["pkg-a"]);
    expect(await catalog.pieceCatalog()).toMatchObject([
      { name: "@t/piece", version: "1.0.0", package: "pkg-a" },
    ]);
    const jobs = await db.query("SELECT id FROM registry_jobs");
    expect(jobs.rows).toEqual([]);
  });

  it("gives the same result when a version is processed twice", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    const pieces = await db.query("SELECT name, version FROM registry_pieces");
    expect(pieces.rows).toEqual([{ name: "@t/piece", version: "1.0.0" }]);
    expect(await catalog.pieceCatalog()).toHaveLength(1);
  });

  it("keeps the latest listed version as dist-tags move", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0", dev: "2.0.0-dev.1" },
      versions: {
        "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece"),
        "2.0.0-dev.1": pieceTarball("pkg-a", "2.0.0-dev.1", "@t/piece"),
      },
    });
    await processVersion(ctx, job("process", "pkg-a", "2.0.0-dev.1"), noFinish);
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    expect((await catalog.packageRow("pkg-a"))?.latest).toBe("1.0.0");
    // The catalog follows the latest tag, not the newest prerelease
    expect((await catalog.pieceCatalog())[0].version).toBe("1.0.0");
  });

  it("fails a version whose piece another package owns, without retrying", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    packages.set("pkg-b", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-b", "1.0.0", "@t/piece") },
    });
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    workers.push(await startWorker(ctx, { concurrency: 1 }));
    await enqueue(db, "process", "pkg-b", "1.0.0", { local: true });
    await vi.waitFor(
      async () =>
        expect((await versionRow("pkg-b", "1.0.0"))?.status).toBe("failed"),
      { timeout: 10_000, interval: 100 },
    );
    expect((await versionRow("pkg-b", "1.0.0"))?.error).toContain(
      "already published by pkg-a",
    );
    expect((await db.query("SELECT id FROM registry_jobs")).rows).toEqual([]);
  });

  it("ignores a packument older than the one it last stored", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
      modified: "2026-09-30T12:00:00.000Z",
    });
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    // A slow worker's snapshot from before 1.0.0 was tagged
    packages.set("pkg-a", {
      distTags: {},
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
      modified: "2026-09-30T11:00:00.000Z",
    });
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    const row = await catalog.packageRow("pkg-a");
    expect(row?.distTags).toEqual({ latest: "1.0.0" });
  });

  it("drops a version unpublished before it was processed", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    await db.query(
      "INSERT INTO registry_versions (package, version, status) VALUES ('pkg-a', '2.0.0', 'pending')",
    );
    const processed = await processVersion(
      ctx,
      job("process", "pkg-a", "2.0.0"),
      noFinish,
    );
    expect(processed).toBe(false);
    expect(await versionRow("pkg-a", "2.0.0")).toBeUndefined();
  });

  it("syncs a package: drops removed versions and queues missing local ones", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "2.0.0" },
      versions: {
        "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece"),
        "2.0.0": pieceTarball("pkg-a", "2.0.0", "@t/piece"),
      },
    });
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    packages.get("pkg-a")!.versions = {
      "2.0.0": pieceTarball("pkg-a", "2.0.0", "@t/piece"),
    };
    const removed = await syncPackage(ctx, job("sync", "pkg-a"), noFinish);
    expect(removed).toEqual(["1.0.0"]);
    expect(await versionRow("pkg-a", "1.0.0")).toBeUndefined();
    const queued = await db.query<{ kind: string; version: string }>(
      "SELECT kind, version FROM registry_jobs",
    );
    expect(queued.rows).toEqual([{ kind: "process", version: "2.0.0" }]);
    expect(
      await ctx.artifacts.get("pkg-a/1.0.0/files/package.json"),
    ).toBeNull();
  });

  it("retries a version that failed a while ago when it's requested", async () => {
    packages.set("pkg-u", {
      distTags: { latest: "3.0.0" },
      versions: { "3.0.0": pieceTarball("pkg-u", "3.0.0", "@u/piece") },
    });
    await db.query(
      `INSERT INTO registry_versions (package, version, status, error, updated_at)
       VALUES ('pkg-u', '3.0.0', 'failed', 'Please reduce your request rate', now())`,
    );
    // A recent failure is reported as it is
    expect(await catalog.ensureVersion("pkg-u", "3.0.0", 1_000)).toMatchObject({
      kind: "failed",
    });

    await db.query(
      "UPDATE registry_versions SET updated_at = now() - interval '1 hour'",
    );
    workers.push(await startWorker(ctx, { concurrency: 1 }));
    const result = await catalog.ensureVersion("pkg-u", "3.0.0", 10_000);
    expect(result.kind).toBe("ready");
  });

  it("never retries a version that failed for good", async () => {
    await indexManifest("pkg-u", ["3.0.0"], { latest: "3.0.0" }, "1-a");
    packages.set("pkg-u", {
      distTags: { latest: "3.0.0" },
      versions: { "3.0.0": pieceTarball("pkg-u", "3.0.0", "@u/piece") },
    });
    await db.query(
      `INSERT INTO registry_versions (package, version, status, error, permanent, updated_at)
       VALUES ('pkg-u', '3.0.0', 'failed', 'piece taken', true, now() - interval '2 hours')`,
    );
    expect(await catalog.ensureVersion("pkg-u", "3.0.0", 1_000)).toMatchObject({
      kind: "failed",
      error: "piece taken",
    });
    await reconcile(db, { full: true });
    expect((await queued()).filter((j) => j.kind === "process")).toEqual([]);
  });

  it("keeps a published version's rows when its package metadata 404s", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    await db.query(
      "CREATE TABLE IF NOT EXISTS verdaccio_packages (name text PRIMARY KEY)",
    );
    await db.query("INSERT INTO verdaccio_packages (name) VALUES ('pkg-a')");
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    packages.delete("pkg-a");
    await expect(
      processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish),
    ).rejects.toThrow("returned 404");
    expect((await versionRow("pkg-a", "1.0.0"))?.status).toBe("ready");
  });

  it("queues only tagged versions when syncing", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "2.0.0", dev: "2.1.0-dev.1" },
      versions: {
        "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece"),
        "2.0.0": pieceTarball("pkg-a", "2.0.0", "@t/piece"),
        "2.1.0-dev.1": pieceTarball("pkg-a", "2.1.0-dev.1", "@t/piece"),
      },
    });
    await syncPackage(ctx, job("sync", "pkg-a"), noFinish);
    const queued = await db.query<{ version: string }>(
      "SELECT version FROM registry_jobs WHERE kind = 'process' ORDER BY version",
    );
    expect(queued.rows.map((r) => r.version)).toEqual(["2.0.0", "2.1.0-dev.1"]);
  });

  it("keeps a published package's rows when its metadata 404s", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    await db.query(
      "CREATE TABLE IF NOT EXISTS verdaccio_packages (name text PRIMARY KEY)",
    );
    await db.query("INSERT INTO verdaccio_packages (name) VALUES ('pkg-a')");
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    packages.delete("pkg-a");
    await expect(
      syncPackage(ctx, job("sync", "pkg-a"), noFinish),
    ).rejects.toThrow("returned 404");
    expect((await versionRow("pkg-a", "1.0.0"))?.status).toBe("ready");

    // Unpublished: Verdaccio dropped it from its list
    await db.query("DELETE FROM verdaccio_packages");
    expect(await syncPackage(ctx, job("sync", "pkg-a"), noFinish)).toBeNull();
    expect(await versionRow("pkg-a", "1.0.0")).toBeUndefined();
  });

  it("marks a published package local whatever the job says", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    await db.query(
      "CREATE TABLE IF NOT EXISTS verdaccio_packages (name text PRIMARY KEY)",
    );
    await db.query("INSERT INTO verdaccio_packages (name) VALUES ('pkg-a')");
    // As an on-demand request queues it
    await processVersion(
      ctx,
      { ...job("process", "pkg-a", "1.0.0"), payload: {} },
      noFinish,
    );
    const row = await db.query<{ local: boolean }>(
      "SELECT local FROM registry_packages WHERE name = 'pkg-a'",
    );
    expect(row.rows[0]?.local).toBe(true);
  });

  it("skips background jobs for packages not published here", async () => {
    packages.set("left-pad", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("left-pad", "1.0.0", "@l/piece") },
    });
    await db.query(
      "CREATE TABLE IF NOT EXISTS verdaccio_packages (name text PRIMARY KEY)",
    );
    workers.push(await startWorker(ctx, { concurrency: 1 }));
    await enqueue(
      db,
      "process",
      "left-pad",
      "1.0.0",
      { local: true },
      BACKGROUND_PRIORITY,
    );
    await vi.waitFor(
      async () =>
        expect((await db.query("SELECT id FROM registry_jobs")).rows).toEqual(
          [],
        ),
      { timeout: 10_000, interval: 100 },
    );
    expect(await versionRow("left-pad", "1.0.0")).toBeUndefined();

    // A row an earlier import marked local is cleared, so nothing requeues it
    await db.query(
      `INSERT INTO registry_packages (name, local) VALUES ('left-pad', true)`,
    );
    await enqueue(
      db,
      "sync",
      "left-pad",
      "",
      { local: true },
      BACKGROUND_PRIORITY,
    );
    await vi.waitFor(
      async () => {
        const row = await db.query<{ local: boolean }>(
          "SELECT local FROM registry_packages WHERE name = 'left-pad'",
        );
        expect(row.rows[0]?.local).toBe(false);
      },
      { timeout: 10_000, interval: 100 },
    );
  });

  it("serves an unprocessed version on demand", async () => {
    packages.set("pkg-u", {
      distTags: { latest: "3.0.0" },
      versions: { "3.0.0": pieceTarball("pkg-u", "3.0.0", "@u/piece") },
    });
    workers.push(await startWorker(ctx, { concurrency: 1 }));
    const result = await catalog.ensureVersion("pkg-u", "3.0.0", 10_000);
    expect(result.kind).toBe("ready");
    expect(await catalog.ensureVersion("pkg-u", "9.9.9")).toEqual({
      kind: "missing",
    });
  });

  it("queues a job once, and again when it changes while running", async () => {
    await enqueue(db, "sync", "pkg-a");
    await enqueue(db, "sync", "pkg-a");
    expect((await db.query("SELECT id FROM registry_jobs")).rows).toHaveLength(
      1,
    );
    const claimed = await claim(db, "w1");
    expect(claimed?.package).toBe("pkg-a");
    await enqueue(db, "sync", "pkg-a");
    const requeued = await db.query<{ requeued: boolean }>(
      "SELECT requeued FROM registry_jobs",
    );
    expect(requeued.rows[0].requeued).toBe(true);
  });

  it("backs off a failing job and fails the version after its last attempt", async () => {
    await enqueue(db, "process", "pkg-a", "1.0.0");
    const first = await claim(db, "w1");
    await retry(db, first!, "boom");
    expect(await claim(db, "w1")).toBeNull();

    await db.query(
      "UPDATE registry_jobs SET run_after = now(), attempts = $1",
      [MAX_ATTEMPTS - 1],
    );
    // Nothing listens there: the fetch fails on the job's last attempt
    workers.push(
      await startWorker(
        { ...ctx, registryUrl: "http://127.0.0.1:1" },
        { concurrency: 1 },
      ),
    );
    await vi.waitFor(
      async () =>
        expect((await versionRow("pkg-a", "1.0.0"))?.status).toBe("failed"),
      { timeout: 10_000, interval: 100 },
    );
    expect((await db.query("SELECT id FROM registry_jobs")).rows).toEqual([]);
  });

  // The storage plugin's index, as it writes it, saved a minute ago; a
  // package cached from the uplink is indexed without being listed
  const indexManifest = async (
    name: string,
    versions: string[],
    distTags: Record<string, string>,
    rev: string | null = null,
    { cached = false } = {},
  ) => {
    await db.query(`CREATE TABLE IF NOT EXISTS verdaccio_manifests (
      name text PRIMARY KEY, versions jsonb NOT NULL, dist_tags jsonb NOT NULL,
      rev text, updated_at timestamptz NOT NULL DEFAULT now())`);
    await db.query(
      "CREATE TABLE IF NOT EXISTS verdaccio_packages (name text PRIMARY KEY)",
    );
    if (!cached) {
      await db.query(
        "INSERT INTO verdaccio_packages (name) VALUES ($1) ON CONFLICT DO NOTHING",
        [name],
      );
    }
    await db.query(
      `INSERT INTO verdaccio_manifests (name, versions, dist_tags, rev, updated_at)
       VALUES ($1, $2, $3, $4, now() - interval '1 minute')
       ON CONFLICT (name) DO UPDATE SET versions = EXCLUDED.versions,
         dist_tags = EXCLUDED.dist_tags, rev = EXCLUDED.rev,
         updated_at = EXCLUDED.updated_at`,
      [name, JSON.stringify(versions), JSON.stringify(distTags), rev],
    );
  };
  const queued = async () =>
    (
      await db.query<{
        kind: string;
        package: string;
        version: string;
        priority: number;
      }>(
        "SELECT kind, package, version, priority FROM registry_jobs ORDER BY id",
      )
    ).rows;
  const ageRows = () =>
    db.query(
      "UPDATE registry_packages SET updated_at = now() - interval '1 minute'",
    );
  const manifestRev = async (name: string) =>
    (
      await db.query<{ manifest_rev: string | null }>(
        "SELECT manifest_rev FROM registry_packages WHERE name = $1",
        [name],
      )
    ).rows[0]?.manifest_rev;

  it("reconciles against the storage plugin's manifest index", async () => {
    expect(await reconcile(db)).toBeNull();
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    await indexManifest("pkg-a", ["1.0.0"], { latest: "1.0.0" }, "1-a");
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    expect(await manifestRev("pkg-a")).toBe("1-a");
    await ageRows();

    // In step: nothing to do
    expect(await reconcile(db)).toBe(0);
    expect(await reconcile(db, { full: true })).toBe(0);

    // A new revision: the quick pass queues a sync, which queues the version
    await indexManifest(
      "pkg-a",
      ["1.0.0", "1.1.0"],
      { latest: "1.1.0" },
      "2-b",
    );
    expect(await reconcile(db)).toBe(1);
    expect(await queued()).toEqual([
      {
        kind: "sync",
        package: "pkg-a",
        version: "",
        priority: BACKGROUND_PRIORITY,
      },
    ]);
    // The full pass also finds the version itself
    await db.query("DELETE FROM registry_jobs");
    expect(await reconcile(db, { full: true })).toBe(2);
    expect(await queued()).toEqual([
      {
        kind: "process",
        package: "pkg-a",
        version: "1.1.0",
        priority: BACKGROUND_PRIORITY,
      },
      {
        kind: "sync",
        package: "pkg-a",
        version: "",
        priority: BACKGROUND_PRIORITY,
      },
    ]);

    // Unpublished: the index row is gone but the package is still listed
    await db.query("DELETE FROM registry_jobs");
    await db.query("DELETE FROM verdaccio_manifests");
    expect(await reconcile(db)).toBe(1);
    expect((await queued())[0]).toMatchObject({
      kind: "sync",
      package: "pkg-a",
    });
  });

  it("records the revision a sync applied, so the next pass skips it", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.1.0" },
      versions: {
        "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece"),
        "1.1.0": pieceTarball("pkg-a", "1.1.0", "@t/piece"),
      },
    });
    await indexManifest(
      "pkg-a",
      ["1.0.0", "1.1.0"],
      { latest: "1.1.0" },
      "3-c",
    );
    expect(await reconcile(db)).toBe(1);
    await db.query("DELETE FROM registry_jobs");
    await syncPackage(ctx, job("sync", "pkg-a"), noFinish);
    expect(await manifestRev("pkg-a")).toBe("3-c");
    await db.query("DELETE FROM registry_jobs");
    await ageRows();
    expect(await reconcile(db)).toBe(0);
  });

  it("leaves drift within one revision to the full pass", async () => {
    packages.set("pkg-a", {
      distTags: { latest: "1.0.0" },
      versions: { "1.0.0": pieceTarball("pkg-a", "1.0.0", "@t/piece") },
    });
    await indexManifest("pkg-a", ["1.0.0"], { latest: "1.0.0" }, "1-a");
    await processVersion(ctx, job("process", "pkg-a", "1.0.0"), noFinish);
    await ageRows();
    await indexManifest(
      "pkg-a",
      ["1.0.0"],
      { latest: "1.0.0", dev: "1.0.0" },
      "1-a",
    );
    expect(await reconcile(db)).toBe(0);
    expect(await reconcile(db, { full: true })).toBe(1);
  });

  it("backfills only tagged versions and relists a package that lost local", async () => {
    await indexManifest(
      "pkg-a",
      ["1.0.0", "2.0.0"],
      { latest: "2.0.0" },
      "1-a",
    );
    expect(await reconcile(db, { full: true })).toBe(2);
    expect(await queued()).toEqual([
      {
        kind: "process",
        package: "pkg-a",
        version: "2.0.0",
        priority: BACKGROUND_PRIORITY,
      },
      {
        kind: "sync",
        package: "pkg-a",
        version: "",
        priority: BACKGROUND_PRIORITY,
      },
    ]);

    // A row an on-demand request recreated without the local flag
    await db.query("DELETE FROM registry_jobs");
    await db.query(
      `INSERT INTO registry_packages (name, local, dist_tags, versions, manifest_rev, updated_at)
       VALUES ('pkg-a', false, '{"latest":"2.0.0"}', '["1.0.0","2.0.0"]', '1-a',
               now() - interval '1 minute')`,
    );
    await db.query(
      `INSERT INTO registry_versions (package, version, status)
       VALUES ('pkg-a', '2.0.0', 'ready')`,
    );
    expect(await reconcile(db)).toBe(0);
    expect(await reconcile(db, { full: true })).toBe(1);
    expect((await queued())[0]).toMatchObject({
      kind: "sync",
      package: "pkg-a",
    });
  });

  it("retries a tagged version that failed an hour ago", async () => {
    await indexManifest("pkg-a", ["1.0.0"], { latest: "1.0.0" }, "1-a");
    await db.query(
      `INSERT INTO registry_versions (package, version, status, error, updated_at)
       VALUES ('pkg-a', '1.0.0', 'failed', 'throttled', now() - interval '10 minutes')`,
    );
    expect(
      (await reconcile(db, { full: true }), await queued()).filter(
        (j) => j.kind === "process",
      ),
    ).toEqual([]);
    await db.query("DELETE FROM registry_jobs");
    await db.query(
      "UPDATE registry_versions SET updated_at = now() - interval '2 hours'",
    );
    await reconcile(db, { full: true });
    expect((await queued()).filter((j) => j.kind === "process")).toEqual([
      {
        kind: "process",
        package: "pkg-a",
        version: "1.0.0",
        priority: BACKGROUND_PRIORITY,
      },
    ]);
  });

  it("leaves packages cached from the uplink alone", async () => {
    await indexManifest(
      "left-pad",
      ["1.0.0", "1.1.0"],
      { latest: "1.1.0" },
      "1-a",
      {
        cached: true,
      },
    );
    expect(await reconcile(db)).toBe(0);
    expect(await reconcile(db, { full: true })).toBe(0);
    expect(await queued()).toEqual([]);
  });

  it("prunes packages an import listed from the uplink cache", async () => {
    // As the import once did: every stored package listed as published
    for (const name of ["@me/pkg", "@me/owned", "left-pad"]) {
      await indexManifest(name, ["1.0.0"], { latest: "1.0.0" }, "1-a");
    }
    await db.query(
      `INSERT INTO registry_package_owners (package_name, owners)
       VALUES ('@me/owned', ARRAY['did:me']) ON CONFLICT DO NOTHING`,
    );
    expect(await reconcile(db, { full: true })).toBe(6);

    expect(await pruneCachedPackages(db, ["@me/pkg"])).toEqual(["left-pad"]);
    const listed = await db.query<{ name: string }>(
      "SELECT name FROM verdaccio_packages ORDER BY name",
    );
    expect(listed.rows.map((row) => row.name)).toEqual([
      "@me/owned",
      "@me/pkg",
    ]);
    expect((await queued()).map((job) => job.package)).not.toContain(
      "left-pad",
    );
    expect(await pruneCachedPackages(db, ["@me/pkg"])).toEqual([]);
  });

  it("requeues a version left pending with no job", async () => {
    await indexManifest("pkg-a", [], {}, null);
    await db.query(
      `INSERT INTO registry_versions (package, version, status, updated_at)
       VALUES ('pkg-a', '1.0.0', 'pending', now() - interval '10 minutes')`,
    );
    expect(await reconcile(db)).toBe(2);
    expect(await queued()).toContainEqual({
      kind: "process",
      package: "pkg-a",
      version: "1.0.0",
      priority: BACKGROUND_PRIORITY,
    });
  });

  it("runs publishes ahead of background syncs", async () => {
    await enqueue(db, "sync", "swept", "", {}, BACKGROUND_PRIORITY);
    await enqueue(db, "process", "published", "1.0.0");
    expect((await claim(db, "w1"))?.package).toBe("published");
    expect((await claim(db, "w1"))?.package).toBe("swept");
  });

  it("never hands the same job to two claimers", async () => {
    for (let i = 0; i < 20; i++) await enqueue(db, "sync", `pkg-${i}`);
    const taken: string[] = [];
    await Promise.all(
      Array.from({ length: 5 }, async (_, w) => {
        for (;;) {
          const next = await claim(db, `w${w}`);
          if (!next) return;
          taken.push(next.id);
        }
      }),
    );
    expect(taken).toHaveLength(20);
    expect(new Set(taken).size).toBe(20);
  });
});
