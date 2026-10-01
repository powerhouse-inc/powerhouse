// Turns a published package version into unpacked files and piece bundles in
// the artifact store, plus rows in Postgres. Every step is safe to retry.
import type { Manifest, PieceModule } from "@powerhousedao/shared";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { ReadableStream as WebReadableStream } from "node:stream/web";
import { create, extract, list } from "tar";
import type { ArtifactStore } from "./artifacts.js";
import type { Database, Queryable } from "./db/database.js";
import type { EventBus } from "./events.js";
import { enqueue, type Job } from "./jobs.js";
import type { PublisherIdentity } from "./notifications/types.js";
import { readManifest } from "./packages.js";
import { compareSemver } from "./semver.js";

/** Piece names in this scope belong to Activepieces; no package may claim one. */
export const RESERVED_PIECE_SCOPE = "@activepieces/";

// Bounds what one package version may download and unpack to
const MAX_TARBALL_BYTES = 256 * 1024 * 1024;
const MAX_UNPACKED_BYTES = 1024 * 1024 * 1024;
const UPLOAD_CONCURRENCY = 8;
const METADATA_TIMEOUT_MS = 60_000;
const TARBALL_TIMEOUT_MS = 300_000;
// Keeps each versions-removed NOTIFY under Postgres' 8000-byte payload limit
const REMOVED_EVENT_CHUNK = 200;

const MIME_TYPES: Record<string, string> = {
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".map": "application/json",
  ".html": "text/html",
  ".svg": "image/svg+xml",
};

export function contentTypeOf(filePath: string): string {
  return (
    MIME_TYPES[path.extname(filePath).toLowerCase()] ??
    "application/octet-stream"
  );
}

export interface ProcessorContext {
  db: Database;
  artifacts: ArtifactStore;
  events: EventBus;
  /** Base URL of a registry replica's npm endpoint */
  registryUrl: string;
}

/** A failure retrying won't fix; the version is marked failed at once. */
export class PermanentError extends Error {}

interface Packument {
  "dist-tags"?: Record<string, string>;
  versions?: Record<string, unknown>;
  time?: Record<string, string>;
}

export function filesKey(pkg: string, version: string, file = ""): string {
  return `${pkg}/${version}/files/${file}`;
}

export function bundleKey(pkg: string, version: string, file: string): string {
  return `${pkg}/${version}/pieces/${file}`;
}

/** The tarball filename cdn.activepieces.com would use for the same piece. */
export function pieceTarballName(name: string, version: string): string {
  return `${name.replace("/", "-")}-${version}.tgz`;
}

function shortName(pkg: string): string {
  return pkg.startsWith("@") ? pkg.split("/")[1] : pkg;
}

export async function fetchPackument(
  registryUrl: string,
  pkg: string,
): Promise<Packument | null> {
  const res = await fetch(`${registryUrl}/${encodeURIComponent(pkg)}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`metadata for ${pkg} returned ${res.status}`);
  return (await res.json()) as Packument;
}

// Streams to `file`, failing past the size limit whether or not a length is sent
async function downloadTarball(
  registryUrl: string,
  pkg: string,
  version: string,
  file: string,
): Promise<void> {
  const url = `${registryUrl}/${encodeURIComponent(pkg)}/-/${shortName(pkg)}-${version}.tgz`;
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TARBALL_TIMEOUT_MS),
  });
  if (!res.ok || !res.body) {
    throw new Error(`tarball ${pkg}@${version} returned ${res.status}`);
  }
  const tooLarge = () =>
    new PermanentError(`tarball ${pkg}@${version} exceeds the size limit`);
  if (Number(res.headers.get("content-length") ?? 0) > MAX_TARBALL_BYTES) {
    await res.body.cancel();
    throw tooLarge();
  }
  let bytes = 0;
  const limit = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.length;
      callback(bytes > MAX_TARBALL_BYTES ? tooLarge() : null, chunk);
    },
  });
  await pipeline(
    Readable.fromWeb(res.body as WebReadableStream),
    limit,
    fs.createWriteStream(file),
  );
}

// Sums entry sizes before extracting, so a small tarball can't fill the disk
async function assertUnpackedSize(
  file: string,
  pkg: string,
  version: string,
): Promise<void> {
  let total = 0;
  await list({
    file,
    onReadEntry: (entry) => {
      total += entry.size ?? 0;
    },
  });
  if (total > MAX_UNPACKED_BYTES) {
    throw new PermanentError(`${pkg}@${version} unpacks past the size limit`);
  }
}

function listFiles(dir: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      files.push(...listFiles(path.join(dir, item.name), rel));
    } else if (item.isFile()) files.push(rel);
  }
  return files.sort();
}

// Manifest paths are publisher-supplied; refuse any that climb out
function inside(root: string, relative: string): string | null {
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

export async function inBatches<T>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  let failed = false;
  // Every lane settles before the caller removes the files they read
  const lanes = await Promise.allSettled(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (!failed && cursor < items.length) {
        try {
          await fn(items[cursor++]);
        } catch (err) {
          failed = true;
          throw err;
        }
      }
    }),
  );
  const rejected = lanes.find((lane) => lane.status === "rejected");
  if (rejected) throw rejected.reason;
}

// The npm-bundle layout the reactor's extractor strips a root segment from
async function packDir(dir: string): Promise<Buffer | null> {
  const files = listFiles(dir);
  if (files.length === 0) return null;
  const chunks: Buffer[] = [];
  const stream = create(
    { gzip: true, cwd: dir, prefix: "package", portable: true },
    files,
  );
  for await (const chunk of stream) chunks.push(Buffer.from(chunk as Buffer));
  return Buffer.concat(chunks);
}

function readPackageJsonVersion(dir: string): string | undefined {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(dir, "package.json"), "utf-8"),
    ) as { version?: unknown };
    return typeof pkg.version === "string" ? pkg.version : undefined;
  } catch {
    return undefined;
  }
}

interface PieceRow {
  name: string;
  displayName: string;
  description: string | null;
  descriptor: unknown;
  descriptorPath: string;
  bundleFile: string;
  bundleKey: string | null;
}

function piecesOf(manifest: Manifest | null): PieceModule[] {
  return manifest?.pieces ?? [];
}

async function unpackVersion(
  ctx: ProcessorContext,
  pkg: string,
  version: string,
): Promise<{
  manifest: Manifest | null;
  files: string[];
  packageJsonVersion?: string;
  pieces: PieceRow[];
}> {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "ph-registry-"));
  try {
    const file = path.join(dir, "package.tgz");
    await downloadTarball(ctx.registryUrl, pkg, version, file);
    await assertUnpackedSize(file, pkg, version);
    const root = path.join(dir, "package");
    await fs.promises.mkdir(root);
    await extract({ file, cwd: root, strip: 1 });
    const files = listFiles(root);
    await inBatches(files, UPLOAD_CONCURRENCY, async (rel) => {
      await ctx.artifacts.putFile(
        filesKey(pkg, version, rel),
        path.join(root, rel),
        contentTypeOf(rel),
      );
    });

    const manifest = readManifest(root);
    const pieces: PieceRow[] = [];
    for (const piece of piecesOf(manifest)) {
      if (!piece.id || !piece.bundle) continue;
      const bundleDir = inside(root, piece.bundle);
      const descriptorPath =
        piece.descriptor ?? `${piece.bundle}/descriptor.json`;
      const descriptorFile = inside(root, descriptorPath);
      let descriptor: unknown = null;
      if (descriptorFile) {
        try {
          descriptor = JSON.parse(
            await fs.promises.readFile(descriptorFile, "utf-8"),
          );
        } catch {
          descriptor = null;
        }
      }
      const bundleFile = pieceTarballName(piece.id, version);
      let key: string | null = null;
      if (bundleDir && fs.existsSync(path.join(bundleDir, "package.json"))) {
        const packed = await packDir(bundleDir);
        if (packed) {
          key = bundleKey(pkg, version, bundleFile);
          await ctx.artifacts.put(key, packed, "application/gzip");
        }
      }
      pieces.push({
        name: piece.id,
        displayName: piece.name || piece.id,
        description: piece.description ?? null,
        descriptor,
        descriptorPath,
        bundleFile,
        bundleKey: key,
      });
    }
    return {
      manifest,
      files,
      packageJsonVersion: readPackageJsonVersion(root),
      pieces,
    };
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
}

async function claimPieces(
  tx: Queryable,
  pkg: string,
  pieces: PieceRow[],
): Promise<void> {
  for (const piece of pieces) {
    if (piece.name.startsWith(RESERVED_PIECE_SCOPE)) {
      throw new PermanentError(
        `piece names in the ${RESERVED_PIECE_SCOPE} scope belong to Activepieces; ${pkg} cannot claim "${piece.name}"`,
      );
    }
    await tx.query(
      `INSERT INTO registry_piece_owners (name, package) VALUES ($1, $2)
       ON CONFLICT (name) DO NOTHING`,
      [piece.name, pkg],
    );
    const owner = await tx.query<{ package: string }>(
      "SELECT package FROM registry_piece_owners WHERE name = $1",
      [piece.name],
    );
    if (owner.rows[0]?.package !== pkg) {
      throw new PermanentError(
        `piece "${piece.name}" is already published by ${owner.rows[0]?.package}; ${pkg} cannot claim it`,
      );
    }
  }
}

const indexed = new WeakSet<Queryable>();

// The storage plugin's revision of a package's manifest, read before the
// packument: what's fetched after it is at least as new
async function indexedRevision(
  db: Queryable,
  pkg: string,
): Promise<string | null> {
  if (!indexed.has(db)) {
    const table = await db.query<{ exists: boolean }>(
      "SELECT to_regclass('verdaccio_manifests') IS NOT NULL AS exists",
    );
    if (!table.rows[0]?.exists) return null;
    indexed.add(db);
  }
  const row = await db.query<{ rev: string | null }>(
    "SELECT rev FROM verdaccio_manifests WHERE name = $1",
    [pkg],
  );
  return row.rows[0]?.rev ?? null;
}

async function upsertPackage(
  tx: Queryable,
  pkg: string,
  packument: Packument,
  local: boolean,
  manifestRev: string | null,
): Promise<void> {
  const versions = Object.keys(packument.versions ?? {}).sort(compareSemver);
  const times: Record<string, string> = {};
  for (const version of versions) {
    const at = packument.time?.[version];
    if (typeof at === "string") times[version] = at;
  }
  // A worker holding an older packument than the last write must not undo it
  await tx.query(
    `INSERT INTO registry_packages
       (name, local, dist_tags, versions, times, modified, manifest_rev)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (name) DO UPDATE SET
       local = registry_packages.local OR EXCLUDED.local,
       dist_tags = EXCLUDED.dist_tags,
       versions = EXCLUDED.versions,
       times = EXCLUDED.times,
       modified = EXCLUDED.modified,
       manifest_rev = EXCLUDED.manifest_rev,
       updated_at = now()
     WHERE registry_packages.modified IS NULL OR EXCLUDED.modified IS NULL
        OR registry_packages.modified <= EXCLUDED.modified`,
    [
      pkg,
      local,
      JSON.stringify(packument["dist-tags"] ?? {}),
      JSON.stringify(versions),
      JSON.stringify(times),
      packument.time?.modified ?? null,
      manifestRev,
    ],
  );
}

// SQL NULL, not the JSON value null, so `IS NULL` checks hold
function jsonOrNull(value: unknown): string | null {
  return value == null ? null : JSON.stringify(value);
}

// Listings show the dist-tag latest once ready, else the highest ready version
async function recomputeLatest(tx: Queryable, pkg: string): Promise<void> {
  const ready = await tx.query<{ version: string }>(
    "SELECT version FROM registry_versions WHERE package = $1 AND status = 'ready'",
    [pkg],
  );
  const versions = ready.rows.map((r) => r.version).sort(compareSemver);
  const row = await tx.query<{ dist_tags: Record<string, string> }>(
    "SELECT dist_tags FROM registry_packages WHERE name = $1",
    [pkg],
  );
  const tagged = row.rows[0]?.dist_tags.latest;
  const latest = tagged && versions.includes(tagged) ? tagged : versions.at(-1);
  await tx.query(
    `UPDATE registry_packages p
        SET latest = $2, listed_manifest = v.manifest,
            listed_package_json_version = v.package_json_version
       FROM (SELECT $1::text AS name) k
       LEFT JOIN registry_versions v
         ON v.package = k.name AND v.version = $2 AND v.status = 'ready'
      WHERE p.name = k.name`,
    [pkg, latest ?? null],
  );

  // A piece's latest is the package's listed version when it ships the piece,
  // else its newest release, and a prerelease only when nothing else exists
  const pieces = await tx.query<{ name: string; version: string }>(
    "SELECT name, version FROM registry_pieces WHERE package = $1",
    [pkg],
  );
  const byName = new Map<string, string[]>();
  for (const { name, version } of pieces.rows) {
    byName.set(name, [...(byName.get(name) ?? []), version]);
  }
  const newest = new Map<string, string>();
  for (const [name, versions] of byName) {
    const releases = versions.filter((v) => !v.includes("-"));
    const pick =
      latest && versions.includes(latest)
        ? latest
        : (releases.length > 0 ? releases : versions)
            .sort(compareSemver)
            .at(-1);
    if (pick) newest.set(name, pick);
  }
  // Flips only the rows whose flag changes
  await tx.query(
    `WITH latest AS (
       SELECT * FROM unnest($2::text[], $3::text[]) AS l(name, version))
     UPDATE registry_pieces r SET is_latest = NOT r.is_latest
      WHERE r.package = $1 AND r.is_latest <> EXISTS (
        SELECT 1 FROM latest l WHERE l.name = r.name AND l.version = r.version)`,
    [pkg, [...newest.keys()], [...newest.values()]],
  );
}

async function removeVersionRows(
  tx: Queryable,
  pkg: string,
  versions: string[],
): Promise<void> {
  if (versions.length === 0) return;
  // Only this registry's packages: upstream npm retires its own versions
  await tx.query(
    `INSERT INTO registry_unpublished (package, version)
     SELECT $1, v FROM unnest($2::text[]) AS v
      WHERE EXISTS (SELECT 1 FROM registry_packages WHERE name = $1 AND local)
     ON CONFLICT DO NOTHING`,
    [pkg, versions],
  );
  await tx.query(
    "DELETE FROM registry_pieces WHERE package = $1 AND version = ANY($2)",
    [pkg, versions],
  );
  await tx.query(
    "DELETE FROM registry_versions WHERE package = $1 AND version = ANY($2)",
    [pkg, versions],
  );
}

// After the rows commit: a prefix left behind by a failure is only garbage
async function removeVersionFiles(
  ctx: ProcessorContext,
  pkg: string,
  versions: string[],
): Promise<void> {
  for (const version of versions) {
    await ctx.artifacts
      .deletePrefix(`${pkg}/${version}/`)
      .catch((err: unknown) => {
        console.error(`[registry] deleting ${pkg}@${version} files:`, err);
      });
  }
}

function publisherOf(job: Job): PublisherIdentity | undefined {
  const by = job.payload.publishedBy as PublisherIdentity | undefined;
  return by?.address ? by : undefined;
}

/** Processes one package version; `finish` commits the job with the result. */
export async function processVersion(
  ctx: ProcessorContext,
  job: Job,
  finish: (tx: Queryable) => Promise<void>,
): Promise<boolean> {
  const pkg = job.package;
  const version = job.version;
  const local = job.payload.local === true;
  const manifestRev = await indexedRevision(ctx.db, pkg);
  const packument = await fetchPackument(ctx.registryUrl, pkg);
  if (!packument?.versions?.[version]) {
    // Unpublished before it was processed
    await ctx.db.transaction(async (tx) => {
      await removeVersionRows(tx, pkg, [version]);
      if (packument) await recomputeLatest(tx, pkg);
      await finish(tx);
    });
    await removeVersionFiles(ctx, pkg, [version]);
    return false;
  }

  const unpacked = await unpackVersion(ctx, pkg, version);
  const times = packument.time ?? {};

  const isLocal = await ctx.db.transaction(async (tx) => {
    await claimPieces(tx, pkg, unpacked.pieces);
    await upsertPackage(tx, pkg, packument, local, manifestRev);
    await tx.query(
      "DELETE FROM registry_pieces WHERE package = $1 AND version = $2",
      [pkg, version],
    );
    for (const piece of unpacked.pieces) {
      await tx.query(
        `INSERT INTO registry_pieces
           (name, version, package, display_name, description, descriptor,
            descriptor_path, bundle_file, bundle_key, published_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          piece.name,
          version,
          pkg,
          piece.displayName,
          piece.description,
          jsonOrNull(piece.descriptor),
          piece.descriptorPath,
          piece.bundleFile,
          piece.bundleKey,
          times[version] ?? null,
        ],
      );
    }
    await tx.query(
      `INSERT INTO registry_versions
         (package, version, status, manifest, package_json_version, files, error)
       VALUES ($1, $2, 'ready', $3, $4, $5, NULL)
       ON CONFLICT (package, version) DO UPDATE SET
         status = 'ready', manifest = EXCLUDED.manifest,
         package_json_version = EXCLUDED.package_json_version,
         files = EXCLUDED.files, error = NULL, updated_at = now()`,
      [
        pkg,
        version,
        jsonOrNull(unpacked.manifest),
        unpacked.packageJsonVersion ?? null,
        JSON.stringify(unpacked.files),
      ],
    );
    await recomputeLatest(tx, pkg);
    await finish(tx);
    const row = await tx.query<{ local: boolean }>(
      "SELECT local FROM registry_packages WHERE name = $1",
      [pkg],
    );
    return row.rows[0]?.local ?? local;
  });

  const publishedBy = publisherOf(job);
  await ctx.events.publish({
    type: "version-ready",
    packageName: pkg,
    version,
    local: isLocal,
    notify: job.payload.notify === true,
    ...(publishedBy ? { publishedBy } : {}),
  });
  return true;
}

/** Records a version that can't be processed. */
export async function failVersion(
  ctx: ProcessorContext,
  job: Job,
  error: string,
): Promise<void> {
  await ctx.db.query(
    `INSERT INTO registry_versions (package, version, status, error)
     VALUES ($1, $2, 'failed', $3)
     ON CONFLICT (package, version) DO UPDATE SET
       status = 'failed', error = EXCLUDED.error, updated_at = now()`,
    [job.package, job.version, error],
  );
  await ctx.events.publish({
    type: "version-failed",
    packageName: job.package,
    version: job.version,
    error,
  });
}

// Aligns a package's rows with its npm metadata and queues local versions
// that haven't been processed yet
export async function syncPackage(
  ctx: ProcessorContext,
  job: Job,
  finish: (tx: Queryable) => Promise<void>,
): Promise<string[] | null> {
  const pkg = job.package;
  const manifestRev = await indexedRevision(ctx.db, pkg);
  const packument = await fetchPackument(ctx.registryUrl, pkg);
  const known = await ctx.db.query<{ version: string }>(
    "SELECT version FROM registry_versions WHERE package = $1",
    [pkg],
  );
  const listed = new Set(Object.keys(packument?.versions ?? {}));
  const removed = known.rows
    .map((r) => r.version)
    .filter((v) => !listed.has(v));

  await ctx.db.transaction(async (tx) => {
    await removeVersionRows(tx, pkg, removed);
    if (!packument) {
      await tx.query("DELETE FROM registry_packages WHERE name = $1", [pkg]);
    } else {
      await upsertPackage(
        tx,
        pkg,
        packument,
        job.payload.local === true,
        manifestRev,
      );
      await recomputeLatest(tx, pkg);
      const local = await tx.query<{ local: boolean }>(
        "SELECT local FROM registry_packages WHERE name = $1",
        [pkg],
      );
      if (local.rows[0]?.local) {
        const have = new Set(known.rows.map((r) => r.version));
        for (const version of listed) {
          if (!have.has(version)) {
            // A sweep's backfill keeps its place behind real publishes
            await enqueue(
              tx,
              "process",
              pkg,
              version,
              { local: true },
              job.priority,
            );
          }
        }
      }
    }
    await finish(tx);
  });

  await removeVersionFiles(ctx, pkg, removed);

  if (!packument || removed.length > 0) {
    const publishedBy = publisherOf(job);
    const chunks: (string[] | null)[] = [];
    if (!packument) chunks.push(null);
    for (let i = 0; packument && i < removed.length; i += REMOVED_EVENT_CHUNK) {
      chunks.push(removed.slice(i, i + REMOVED_EVENT_CHUNK));
    }
    for (const versions of chunks) {
      await ctx.events.publish({
        type: "versions-removed",
        packageName: pkg,
        versions,
        notify: job.payload.notify === true,
        ...(publishedBy ? { publishedBy } : {}),
      });
    }
  }
  return packument ? removed : null;
}
