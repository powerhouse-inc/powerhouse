// Pieces published inside reactor packages: indexed from the same manifests
// the package list reads, and served on their own like an Activepieces bundle.
import type { Manifest, PieceModule } from "@powerhousedao/shared";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { gunzip as gunzipCb } from "node:zlib";
import { create, list } from "tar";
import { scanPackageDirs } from "./packages.js";

const gunzip = promisify(gunzipCb);

/** Where a piece lives: which package ships it, and where inside that package. */
export interface PieceIndexEntry {
  /** The piece name a block type refers to (the manifest entry's `id`). */
  name: string;
  displayName: string;
  description?: string;
  version: string;
  packageName: string;
  packageVersion?: string;
  /** Absolute package directory; `bundle` and `descriptor` resolve against it. */
  packageDir: string;
  bundle: string;
  descriptor: string;
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
  packageVersion?: string;
  suggestedActions?: SuggestedAction[];
  suggestedTriggers?: SuggestedTrigger[];
}

// The index is rebuilt at most this often, and immediately after a publish or
// unpublish invalidates it, so a lookup never rescans the manifests itself.
const INDEX_TTL_MS = 30_000;

type PieceIndex = Map<string, PieceIndexEntry>;

const indexes = new Map<string, { index: PieceIndex; builtAt: number }>();
// A published (package, version) never changes its files, so a descriptor read
// once stays good until the version directory itself goes away.
const descriptors = new Map<string, PieceDescriptor | null>();

/** Drop the cached index and descriptors — a publish or unpublish moved them. */
export function invalidatePieceIndex(): void {
  indexes.clear();
  descriptors.clear();
}

function indexKey(cdnCachePath: string, storagePath?: string): string {
  return `${path.resolve(cdnCachePath)}\0${storagePath ?? ""}`;
}

function piecesOf(manifest: Manifest | null): PieceModule[] {
  return manifest?.pieces ?? [];
}

// A piece is servable only once `ph build` has enriched its manifest entry:
// without a version and a bundle path there is nothing to hand a reactor.
function toIndexEntry(
  piece: PieceModule,
  packageName: string,
  packageVersion: string | undefined,
  packageDir: string,
): PieceIndexEntry | null {
  const { id, version, bundle } = piece;
  if (!id || !version || !bundle) return null;
  return {
    name: id,
    displayName: piece.name || id,
    ...(piece.description ? { description: piece.description } : {}),
    version,
    packageName,
    packageVersion,
    packageDir,
    bundle,
    descriptor: piece.descriptor ?? `${bundle}/descriptor.json`,
  };
}

function buildPieceIndex(
  cdnCachePath: string,
  storagePath?: string,
): PieceIndex {
  const index: PieceIndex = new Map();
  for (const pkg of scanPackageDirs(cdnCachePath, storagePath)) {
    if (pkg.locallyPublished === false) continue;
    for (const piece of piecesOf(pkg.manifest)) {
      const entry = toIndexEntry(piece, pkg.name, pkg.version, pkg.manifestDir);
      if (!entry) continue;
      const claimed = index.get(entry.name);
      if (claimed && claimed.packageName !== entry.packageName) {
        console.warn(
          `[registry] piece "${entry.name}" is claimed by both ${claimed.packageName} and ${entry.packageName}; keeping ${claimed.packageName}`,
        );
        continue;
      }
      index.set(entry.name, entry);
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

export function findPiece(
  cdnCachePath: string,
  name: string,
  storagePath?: string,
): PieceIndexEntry | undefined {
  return pieceIndex(cdnCachePath, storagePath).get(name);
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

/** The catalog, sorted by display name the way the editor renders it. */
export function pieceCatalog(
  cdnCachePath: string,
  options: { storagePath?: string; suggestions?: boolean } = {},
): PieceCatalogEntry[] {
  const entries: PieceCatalogEntry[] = [];
  for (const entry of pieceIndex(cdnCachePath, options.storagePath).values()) {
    const descriptor = readDescriptor(entry);
    if (!descriptor) continue;
    entries.push(catalogEntry(entry, descriptor, options.suggestions === true));
  }
  return entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/** The CDN path of a file inside the package that ships the piece. */
function cdnPath(entry: PieceIndexEntry, relative: string): string {
  const spec = entry.packageVersion
    ? `${entry.packageName}@${entry.packageVersion}`
    : entry.packageName;
  return `/-/cdn/${spec}/${relative}`;
}

/** The tarball filename cdn.activepieces.com would use for the same piece. */
export function pieceTarballName(name: string, version: string): string {
  return `${name.replace("/", "-")}-${version}.tgz`;
}

export function pieceTarballPath(entry: PieceIndexEntry): string {
  return `/-/pieces/bundled/${pieceTarballName(entry.name, entry.version)}`;
}

/** One piece: what provides it, and where its descriptor and bundle are. */
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

export function findPieceByTarball(
  cdnCachePath: string,
  filename: string,
  storagePath?: string,
): PieceIndexEntry | undefined {
  for (const entry of pieceIndex(cdnCachePath, storagePath).values()) {
    if (pieceTarballName(entry.name, entry.version) === filename) return entry;
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
// on first request and cached beside it. Null when it cannot be built.
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
