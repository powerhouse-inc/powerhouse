// Response shapes for pieces published inside reactor packages, in the forms
// cloud.activepieces.com uses so the engine reads both the same way.
import type { Manifest } from "@powerhousedao/shared";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { list } from "tar";
import type { PieceRow } from "./catalog.js";

export { pieceTarballName, RESERVED_PIECE_SCOPE } from "./processor.js";

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

function descriptorOf(row: PieceRow): PieceDescriptor | null {
  return row.descriptor as PieceDescriptor | null;
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
  row: PieceRow,
  descriptor: PieceDescriptor,
  suggestions: boolean,
): PieceCatalogEntry {
  return {
    name: row.name,
    displayName: descriptor.displayName || row.displayName,
    description: descriptor.description ?? row.description ?? "",
    logoUrl: descriptor.logoUrl ?? "",
    version: row.version,
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
    package: row.package,
    packageVersion: row.version,
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
  rows: PieceRow[],
  suggestions: boolean,
): PieceCatalogEntry[] {
  const entries: PieceCatalogEntry[] = [];
  for (const row of rows) {
    const descriptor = descriptorOf(row);
    if (descriptor) entries.push(catalogEntry(row, descriptor, suggestions));
  }
  return entries.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function versionSummary(row: PieceRow): PieceVersionSummary {
  return {
    version: row.version,
    packageVersion: row.version,
    publishedAt: row.publishedAt
      ? new Date(row.publishedAt).toISOString()
      : null,
  };
}

export function pieceTarballPath(row: PieceRow): string {
  return `/-/pieces/bundled/${row.name}/${row.version}.tgz`;
}

/** One piece version: what provides it, and where its descriptor and bundle are. */
export function pieceDetail(
  row: PieceRow,
  origin: string,
): Record<string, unknown> | null {
  const descriptor = descriptorOf(row);
  if (!descriptor) return null;
  // The descriptor verbatim, so `fetchPieceDetail` reads this endpoint exactly
  // as it reads the cloud one; the provider fields are additions.
  return {
    ...descriptor,
    name: row.name,
    version: row.version,
    package: row.package,
    packageVersion: row.version,
    descriptorUrl: `${origin}/-/cdn/${row.package}@${row.version}/${row.descriptorPath}`,
    bundleUrl: `${origin}${pieceTarballPath(row)}`,
  };
}

// Manifest locations inside a published tarball, in the order readManifest
// resolves them, so the publish check sees the manifest the processor will.
const MANIFEST_PATHS = [
  "powerhouse.manifest.json",
  "cdn/powerhouse.manifest.json",
  "dist/powerhouse.manifest.json",
];

// Past this the publish check is skipped; the worker still enforces claims
const MAX_CHECKED_TARBALL_BYTES = 32 * 1024 * 1024;
const CHUNK_BYTES = 64 * 1024;

function stripRoot(entryPath: string): string {
  return entryPath.replace(/^[^/]+\//, "");
}

// Parses in chunks so a large publish doesn't hold the event loop
async function manifestsInTarball(tgz: Buffer): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  const parser = list({
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
  const chunks = function* () {
    for (let i = 0; i < tgz.length; i += CHUNK_BYTES) {
      yield tgz.subarray(i, i + CHUNK_BYTES);
    }
  };
  await pipeline(Readable.from(chunks()), parser);
  return found;
}

/** The piece names a published tarball claims; empty when it claims none. */
export async function pieceNamesInTarball(tgz: Buffer): Promise<string[]> {
  if (tgz.length > MAX_CHECKED_TARBALL_BYTES) return [];
  let manifests: Map<string, string>;
  try {
    manifests = await manifestsInTarball(tgz);
  } catch {
    return [];
  }
  for (const candidate of MANIFEST_PATHS) {
    const raw = manifests.get(candidate);
    if (raw === undefined) continue;
    try {
      const manifest = JSON.parse(raw) as Manifest;
      return (manifest.pieces ?? [])
        .map((piece) => piece.id)
        .filter((id): id is string => typeof id === "string" && id !== "");
    } catch {
      return [];
    }
  }
  return [];
}
