// Pieces published inside reactor packages: indexed from the same manifests
// the package list reads, and served on their own like an Activepieces bundle.
import type { Manifest, PieceModule } from "@powerhousedao/shared";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip as gunzipCb } from "node:zlib";
import { create, list } from "tar";
import { isExactVersion } from "./cdn.js";
import { readManifest, scanPackageDirs } from "./packages.js";
import { compareSemver } from "./semver.js";

const gunzip = promisify(gunzipCb);

/** One version of a piece: which package version ships it, and where. */
export interface PieceIndexEntry {
  /** The piece name a block type refers to (the manifest entry's `id`). */
  name: string;
  displayName: string;
  description?: string;
  /** Always the version of the package that ships the piece. */
  version: string;
  packageName: string;
  packageVersion: string;
  /** Absolute package version directory; `bundle` and `descriptor` resolve against it. */
  packageDir: string;
  bundle: string;
  descriptor: string;
  publishedAt?: string;
}

/** Every known version of one piece, all shipped by the package that owns the name. */
export interface PieceVersions {
  packageName: string;
  /** Extracted package versions, keyed by version. */
  versions: Map<string, PieceIndexEntry>;
  /** Package versions verdaccio lists but the cdn cache has not extracted yet. */
  pending: Set<string>;
  /** Publish time per package version, from verdaccio metadata. */
  publishedAt: Record<string, string>;
}

export type PieceIndex = Map<string, PieceVersions>;

/** Extracts a package version into the cdn cache on demand (a `CdnCache`). */
export interface PackageExtractor {
  getFileByVersion(
    packageName: string,
    version: string,
    filePath: string,
  ): Promise<string | null>;
}

/** A piece's own metadata, as `ph build` wrote it next to the bundle. */
interface PieceDescriptor {
  displayName?: string;
  description?: string;
  logoUrl?: string;
  authors?: string[];
  categories?: string[];
  auth?: unknown;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  actions?: Record<string, DescriptorBlock>;
  triggers?: Record<string, DescriptorBlock>;
}

interface DescriptorBlock {
  displayName?: string;
  description?: string;
  /** Triggers only: POLLING | WEBHOOK | APP_WEBHOOK. */
  type?: string;
}

interface SuggestedAction {
  name: string;
  displayName: string;
  description: string;
}

interface SuggestedTrigger extends SuggestedAction {
  type: string;
}

// One catalog entry, in cloud.activepieces.com's list shape
// (`PieceMetadataSummary`), plus the package that ships it.
export interface PieceCatalogEntry {
  name: string;
  displayName: string;
  description: string;
  logoUrl: string;
  version: string;
  authors: string[];
  categories: string[];
  auth: unknown;
  actions: number;
  triggers: number;
  minimumSupportedRelease?: string;
  maximumSupportedRelease?: string;
  package: string;
  packageVersion: string;
  suggestedActions?: SuggestedAction[];
  suggestedTriggers?: SuggestedTrigger[];
}

/** One row of `GET /pieces/<name>/versions`. */
export interface PieceVersionSummary {
  version: string;
  packageVersion: string;
  publishedAt: string | null;
}

/** Piece names in this scope belong to Activepieces; no package may claim one. */
export const RESERVED_PIECE_SCOPE = "@activepieces/";

// The index is rebuilt at most this often, and immediately after a publish or
// unpublish invalidates it, so a lookup never rescans the manifests itself.
const INDEX_TTL_MS = 30_000;

const indexes = new Map<string, { index: PieceIndex; builtAt: number }>();
// A published (package, version) never changes its files, so its pieces and
// descriptors, read once, stay good until the version directory goes away.
const versionPieces = new Map<string, PieceModule[]>();
const descriptors = new Map<string, PieceDescriptor | null>();
const materializing = new Map<string, Promise<void>>();

/** Drop the cached index and descriptors — a publish or unpublish moved them. */
export function invalidatePieceIndex(): void {
  indexes.clear();
  versionPieces.clear();
  descriptors.clear();
}

function indexKey(cdnCachePath: string, storagePath?: string): string {
  return `${path.resolve(cdnCachePath)}\0${storagePath ?? ""}`;
}

function piecesOf(manifest: Manifest | null): PieceModule[] {
  return manifest?.pieces ?? [];
}

// A version dir without a readable manifest is not cached: it may still be
// extracting, and the next rebuild should look again.
function piecesAt(versionDir: string): PieceModule[] {
  const hit = versionPieces.get(versionDir);
  if (hit) return hit;
  if (!fs.existsSync(path.join(versionDir, "package.json"))) return [];
  const manifest = readManifest(versionDir);
  if (!manifest) return [];
  const pieces = piecesOf(manifest);
  versionPieces.set(versionDir, pieces);
  return pieces;
}

// Servable only once `ph build` has given the manifest entry a bundle path.
// The manifest's own `version` is ignored: the package version is the version.
function toIndexEntry(
  piece: PieceModule,
  packageName: string,
  packageVersion: string,
  packageDir: string,
  publishedAt: string | undefined,
): PieceIndexEntry | null {
  const { id, bundle } = piece;
  if (!id || !bundle) return null;
  return {
    name: id,
    displayName: piece.name || id,
    ...(piece.description ? { description: piece.description } : {}),
    version: packageVersion,
    packageName,
    packageVersion,
    packageDir,
    bundle,
    descriptor: piece.descriptor ?? `${bundle}/descriptor.json`,
    ...(publishedAt ? { publishedAt } : {}),
  };
}

interface IndexedPackage {
  name: string;
  /** Absolute package directory; version dirs sit directly under it. */
  dir: string;
  publishedAt: Record<string, string>;
}

// Adds one extracted package version's pieces; a name another package already
// claimed stays with that package. Returns the piece names this version holds.
function indexVersion(
  index: PieceIndex,
  pkg: IndexedPackage,
  version: string,
): string[] {
  const versionDir = path.join(pkg.dir, version);
  const held: string[] = [];
  for (const piece of piecesAt(versionDir)) {
    const entry = toIndexEntry(
      piece,
      pkg.name,
      version,
      versionDir,
      pkg.publishedAt[version],
    );
    if (!entry) continue;
    let line = index.get(entry.name);
    if (line && line.packageName !== pkg.name) {
      console.warn(
        `[registry] piece "${entry.name}" is claimed by both ${line.packageName} and ${pkg.name}; keeping ${line.packageName}`,
      );
      continue;
    }
    if (!line) {
      line = {
        packageName: pkg.name,
        versions: new Map(),
        pending: new Set(),
        publishedAt: pkg.publishedAt,
      };
      index.set(entry.name, line);
    }
    line.versions.set(version, entry);
    held.push(entry.name);
  }
  return held;
}

function buildPieceIndex(
  cdnCachePath: string,
  storagePath?: string,
): PieceIndex {
  const index: PieceIndex = new Map();
  for (const scanned of scanPackageDirs(cdnCachePath, storagePath)) {
    if (scanned.locallyPublished === false) continue;
    const pkg: IndexedPackage = {
      name: scanned.name,
      dir: scanned.packageDir,
      publishedAt: scanned.time ?? {},
    };
    const names = new Set<string>();
    const extracted = new Set<string>();
    for (const version of scanned.versionDirs) {
      const held = indexVersion(index, pkg, version);
      if (fs.existsSync(path.join(pkg.dir, version, "package.json"))) {
        extracted.add(version);
      }
      for (const name of held) names.add(name);
    }
    // Versions only verdaccio knows about are extracted when first asked for.
    const pending = (scanned.versions ?? []).filter((v) => !extracted.has(v));
    for (const name of names) {
      const line = index.get(name);
      for (const version of pending) line?.pending.add(version);
    }
  }
  return index;
}

/** The piece index, rebuilt only when the cached one has gone stale. */
export function pieceIndex(
  cdnCachePath: string,
  storagePath?: string,
): PieceIndex {
  const key = indexKey(cdnCachePath, storagePath);
  const cached = indexes.get(key);
  if (cached && Date.now() - cached.builtAt < INDEX_TTL_MS) return cached.index;
  const index = buildPieceIndex(cdnCachePath, storagePath);
  indexes.set(key, { index, builtAt: Date.now() });
  return index;
}

/** The highest extracted version of a piece. */
function latestOf(line: PieceVersions): PieceIndexEntry | undefined {
  let latest: PieceIndexEntry | undefined;
  for (const entry of line.versions.values()) {
    if (!latest || compareSemver(entry.version, latest.version) > 0) {
      latest = entry;
    }
  }
  return latest;
}

/** The latest version of a piece. */
export function findPiece(
  cdnCachePath: string,
  name: string,
  storagePath?: string,
): PieceIndexEntry | undefined {
  const line = pieceIndex(cdnCachePath, storagePath).get(name);
  return line ? latestOf(line) : undefined;
}

// Extracts one pending package version and indexes it into every piece line of
// that package. A failed extraction leaves the version pending.
async function materialize(
  extractor: PackageExtractor,
  cdnCachePath: string,
  index: PieceIndex,
  line: PieceVersions,
  version: string,
): Promise<void> {
  const key = `${line.packageName}@${version}`;
  const running = materializing.get(key);
  if (running) return running;
  const started = (async () => {
    try {
      await extractor.getFileByVersion(
        line.packageName,
        version,
        "package.json",
      );
    } catch (error) {
      console.error(`[registry] failed to extract ${key}:`, error);
      return;
    }
    const dir = path.join(cdnCachePath, line.packageName);
    if (!fs.existsSync(path.join(dir, version, "package.json"))) return;
    const pkg: IndexedPackage = {
      name: line.packageName,
      dir,
      publishedAt: line.publishedAt,
    };
    indexVersion(index, pkg, version);
    for (const other of index.values()) {
      if (other.packageName === line.packageName) other.pending.delete(version);
    }
  })().finally(() => materializing.delete(key));
  materializing.set(key, started);
  return started;
}

async function materializeAll(
  extractor: PackageExtractor,
  cdnCachePath: string,
  index: PieceIndex,
  line: PieceVersions,
): Promise<void> {
  await Promise.all(
    [...line.pending].map((version) =>
      materialize(extractor, cdnCachePath, index, line, version),
    ),
  );
}

function newestFirst(line: PieceVersions): PieceIndexEntry[] {
  return [...line.versions.values()].sort((a, b) =>
    compareSemver(b.version, a.version),
  );
}

/** Every version of a piece, newest first; undefined for an unknown name. */
export async function pieceVersions(
  extractor: PackageExtractor,
  cdnCachePath: string,
  name: string,
  storagePath?: string,
): Promise<PieceIndexEntry[] | undefined> {
  const index = pieceIndex(cdnCachePath, storagePath);
  const line = index.get(name);
  if (!line) return undefined;
  await materializeAll(extractor, cdnCachePath, index, line);
  return newestFirst(line);
}

export function versionSummary(entry: PieceIndexEntry): PieceVersionSummary {
  return {
    version: entry.version,
    packageVersion: entry.packageVersion,
    publishedAt: entry.publishedAt ?? null,
  };
}

export type PieceVersionLookup =
  | { kind: "found"; entry: PieceIndexEntry }
  | { kind: "unknown-piece" }
  | { kind: "unknown-version"; available: string[] };

/** One exact version of a piece, extracting its package version if needed. */
export async function findPieceVersion(
  extractor: PackageExtractor,
  cdnCachePath: string,
  name: string,
  version: string,
  storagePath?: string,
): Promise<PieceVersionLookup> {
  const index = pieceIndex(cdnCachePath, storagePath);
  const line = index.get(name);
  if (!line) return { kind: "unknown-piece" };
  if (!line.versions.has(version) && line.pending.has(version)) {
    await materialize(extractor, cdnCachePath, index, line, version);
  }
  const entry = line.versions.get(version);
  if (entry) return { kind: "found", entry };
  await materializeAll(extractor, cdnCachePath, index, line);
  return {
    kind: "unknown-version",
    available: newestFirst(line).map((e) => e.version),
  };
}

// Resolves a package-relative path and refuses one that climbs out: manifest
// paths are publisher-supplied and land straight in a file read.
function insidePackage(
  entry: PieceIndexEntry,
  relative: string,
): string | null {
  const root = path.resolve(entry.packageDir);
  const resolved = path.resolve(root, relative);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) return null;
  return resolved;
}

function readDescriptor(entry: PieceIndexEntry): PieceDescriptor | null {
  const file = insidePackage(entry, entry.descriptor);
  if (!file) return null;
  const hit = descriptors.get(file);
  if (hit !== undefined) return hit;
  let parsed: PieceDescriptor | null;
  try {
    parsed = JSON.parse(fs.readFileSync(file, "utf-8")) as PieceDescriptor;
  } catch {
    parsed = null;
  }
  descriptors.set(file, parsed);
  return parsed;
}

const count = (record: Record<string, unknown> | undefined) =>
  record ? Object.keys(record).length : 0;

// Only the fields the editor's block search reads. The cloud list types these
// as whole actions but sends the summary, and props would dwarf the listing.
function suggested(
  blocks: Record<string, DescriptorBlock> | undefined,
): SuggestedAction[] {
  return Object.entries(blocks ?? {}).map(([name, block]) => ({
    name,
    displayName: block.displayName ?? name,
    description: block.description ?? "",
  }));
}

function catalogEntry(
  entry: PieceIndexEntry,
  descriptor: PieceDescriptor,
  suggestions: boolean,
): PieceCatalogEntry {
  return {
    name: entry.name,
    displayName: descriptor.displayName || entry.displayName,
    description: descriptor.description ?? entry.description ?? "",
    logoUrl: descriptor.logoUrl ?? "",
    version: entry.version,
    authors: descriptor.authors ?? [],
    categories: descriptor.categories ?? [],
    auth: descriptor.auth ?? null,
    actions: count(descriptor.actions),
    triggers: count(descriptor.triggers),
    ...(descriptor.minimumSupportedRelease
      ? { minimumSupportedRelease: descriptor.minimumSupportedRelease }
      : {}),
    ...(descriptor.maximumSupportedRelease
      ? { maximumSupportedRelease: descriptor.maximumSupportedRelease }
      : {}),
    package: entry.packageName,
    packageVersion: entry.packageVersion,
    ...(suggestions
      ? {
          suggestedActions: suggested(descriptor.actions),
          suggestedTriggers: Object.entries(descriptor.triggers ?? {}).map(
            ([name, block]) => ({
              name,
              displayName: block.displayName ?? name,
              description: block.description ?? "",
              type: block.type ?? "",
            }),
          ),
        }
      : {}),
  };
}

/** The catalog of latest versions, sorted by display name. */
export function pieceCatalog(
  cdnCachePath: string,
  options: { storagePath?: string; suggestions?: boolean } = {},
): PieceCatalogEntry[] {
  const entries: PieceCatalogEntry[] = [];
  for (const line of pieceIndex(cdnCachePath, options.storagePath).values()) {
    const entry = latestOf(line);
    const descriptor = entry ? readDescriptor(entry) : null;
    if (!entry || !descriptor) continue;
    entries.push(catalogEntry(entry, descriptor, options.suggestions === true));
  }
  return entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** The CDN path of a file inside the package version that ships the piece. */
function cdnPath(entry: PieceIndexEntry, relative: string): string {
  return `/-/cdn/${entry.packageName}@${entry.packageVersion}/${relative}`;
}

/** The tarball filename cdn.activepieces.com would use for the same piece. */
export function pieceTarballName(name: string, version: string): string {
  return `${name.replace("/", "-")}-${version}.tgz`;
}

export function pieceTarballPath(entry: PieceIndexEntry): string {
  return `/-/pieces/bundled/${pieceTarballName(entry.name, entry.version)}`;
}

/** One piece version: what provides it, and where its descriptor and bundle are. */
export function pieceDetail(
  entry: PieceIndexEntry,
  origin: string,
): Record<string, unknown> | null {
  const descriptor = readDescriptor(entry);
  if (!descriptor) return null;
  // The descriptor verbatim, so `fetchPieceDetail` reads this endpoint exactly
  // as it reads the cloud one; the provider fields are additions.
  return {
    ...descriptor,
    name: entry.name,
    version: entry.version,
    package: entry.packageName,
    packageVersion: entry.packageVersion,
    descriptorUrl: `${origin}${cdnPath(entry, entry.descriptor)}`,
    bundleUrl: `${origin}${pieceTarballPath(entry)}`,
  };
}

// The filename flattens the name's slash and the version may hold dashes, so
// every piece whose flattened name prefixes it is a candidate.
export async function findPieceByTarball(
  extractor: PackageExtractor,
  cdnCachePath: string,
  filename: string,
  storagePath?: string,
): Promise<PieceIndexEntry | undefined> {
  if (!filename.endsWith(".tgz")) return undefined;
  const stem = filename.slice(0, -".tgz".length);
  for (const name of pieceIndex(cdnCachePath, storagePath).keys()) {
    const prefix = `${name.replace("/", "-")}-`;
    if (!stem.startsWith(prefix)) continue;
    const version = stem.slice(prefix.length);
    if (!isExactVersion(version)) continue;
    const found = await findPieceVersion(
      extractor,
      cdnCachePath,
      name,
      version,
      storagePath,
    );
    if (found.kind === "found") return found.entry;
  }
  return undefined;
}

function listFiles(dir: string, prefix = ""): string[] {
  const files: string[] = [];
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${item.name}` : item.name;
    if (item.isDirectory()) {
      files.push(...listFiles(path.join(dir, item.name), rel));
    } else if (item.isFile()) {
      files.push(rel);
    }
  }
  return files.sort();
}

const cuts = new Map<string, Promise<string | null>>();

async function cutTarball(
  entry: PieceIndexEntry,
  pieceDir: string,
  target: string,
): Promise<string | null> {
  const files = listFiles(pieceDir);
  if (files.length === 0) return null;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const tmp = `${target}.tmp-${crypto.randomUUID()}`;
  try {
    // `prefix` and `portable` give the npm-bundle layout the reactor's own
    // extractor strips a root segment from, byte-stable across build hosts.
    await create(
      {
        file: tmp,
        gzip: true,
        cwd: pieceDir,
        prefix: "package",
        portable: true,
      },
      files,
    );
    fs.renameSync(tmp, target);
  } catch (error) {
    fs.rmSync(tmp, { force: true });
    console.error(`[registry] failed to pack piece ${entry.name}:`, error);
    return null;
  }
  return target;
}

// The piece directory as a gzipped tarball, cut out of the extracted package
// version on first request and cached beside it. Null when it cannot be built.
export async function pieceTarball(
  entry: PieceIndexEntry,
): Promise<string | null> {
  const pieceDir = insidePackage(entry, entry.bundle);
  if (!pieceDir || !fs.existsSync(path.join(pieceDir, "package.json"))) {
    return null;
  }
  const target = path.join(
    entry.packageDir,
    ".piece-bundles",
    pieceTarballName(entry.name, entry.version),
  );
  if (fs.existsSync(target)) return target;

  const pending = cuts.get(target);
  if (pending) return pending;
  const started = cutTarball(entry, pieceDir, target).finally(() => {
    cuts.delete(target);
  });
  cuts.set(target, started);
  return started;
}

// Manifest locations inside a published tarball, in the order readManifest
// resolves them, so the publish check sees the manifest the index will.
const MANIFEST_PATHS = [
  "powerhouse.manifest.json",
  "cdn/powerhouse.manifest.json",
  "dist/powerhouse.manifest.json",
];

// Bounds what a publish can inflate to before we look for its manifest; past
// it the check gives up rather than the registry.
const MAX_TARBALL_BYTES = 128 * 1024 * 1024;

function stripRoot(entryPath: string): string {
  return entryPath.replace(/^[^/]+\//, "");
}

function manifestsInTar(tar: Buffer): Map<string, string> {
  const found = new Map<string, string>();
  const parser = list({
    sync: true,
    filter: (entryPath: string) =>
      MANIFEST_PATHS.includes(stripRoot(entryPath)),
    onReadEntry: (entry) => {
      const chunks: Buffer[] = [];
      entry.on("data", (chunk: Buffer) => chunks.push(Buffer.from(chunk)));
      entry.on("end", () => {
        found.set(
          stripRoot(String(entry.path)),
          Buffer.concat(chunks).toString("utf-8"),
        );
      });
    },
  });
  parser.end(tar);
  return found;
}

/** The piece names a published tarball claims; empty when it claims none. */
export async function pieceNamesInTarball(tgz: Buffer): Promise<string[]> {
  let manifests: Map<string, string>;
  try {
    const tar = await gunzip(tgz, { maxOutputLength: MAX_TARBALL_BYTES });
    manifests = manifestsInTar(tar);
  } catch {
    return [];
  }
  for (const candidate of MANIFEST_PATHS) {
    const raw = manifests.get(candidate);
    if (raw === undefined) continue;
    try {
      const manifest = JSON.parse(raw) as Manifest;
      return piecesOf(manifest)
        .map((piece) => piece.id)
        .filter((id): id is string => typeof id === "string" && id !== "");
    } catch {
      return [];
    }
  }
  return [];
}
